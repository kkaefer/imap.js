var net = require('net');
var util = require('util');
var crypto = require('crypto');
var Buffer = require('buffer').Buffer;

var StreamingBuffer = require('./lib/streamingbuffer').StreamingBuffer;
var IMAPResponse = require('./imap_response');



function IMAPConnection(config) {
  net.Stream.call(this);

  for (var key in config) {
    this[key] = config[key];
  }

  this.commands = [];
  this.commandQueue = [];
  this.stream = new StreamingBuffer();

  this.response = [];
  this.line = [];
  this.line.text = '';

  this.on('data', this.receivedData);
  this.setSecurityHandlers();

  console.warn('Trying to connect... (' + this.host + ', ' + this.port + ')');
  this.connect(this.port, this.host);

  // Start reading lines from the stream "loop".
  this.stream.requestNextLine(this.retrieveLine, this);
};
util.inherits(IMAPConnection, net.Stream);

IMAPConnection.prototype.tag = 1;
IMAPConnection.prototype.host = 'localhost';
IMAPConnection.prototype.port = 993;
IMAPConnection.prototype.username = 'anonymous';
IMAPConnection.prototype.password = 'anonymous';

IMAPConnection.prototype.nextTag = function() {
  return 'N' + (this.tag++);
};

IMAPConnection.prototype.message = function(command, complete, cont) {
  if (typeof command === 'string') {
    command = {
      'command': command,
      'complete': complete,
      'continue': cont
    };
  }
  
  command.tag = this.nextTag();
  this.commands.push(command);

  var output = command.tag + ' ' + command.command + '\r\n';
  return this.write(output);
};

IMAPConnection.prototype.write = function(data) {
  if (data instanceof Buffer) {
    console.log('$->', data);
  }
  else {
    console.log('$->', util.inspect(data));
  }
  net.Stream.prototype.write.call(this, data);
};

IMAPConnection.prototype.receivedData = function(chunk) {
  console.log('$<-', util.inspect(chunk.toString()));
  this.stream.push(chunk);
};

IMAPConnection.prototype.makeSecure = function() {
  console.warn('Setting secure now.');
  var credentials = crypto.createCredentials({});
  this.setSecure(credentials);
};

IMAPConnection.prototype.end = function() {
  var args = arguments;
  this.message('LOGOUT', function() {
    console.warn('Logged out.');
    // net.Stream.prototype.end.apply(this, args);
  });
};

IMAPConnection.prototype.retrieveLine = function(line) {
  // Check for literals embedded in this line.
  if (line[line.length - 3] === '}') {
    this.line.text += line.substring(0, line.length - 2);

    // There's a literal in this line. We need to receive that and continue on
    // the next line to get the overall line.
    var bytes = parseInt(line.substring(line.lastIndexOf('{') + 1, line.length - 3), 10);
    var chunks = [];
    var self = this;
    this.stream.request(bytes, function(chunk) {
      chunks.push(chunk);
    }, function() {
      // All chunks from this literal have been put in the chunks array.
      self.line.push(chunks);

      // We need another line to complete the logical line.
      self.stream.requestNextLine(self.retrieveLine, self);
    });
  }
  else {
    // This line is finished.
    this.line.text += line;

    if (this.commands.length) {
      // A command is currently in progress, so this belongs to the response.
      this.addLineToTaggedResponse(this.line);
    }
    else {
      // There is no command in progress. This is an unsolicited message.
      IMAPResponse.parseLine(this.line);
      this.emit('untagged', this.line);
    }

    this.line = [];
    this.line.text = '';
    this.stream.requestNextLine(this.retrieveLine, this);
  }
};

IMAPConnection.prototype.addLineToTaggedResponse = function(line) {
  switch (line.text[0]) {
    case '*':
      // Data line. There are more lines to be expected in this response.
      this.response.push(line);
      break;

    case '+':
      // Continue request.
      var response = this.response;
      var command = this.commands[0];
      if (command['continue']) {
        var self = this;
        process.nextTick(function() { command['continue'].call(self, response, line); });
      }
      break;

    default:
      // This tagged response is finished.
      var parts = line.text.split(' ', 2);
      var response = this.response;
      var command = this.commands.shift();

      response.tag = parts[0];
      response.status = parts[1];
      response.done = line;
      response.command = command.command;

      if (command['complete']) {
        var self = this;
        process.nextTick(function() { command['complete'].call(self, response); });
      }

      // DEBUG
      // printResponse.call(this, this.response);

      this.response = [];
      break;
  }

  // Make the connection get the next response.
  this.stream.requestNextLine(this.retrieveLine, this);
};

IMAPConnection.prototype.parse = function(response) {
  response.forEach(IMAPResponse.parseLine);
  IMAPResponse.parseLine(response.done);
};

IMAPConnection.prototype.setSecurityHandlers = function() {
  switch (this.security) {
    case 'STARTTLS':
      this.once('untagged', function(line) {
        this.hasCapability('STARTTLS', this.startTLS);
      });
      break;
    case 'TLS':
      this.on('secure', this.login);
      this.on('connect', this.makeSecure);
      break;
    case 'PLAIN':
      this.once('untagged', function() {
        this.hasCapability('AUTH=PLAIN', this.authenticate);
      });
      break;
    default:
      this.emit('error', 'You need to set a security method.');
  }
};

IMAPConnection.prototype.startTLS = function() {
  this.message('STARTTLS', function(response) {
    if (response.status === 'OK') {
      this.on('secure', this.login);
      this.makeSecure();
    }
  });
};

IMAPConnection.prototype.login = function() {
  this.message({
    'command': 'LOGIN ' + this.username + ' ' + this.password,
    'complete': this.finishAuthentication
  });
};

IMAPConnection.prototype.finishAuthentication = function(response) {
  if (response.status === 'OK') {
    console.warn('Connection authenticated.');
    this.emit('authenticated', response);
  }
  else {
    console.warn('Authentication failed.');
    this.emit('authenticationError', response);
  }
};

IMAPConnection.prototype.authenticate = function() {
  // Send authentication request.
  this.message({
    'command': 'AUTHENTICATE PLAIN',
    'complete': this.finishAuthentication,
    'continue': function(response, line) {
      var output = new Buffer('\u0000' + this.username + '\u0000' + this.password).toString('base64') + '\r\n';
      this.write(output);
    }
  });
};

IMAPConnection.prototype.hasCapability = function(capability, success, failure) {
  capability = capability.split('=');
  var name = capability[0];
  var value = capability[1];
  this.message('CAPABILITY', function(response) {
    this.parse(response);
    for (var i = 0; i < response.length; i++) {
      if (response[i].type === 'capability' && response[i].capabilities[name]) {
        if (value && response[i].capabilities[name].indexOf(value) < 0) {
          continue;
        }
        else {
          success.call(this, response);
          return;
        }
      }
    }
    if (failure) {
      failure.call(this, response);
    }
  });
};


exports.IMAPConnection = IMAPConnection;
exports.IMAPResponse = IMAPResponse;
