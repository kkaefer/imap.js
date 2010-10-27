var util = require('util');

var r = module.exports = {
  parseLine: function(line) {
    var type = line.text.split(' ', 2)[1];
    switch (type) {
      case 'OK': case 'NO': case 'BAD':   r.condState(line, type);     break;
      case 'CAPABILITY':                  r.capability(line, type);    break;
    }
  },
 
 
  condState: function(line, type) {
    line.status = type;
  },
  
  capability: function(line) {
    line.type = 'capability';
    line.capabilities = {};

    var capabilities = line.text.substring(13, line.text.length - 2).split(' ');
    for (var i = 0; i < capabilities.length; i++) {
      if (capabilities[i].indexOf('=') >= 0) {
        var kv = capabilities[i].split('=');
        if (!line.capabilities[kv[0]]) {
          line.capabilities[kv[0]] = [];
        }
        line.capabilities[kv[0]].push(kv[1]);
      }
      else {
        line.capabilities[capabilities[i]] = true;
      }
    }

    delete line.text;
  }
};


