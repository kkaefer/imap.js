var util = require('util');
var config = require('./config');
var IMAPConnection = require('./imap_connection').IMAPConnection;

var c = new IMAPConnection(config);

c.on('authenticated', function(response) {
  this.select('INBOX');
  
//   this.parse(response);
//   
//   console.dir(response);
//   
//   // console.dir(response);
//   
//   
//   // this.message('LIST "" ""', printResponse);
//   // this.message('LIST "/" "*"', printResponse);
//   // this.message('EXAMINE INBOX', printResponse);
//   // this.message('SELECT INBOX');
//   // this.message('FETCH  (BODY[HEADER])');
//   
  this.end();
});