var config = require('./config');
var imap = require('./imap_connection');

var c = imap.connect({
  host: config.host,
  username: config.username,
  password: config.password
});

c.addListener('authenticate', function() {
  this.message('LIST "" ""');
  this.message('LIST "/" "*"');
  this.message('EXAMINE INBOX');
  this.end();
});