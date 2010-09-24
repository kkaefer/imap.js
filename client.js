var config = require('./config');
var imap = require('./imap');

var c = imap.connect({
  host: config.host,
  username: config.username,
  password: config.password
});

c.addListener('authenticate', function() {
  this.enqueue('LIST "" ""');
  this.enqueue('LIST "/" "*"');
  this.enqueue('EXAMINE INBOX');
  this.enqueue('LOGOUT');
});