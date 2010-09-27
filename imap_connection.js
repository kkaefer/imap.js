var sys = require('sys');
var net = require('net');
var crypto = require('crypto');

var util = require('./util');
var imap_response = require('./imap_response');


var CRLF = "\r\n";

var debugLevel = 0;
if ("NODE_DEBUG" in process.env) debugLevel = 1;

function debug (x) {
  //if (debugLevel > 0) {
    process.binding('stdio').writeError(x + "\n");
  //}
}







function IMAPConnection () {
  this._callbacks = {};
  this._queue = [];

  this.addListener('data', this.response);
  this.addListener('connect', this.makeSecure);
  this.addListener('secure', this.authenticate);
  this.addListener('authenticate', this.authenticated);
};
util.inherits(IMAPConnection, net.Stream);

IMAPConnection.prototype.tag = 1;
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
  while (args = this._queue.shift()) {
    this.message.apply(this, args);
  }
};

IMAPConnection.prototype.write = function(chunk) {
  // Write debug messages when the chunk is a string.
  if (chunk.replace) {
    var data = chunk.split(CRLF);
    data.pop();
    debug('-> ' + data.join(CRLF + '-> '));
  }

  return this.parent.write.apply(this, arguments);
};

IMAPConnection.prototype.message = function(data, callback) {
  if (this.paused) {
    this._queue.push(arguments);
  }
  else {
    var tag = this.nextTag();
    if (callback) {
      this._callbacks[tag] = callback;
    }
    return this.write([ tag, ' ', data, '\r\n' ].join(''));
  }
};

IMAPConnection.prototype.response = function(chunk) {
  // chunk is a Buffer
  
  
  
  
  // Debug output
  var data = chunk.toString('ascii').split(CRLF);
  data.pop(); // remove the trailing crlf
  debug('<- ' + data.join(CRLF + '<- '));

  // This is horrible processing. We need a proper parser instead.
  var last = data[data.length - 1];
  var parts = last.split(' ', 2);
  var tag = parts[0];
  if (tag in this._callbacks) {
    this._callbacks[tag].call(this, data);
  }
};

IMAPConnection.prototype.connect = function() {
  debug('Trying to connect... ('+this.host+', '+this.port+')');
  return this.parent.connect.call(this, this.port, this.host);
};

IMAPConnection.prototype.makeSecure = function() {
  debug('Connected. Setting secure now.');
  var credentials = crypto.createCredentials({});
  this.setSecure(credentials);
};

IMAPConnection.prototype.authenticate = function() {
  debug('Connection secured. Logging in now.');
  this.message('LOGIN ' + this.username + ' ' + this.password, function() {
    this.emit('authenticate');
  });
};

IMAPConnection.prototype.end = function() {
  var args = arguments;
  this.message('LOGOUT', function() {
    debug('Logged out.');
    this.parent.end.apply(this, args);
  });
};

IMAPConnection.prototype.authenticated = function() {
  debug('Connection authenticated.');
  this.unpause();
};

exports.IMAPConnection = IMAPConnection;
exports.connect = function(options) {
  var c = new IMAPConnection();
  for (var key in options) c[key] = options[key];
  c.connect();
  return c;
};
