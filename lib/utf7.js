var buffer = require('buffer').Buffer;

exports.utf8to7 = function(str) {
  return str.replace(/[^\x20-\x25\x27-\x7e]+/g, function(s) {
    if (s === '&') return '&-';
    var b = new Buffer(s.length * 2, 'ascii');
    for (var i = 0, bi = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      b[bi++] = c >> 8;
      b[bi++] = c & 0xFF;
    }
    return '&' + b.toString('base64').replace(/,/g, '/').replace(/=/g, '') + '-';
  });
};

exports.utf7to8 = function(str) {
  return str.replace(/&([^-]*)-/g, function(a, s) {
    if (s === '') return '&';
    var b = new Buffer(s, 'base64');
    var r = [];
    for (var i = 0; i < b.length;) {
      r.push(String.fromCharCode(b[i++] << 8 | b[i++]));
    }
    return r.join('');
  });
};
