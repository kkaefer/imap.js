var sys = require('sys');
var config = require('./config');
var imap = require('./imap_connection');

var c = imap.connect({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password
});


function printResponse(response) {
  console.log('-> ' + sys.inspect(response.command));
  
  response.lines.forEach(function(l) {
    console.log('<- ' + sys.inspect(l.text));

    if (l.length) {
      console.log('   and ' + l.map(function(b) {
        return 'Buffer(' + b.reduce(function(prev, cur){
          return prev + cur.length;
        }, 0) + ')';
      }).join(', '));

      console.log(l.map(function(b, i) {
        var prompt = '   ' + i + ': ';
        var str = b.reduce(function(prev, cur) { return prev + cur.toString('ascii'); }, '').split('\r\n');
        return str.map(function(s) {
          return prompt + sys.inspect(s + '\r\n');
        }).join('\n');
      }).join('\r\n   '));
    }
  });
  console.log('<- ' + sys.inspect(response.tag + ' ' + response.done) + '\n');
}


c.addListener('authenticate', function() {
  // this.message('LIST "" ""');
  // this.message('LIST "/" "*"', printResponse);
  // this.message('EXAMINE INBOX', printResponse);
  this.message('SELECT INBOX');
  this.message('FETCH 1:3 (BODY[])', printResponse);
  
  this.end();
});