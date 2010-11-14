var util = require('util');
var config = require('./config');
var imap = require('./lib/imap');

var connection = new imap.Connection(config);

connection.on('authenticated', function(account) {
  account.mailboxes('*', function() {
    console.log(this.line);
  });
  
  account.logout();
});
