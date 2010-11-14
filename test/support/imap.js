var util = require('util');
var flow = require('flow');
var imap = exports;


imap.SEQUENTIAL = 0x0000;
imap.PARALLEL = 0x0001;
imap.RANGED = 0x0002;

imap.DEFAULT = imap.SEQUENTIAL;

imap.flowType = function(flags) {
  flags = flags || imap.DEFAULT;
  return (flags & imap.PARALLEL) ? 'parallel' : 'sequence';
};


function Connection() { };
exports.Connection = Connection;

Connection.prototype.message = function(msg, obj, timeout) {
  var timeout = timeout || 50;
  var response = { status: 'OK' };
  if (typeof obj === 'function') {
    setTimeout(obj.bind(this, response), timeout);
  }
  else {
    var i = 0;
    if (obj.line) for (i = 0; i < 3; i++) {
      var line = i + ': ' + msg;
      setTimeout(obj.line.bind(this, response, line), timeout + i);
    }
    if (obj.complete) setTimeout(obj.complete.bind(this, response), timeout + i * timeout);
  }
};

Connection.prototype.end = function() {
};



function Entity() {}
Entity.prototype.run = flow.run;
Entity.prototype.external = flow.external;


function Account(connection) {
  this.connection = connection;
  this.commands = new flow.Sequence(this);
};
exports.Account = Account;
util.inherits(Account, Entity);

Account.prototype.login = flow.defer(function(flow, user, pass) {
  this.connection.message('LOGIN ' + user + ' ' + pass, function(response) {
    if (response.status === 'OK') flow.next();
    else flow.error('failed to login');
  });
});

Account.prototype.logout = flow.defer(function(flow) {
  this.connection.message('LOGOUT', function(response) {
    this.end();
    flow.next();
  });
});

Account.prototype.mailboxes = flow.defer(function(flow, filter, callback, flags) {
  var group = flow[imap.flowType(flags)](this);

  this.connection.message('LSUB "" "*"', {
    line: function(response, line) {
      group.perform(callback, new imap.Mailbox(group, line));
    },
    complete: function(response) {
      group.complete();
    }
  });
});


function Mailbox(flow, line) {
  this.line = line;
  this.connection = flow.context.connection;
  this.commands = flow.sequence(this);
};
util.inherits(Mailbox, Entity);
exports.Mailbox = Mailbox;

Mailbox.prototype.select = flow.defer(function(flow) {
  var mailbox = this;
  this.connection.message('SELECT ' + mailbox, function() {
    flow.next();
  });
});

Mailbox.prototype.fetch = flow.defer(function(flow, filter, parts, callback, flags) {
  var group = flow.parallel(this);

  this.connection.message('FETCH ' + filter + ' (' + parts.join(', ') + ')', {
    line: function(response, line) {
      group.perform(callback, new imap.Message(group, line));
    },
    complete: function(response) {
      group.complete();
    }
  });
});




function Message(flow, line) {
  this.line = line;
  this.id = 1;
  this.connection = flow.context.connection;
  this.commands = flow.sequence(this);
}
util.inherits(Message, Entity);
exports.Message = Message;

Message.prototype.get = flow.defer(function(flow, parts) {
  if (typeof parts === 'string') parts = [ parts ];
  
  this.connection.message('FETCH ' + this.id + ' (' + parts.join(', ') + ')', function(response) {
    flow.next();
  });
});