var util = require('util');
var parse = exports;

exports.line = function(line) {
  var type = line.text.split(' ', 2)[1];
  switch (type) {
    case 'OK': case 'NO': case 'BAD':   parse.condState(line, type);     break;
    case 'CAPABILITY':                  parse.capability(line, type);    break;
  }
};

exports.condState = function(line, type) {
  line.status = type;
};

exports.capability = function(line) {
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
};

