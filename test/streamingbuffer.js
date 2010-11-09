var StreamingBuffer = require('streamingbuffer').StreamingBuffer;
var Buffer = require('buffer').Buffer;


exports['test StreamingBuffer'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this is a test\r\n'));
  sb.push(new Buffer('the next line continues\r\n here'));

  assert.equal('this is a test\r\n', sb._nextLine());
  assert.equal('the next line continues\r\n', sb._nextLine());
};


exports['test StreamingBuffer without input'] = function(assert) {
  var sb = new StreamingBuffer();

  assert.isUndefined(sb._nextLine());
};


exports['test StreamingBuffer without empty lines'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this contains\r\n\r\nan empty line\r\n'));

  assert.equal('this contains\r\n', sb._nextLine());
  assert.equal('\r\n', sb._nextLine());
  assert.equal('an empty line\r\n', sb._nextLine());
};




exports['test StreamingBuffer with line spread over multiple buffers'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this string '));
  sb.push(new Buffer('is spread over '));
  sb.push(new Buffer('multiple buffers\r\n'));
  sb.push(new Buffer('and continues here\r\n'));

  assert.equal('this string is spread over multiple buffers\r\n', sb._nextLine());
  assert.equal('and continues here\r\n', sb._nextLine());
};


exports['test StreamingBuffer with CRLF in two buffers'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this string has \r'));
  sb.push(new Buffer('\n spread over multiple buffers\r\n'));

  assert.equal('this string has \r\n', sb._nextLine());
  assert.equal(' spread over multiple buffers\r\n', sb._nextLine());
};


exports['test StreamingBuffer with missing LF at end'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this string has \r'));

  assert.isUndefined(sb._nextLine());
};


exports['test StreamingBuffer with LF at buffer boundary'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this string has \r'));
  sb.push(new Buffer(' and continues here\r\n'));

  assert.equal('this string has \r and continues here\r\n', sb._nextLine());
};


exports['test StreamingBuffer with missing CRLF'] = function(assert) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this string has one line\r\n'));
  sb.push(new Buffer('but not another'));

  assert.equal('this string has one line\r\n', sb._nextLine());
  assert.isUndefined(sb._nextLine());
};


exports['test StreamingBuffer fixed byte length callback'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  var dataReceived = [];
  var id = +new Date;
  var completeCallback = false;

  setTimeout(function() { sb.push(new Buffer('this text comes in ')); }, 100);
  setTimeout(function() { sb.push(new Buffer('multiple pieces with a total length ')); }, 150);
  setTimeout(function() { sb.push(new Buffer('of 83 bytes and ignores CRLF')); }, 200);
  setTimeout(function() { sb.push(new Buffer('the text that appears here doesn\'t count\r\n')); }, 250);

  var immediate = sb.getBytes(83, function(buffer) {
    dataReceived.push(buffer.toString('ascii'));
  }, function(data) {
    completeCallback = true;
  });

  // Assert that it returns undefined when the request can't be satisfied immediately.
  assert.isUndefined(immediate);

  beforeExit(function() {
    assert.ok(completeCallback);
    assert.equal('the text that appears here doesn\'t count\r\n', sb._nextLine());
    assert.equal('this text comes in multiple pieces with a total length of 83 bytes and ignores CRLF', dataReceived.join(''));
  });
};


exports['test StreamingBuffer fixed byte length that can be satisfied from initial buffer'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  var dataReceived;
  var completeCallback = false;

  sb.push(new Buffer('this text is already in the bufferand this one is a regular line\r\n'));

  sb.getBytes(34, function(buffer) {
    dataReceived = buffer.toString('ascii');
  }, function(data) {
    completeCallback = true;
  });

  beforeExit(function() {
    assert.ok(completeCallback);
    assert.equal('and this one is a regular line\r\n', sb._nextLine());
    assert.equal('this text is already in the buffer', dataReceived);
  });
};


exports['test StreamingBuffer fixed byte length request with 0 bytes'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  sb.push(new Buffer('this string is never requested\r\n'));
  var completeCallback = false;

  var immediate = sb.getBytes(0, function(buffer) {
    assert.isUndefined('this function should never be called');
  }, function() {
    completeCallback = true;
  });

  beforeExit(function() {
    assert.ok(completeCallback, 'complete callback was never called');
    assert.equal('this string is never requested\r\n', sb._nextLine());
  });
};

