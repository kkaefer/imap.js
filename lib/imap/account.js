var util = require('util');
var imap = require('../imap');
var flow = require('../flow');
var utf7 = require('../utf7');

function Account(connection) {
  this.connection = connection;
  this.commands = new flow.Sequence(this);
};
imap.Account = Account;
util.inherits(imap.Account, imap.Entity);

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