var net = require('net');
var util = require('util');
var crypto = require('crypto');

var StreamingBuffer = require('./lib/streamingbuffer').StreamingBuffer;
var IMAPResponse = require('./imap_response');


function printResponse(response) {
  console.warn('## -> ' + util.inspect(response.command));
  
  response.forEach(function(l) {
    console.warn('## <- ' + util.inspect(l.text));

    if (l.length) {
      console.warn('##   and ' + l.map(function(b) {
        return 'Buffer(' + b.reduce(function(prev, cur){
          return prev + cur.length;
        }, 0) + ')';
      }).join(', '));

      console.warn(l.map(function(b, i) {
        var prompt = '##   ' + i + ': ';
        var str = b.reduce(function(prev, cur) { return prev + cur.toString('ascii'); }, '').split('\r\n');
        return str.map(function(s, j) {
          return prompt + util.inspect(s + (j < str.length - 1 ? '\r\n' : ''));
        }).join('\n');
      }).join('\r\n   '));
    }
  });
  console.warn('## <- ' + util.inspect(response.done.text) + '\n');
}

function IMAPConnection(config) {
  this.parent.call(this);
  
  for (var key in config) {
    this[key] = config[key];
  }

  this.commands = {};
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
IMAPConnection.prototype.__proto__ = net.Stream.prototype;
IMAPConnection.prototype.parent = net.Stream;

IMAPConnection.prototype.tag = 1;
IMAPConnection.prototype.host = 'localhost';
IMAPConnection.prototype.port = 993;
IMAPConnection.prototype.username = 'anonymous';
IMAPConnection.prototype.password = 'anonymous';
IMAPConnection.prototype.paused = false;

IMAPConnection.prototype.nextTag = function() {
  return 'N' + (this.tag++);
};

IMAPConnection.prototype.pause = function() {
  this.paused = true;
};

IMAPConnection.prototype.unpause = function() {
  this.paused = false;

  // Send out all queued messages in the order they came in.
  var args;
  while (args = this.commandQueue.shift()) {
    this.message.apply(this, args);
  }
};

IMAPConnection.prototype.message = function(data, callback) {
  if (this.paused) {
    this.commandQueue.push(arguments);
  }
  else {
    var tag = this.nextTag();
    var output = tag + ' ' + data + '\r\n';
    if (callback) {
      this.commands[tag] = { command: output, callback: callback };
    }
    console.log('$->', util.inspect(output));
    return this.write(output);
  }
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
    this.parent.prototype.end.apply(this, args);
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
    
    if (Object.keys(this.commands).length) {
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
  if (line.text[0] !== '*' && line.text[0] !== '+') {
    // This response is finished.
    var parts = line.text.split(' ', 2);
    this.response.tag = parts[0];
    this.response.status = parts[1];
    this.response.done = line;

    if (this.response.tag in this.commands) {
      this.response.command = this.commands[this.response.tag].command;
      var callback = this.commands[this.response.tag].callback;
      var self = this;
      var response = this.response;
      delete this.commands[this.response.tag];
      process.nextTick(function() { callback.call(self, response); });
    }

    // DEBUG
    // printResponse.call(this, this.response);

    this.response = [];
  }
  else {
    // There are more lines to be expected in this response.
    this.response.push(line);
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
  this.message('LOGIN ' + this.username + ' ' + this.password, function(response) {
    this.parse(response);

    if (response.status === 'OK') {
      console.warn('Connection authenticated.');
      this.unpause();
      this.emit('authenticated', response);
    }
    else {
      console.warn('Authentication failed.');
      this.emit('authenticationError', response);
    }
  });
};

IMAPConnection.prototype.authenticate = function() {
  // send authentication request.
  console.log('authenticate');
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