exports['test StreamingBuffer getLine'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  var data = [];

  setTimeout(function() { sb.push(new Buffer('this text is spread ')); }, 100);
  setTimeout(function() { sb.push(new Buffer('over multiple buffers.\r\nit contains testing info\r\n')); }, 150);
  setTimeout(function() { sb.push(new Buffer('and also some information that is ')); }, 200);
  setTimeout(function() { sb.push(new Buffer('not terminated\r\nlike this, for example')); }, 250);

  sb.getLine(function(line) { data.push(line); });
  sb.getLine(function(line) { data.push(line); });
  sb.getLine(function(line) { data.push(line); });

  beforeExit(function() {
    assert.length(data, 3);
    assert.equal('this text is spread over multiple buffers.\r\n', data[0]);
    assert.equal('it contains testing info\r\n', data[1]);
    assert.equal('and also some information that is not terminated\r\n', data[2]);
  });
};

exports['test StreamingBuffer getLine satisfied from initial buffers'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  var data = [];

  sb.push(new Buffer('this text is spread '));
  sb.push(new Buffer('over multiple buffers.\r\nit contains testing info\r\n'));
  sb.push(new Buffer('and also some information that is '));
  sb.push(new Buffer('not terminated\r\nlike this, for example'));

  sb.getLine(function(line) { data.push(line); });
  sb.getLine(function(line) { data.push(line); });
  sb.getLine(function(line) { data.push(line); });

  beforeExit(function() {
    assert.length(data, 3);
    assert.equal('this text is spread over multiple buffers.\r\n', data[0]);
    assert.equal('it contains testing info\r\n', data[1]);
    assert.equal('and also some information that is not terminated\r\n', data[2]);
  });
};

exports['test StreamingBuffer fixed length and line concurrently'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  var buffers1 = [], buffers2 = [], buffers3 = [], buffers4 = [];
  var lines = [];

  setTimeout(function() { sb.push(new Buffer('this text is spread ')); }, 100);
  setTimeout(function() { sb.push(new Buffer('over multiple buffers.\r\nit contains testing info\r\n')); }, 150);
  setTimeout(function() { sb.push(new Buffer('and also some information that is ')); }, 200);
  setTimeout(function() { sb.push(new Buffer('not terminated\r\nlike this, for example')); }, 250);

  sb.getBytes(34, function(buffer) { buffers1.push(buffer.toString()); });
  sb.getLine(function(line) { lines.push(line); });
  sb.getBytes(3, function(buffer) { buffers2.push(buffer.toString()); });
  sb.getBytes(3, function(buffer) { buffers3.push(buffer.toString()); });
  sb.getBytes(3, function(buffer) { buffers4.push(buffer.toString()); });
  sb.getLine(function(line) { lines.push(line); });
  sb.getLine(function(line) { lines.push(line); });

  beforeExit(function() {
    assert.equal('this text is spread over multiple ', buffers1.join(''));
    assert.equal('it ', buffers2.join(''));
    assert.equal('con', buffers3.join(''));
    assert.equal('tai', buffers4.join(''));
    
    assert.length(lines, 3);
    assert.equal('buffers.\r\n', lines[0]);
    assert.equal('ns testing info\r\n', lines[1]);
    assert.equal('and also some information that is not terminated\r\n', lines[2]);
  });
};

exports['test StreamingBuffer fixed byte length with lots of data'] = function(assert, beforeExit) {
  var sb = new StreamingBuffer();
  var completeCallback = false;
  var sent = new Buffer(60000);

  // Set buffer to random data from 0 to 255.
  for (var i = 0; i < sent.length; i++) {
    sent[i] = Math.floor(Math.random() * 255);
  }

  // Sent out the data spread over 600ms.
  for (var i = 0; i < 60; i++) (function(i) {
    setTimeout(function() {
      sb.push(sent.slice(i * 1000, i * 1000 + 1000));
    }, i * 10);
  })(i);

  setTimeout(function() { sb.push(new Buffer('CANARY')); }, 650);

  var index = 0;
  sb.getBytes(60000, function(buffer) {
    for (var i = 0; i < buffer.length; i++, index++) {
      assert.equal(sent[index], buffer[i]);
    }
  }, function() {
    completeCallback = true;
  });

  beforeExit(function() {
    assert.equal(index, 60000);
    assert.ok(completeCallback);
  });
};
