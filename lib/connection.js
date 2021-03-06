var net = require('net');
var util = require('util');
var crypto = require('crypto');
var Buffer = require('buffer').Buffer;

var utf7 = require('./utf7');
var StreamingBuffer = require('./streamingbuffer').StreamingBuffer;
var imap = require('./imap');
var parse = require('./parse');

var dbg = false;


function Connection(config) {
  net.Stream.call(this, { allowHalfOpen: true });

  for (var key in config) {
    this[key] = config[key];
  }

  this.retrieveLine = this.retrieveLine.bind(this);

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
  this.stream.getLine(this.retrieveLine);
};
util.inherits(Connection, net.Stream);
imap.Connection = Connection;


Connection.prototype.tag = 1;
Connection.prototype.host = 'localhost';
Connection.prototype.port = 993;
Connection.prototype.username = 'anonymous';
Connection.prototype.password = 'anonymous';

Connection.prototype.nextTag = function() {
  return 'N' + (this.tag++);
};

Connection.prototype.message = function(command, complete, cont, line) {
  var tag = this.nextTag();

  if (typeof complete === 'object') {
    cont = complete['continue'];
    line = complete['line'];
    complete = complete['complete'];
  }

  this.commands.push({
    'command': command,
    'complete': complete,
    'continue': cont,
    'line': line
  });

  var output = tag + ' ' + command + '\r\n';
  return this.write(output);
};

Connection.prototype.write = function(data) {
  if (dbg && typeof data === 'string')
    console.log('$-> ' + util.inspect(data));

  net.Stream.prototype.write.call(this, data);
};

Connection.prototype.receivedData = function(chunk) {
  if (dbg) {
    var lines = chunk.toString().split('\r\n');
    if (lines[lines.length - 1] === '') lines.pop();
    console.log(lines.map(function(line, j) {
      return '$<- ' + util.inspect(line + '\r\n');
    }).join('\n'));
  }

  this.stream.push(chunk);
};

Connection.prototype.makeSecure = function() {
  console.warn('Setting secure now.');
  var credentials = crypto.createCredentials({});
  this.setSecure(credentials);
};

Connection.prototype.end = function() {
  this.message('LOGOUT', function() {
    console.warn('Logged out.');
    net.Stream.prototype.end.call(this);
  });
};

Connection.prototype.retrieveLine = function(line) {
  // Check for literals embedded in this line.
  if (line[line.length - 3] === '}') {
    this.line.text += line.substring(0, line.length - 2);

    // There's a literal in this line. We need to receive that and continue on
    // the next line to get the overall line.
    var bytes = parseInt(line.substring(line.lastIndexOf('{') + 1, line.length - 3), 10);
    var chunks = [];
    var self = this;

    this.stream.getBytes(bytes, function(chunk) {
      chunks.push(chunk);
    }, function() {
      // All chunks from this literal have been put in the chunks array.
      self.line.push(chunks);
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
      parse.line(this.line);
      this.emit('untagged', this.line);
    }

    this.line = [];
    this.line.text = '';
  }

  this.stream.getLine(this.retrieveLine);
};

Connection.prototype.addLineToTaggedResponse = function(line) {
  switch (line.text[0]) {
    case '*':
      // Data line. There are more lines to be expected in this response.
      if (this.commands[0]['line']) {
        var callback = this.commands[0]['line'];
        var connection = this;
        var response = this.response;
        process.nextTick(function() {
          callback.call(connection, response, line);
        });
      }
      else {
        this.response.push(line);
      }
      break;

    case '+':
      // Continue request.
      if (this.commands[0]['continue']) {
        var callback = this.commands[0]['continue'];
        var connection = this;
        var response = this.response;
        process.nextTick(function() {
          callback.call(connection, response, line);
        });
      }
      // Ignore the continue request otherwise.
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
};

Connection.prototype.parse = function(response) {
  response.forEach(parse.line);
  parse.line(response.done);
};

Connection.prototype.setSecurityHandlers = function() {
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

Connection.prototype.startTLS = function() {
  this.message('STARTTLS', function(response) {
    if (response.status === 'OK') {
      this.on('secure', this.login);
      this.makeSecure();
    }
  });
};

Connection.prototype.login = function() {
  this.message('LOGIN ' + this.username + ' ' + this.password, this.finishAuthentication);
};

Connection.prototype.authenticate = function() {
  // Send authentication request.
  this.message('AUTHENTICATE PLAIN', {
    'complete': this.finishAuthentication,
    'continue': function(response, line) {
      var output = new Buffer('\u0000' + this.username + '\u0000' + this.password).toString('base64') + '\r\n';
      this.write(output);
    }
  });
};

Connection.prototype.finishAuthentication = function(response) {
  if (response.status === 'OK') {
    console.warn('Connection authenticated.');
    var account = new imap.Account(this);
    this.emit('authenticated', account);
  }
  else {
    console.warn('Authentication failed.');
    this.emit('authenticationError', response);
  }
};

Connection.prototype.hasCapability = function(capability, success, failure) {
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

Connection.prototype.select = function(mailbox, callback) {
  this.message('SELECT "' + utf7.utf8to7(mailbox) + '"', function() {
    this.mailbox = mailbox;
    callback.call(this);
  });
};