var sys = require('sys');
var net = require('net');
var crypto = require('crypto');

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
  
  this.setEncoding('ascii');
  this.addListener('data', this.response);
  this.addListener('connect', this.makeSecure);
  this.addListener('secure', this.authenticate);
  this.addListener('authenticate', this.authenticated);
};
sys.inherits(IMAPConnection, net.Stream);

IMAPConnection.prototype.tag = 1;
IMAPConnection.prototype.port = 993;
IMAPConnection.prototype.username = 'anonymous';
IMAPConnection.prototype.password = 'anonymous';
IMAPConnection.prototype.processingQueue = false;

IMAPConnection.prototype.nextTag = function() {
  return 'N' + (this.tag++);
};

IMAPConnection.prototype.write = function(chunk) {
  if (chunk.replace) {
    var data = chunk.split(CRLF);
    data.pop();
    debug('-> ' + data.join(CRLF + '-> '));
  }
  return net.Stream.prototype.write.apply(this, arguments);
};

IMAPConnection.prototype.message = function(data, callback) {
  var tag = this.nextTag();
  if (callback) {
    this._callbacks[tag] = callback;
  }
  return this.write(tag + ' ' + data + CRLF);
};

IMAPConnection.prototype.processQueue = function() {
  if (!this.processingQueue && this._queue.length) {
    var message = this._queue.shift();
    var data = message[0], callback = message[1];
    this.processingQueue = true;
    
    this.message(data, function() {
      this.processingQueue = false;
      this.processQueue();
      if (callback) {
        callback.apply(this, arguments);
      }
    });
  }
};

IMAPConnection.prototype.enqueue = function(data, callback) {
  this._queue.push([data, callback]);
  this.processQueue();
};

IMAPConnection.prototype.response = function(chunk) {
  var data = chunk.split(CRLF);
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
  return net.Stream.prototype.connect.call(this, this.port, this.host);
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
  debug('Logging out now.');
  this.message('LOGOUT', function() {
    net.Stream.prototype.end.apply(this, args);
  });
};

IMAPConnection.prototype.authenticated = function() {
  debug('Connection authenticated.');
  this.processQueue();
};

exports.IMAPConnection = IMAPConnection;
exports.connect = function(options) {
  var c = new IMAPConnection();
  for (var key in options) c[key] = options[key];
  c.connect();
  return c;
};
