var buffer = require('buffer').Buffer;

exports.utf8to7 = function(str) {
  // All printable ASCII chars except for & must be represented by themselves.
  // We replace subsequent non-ASCII chars with the escape sequence.
  return str.replace(/[^\x20-\x25\x27-\x7e]+/g, function(s) {
    if (s === '&') return '&-';
    var b = new Buffer(s.length * 2, 'ascii');
    for (var i = 0, bi = 0; i < s.length; i++) {
      // Note that we can't simply convert a UTF-8 buffer to Base64 because
      // UTF-8 uses a different encoding. In modified UTF-7, all characters are
      // represented by their two byte Unicode ID.
      var c = s.charCodeAt(i);
      b[bi++] = c >> 8; // Upper 8 bits shifted into lower 8 bits so that they fit into 1 byte.
      b[bi++] = c & 0xFF; // Lower 8 bits. Cut of the upper 8 bits so that they fit into 1 byte.
    }
    // Modified Base64 uses , instead of / and omits trailing =.
    return '&' + b.toString('base64').replace(/\//g, ',').replace(/=/g, '') + '-';
  });
};

exports.utf7to8 = function(str) {
  return str.replace(/&([^-]*)-/g, function(a, s) {
    if (s === '') return '&';
    var b = new Buffer(s.replace(/,/g, '/'), 'base64');
    var r = [];
    for (var i = 0; i < b.length;) {
      // Calculate charcode from two adjacent bytes.
      r.push(String.fromCharCode(b[i++] << 8 | b[i++]));
    }
    return r.join('');
  });
};
