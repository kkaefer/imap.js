var util = require('util');
var imap = require('../imap');
var flow = require('../flow');
var utf7 = require('../utf7');

function Mailbox(flow, line) {
  this.line = line;
  this.connection = flow.context.connection;
  this.commands = flow.sequence(this);
};
imap.Mailbox = Mailbox;
util.inherits(imap.Mailbox, imap.Entity);

Mailbox.prototype.select = flow.defer(function(flow, name) {
  this.connection.message('SELECT ' + utf7.utf8to7(name), function() {
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