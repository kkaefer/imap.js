var Buffer = require('buffer').Buffer;
var EventEmitter = require('events').EventEmitter;
var sys = require('sys');


function StreamingBuffer() {
  if (!(this instanceof StreamingBuffer)) return new StreamingBuffer();

  this.buffers = [];
}
sys.inherits(StreamingBuffer, EventEmitter);
exports.StreamingBuffer = StreamingBuffer;


StreamingBuffer.prototype.push = function(buffer) {
  this.buffers.push(buffer);
  this.emit('data', buffer);
};


/**
 * Gets the next line up to CRLF.
 *
 * @return
 *   The line when there is one, undefined otherwise.
 */
StreamingBuffer.prototype.nextLine = function() {
  var bid = 0;
  var buffer = this.buffers[bid];

  while (buffer) {
    var cursor = 0;

    while (cursor < buffer.length) {
      if (buffer[cursor++] === 13 /* \r */) {
        // This potentially is a line ending. Now we only need \n as next char.
        // Make sure that we're not at the end of a buffer.
        if (cursor >= buffer.length) {
          buffer = this.buffers[++bid];
          if (!buffer) return;
          cursor = 0;
        }

        if (buffer && buffer[cursor] === 10 /* \n */) {
          // We found a line ending.
         cursor++;

          // Concat buffers if we have multiple.
          if (bid) {
            var str = [];
            for (var i = 0; i < bid; i++) {
              // Concat buffers we consumed to the end and remove them from the list.
              var b = this.buffers.shift();
              str.push(b.toString('ascii'));
            }
            str.push(buffer.toString('ascii', 0, cursor));
            var result = str.join('');
          }
          else {
            // All is in a single buffer.
            var result = buffer.toString('ascii', 0, cursor);

          }

          this.buffers[0] = buffer.slice(cursor, buffer.length);
          return result;
        }
      }
    }

    // buffer ended, get next buffer and continue with loop.
    buffer = this.buffers[++bid];
  }
};

/**
 * Sends next N bytes to a callback function.
 *
 * @param bytes
 *   Number of bytes that should be intercepted.
 * @param callback
 *   Callback that will be called with the buffers. Arguments will be buffer and
 *   the `data` param passed to this function.
 * @param complete
 *   Callback function that will be called when the N bytes were received.
 * @param data
 *   Will be passed to callback (e.g. to identify multiple callbacks).
 * @return
 *   The line when there is one, undefined otherwise.
 */
StreamingBuffer.prototype.request = function(bytes, callback, complete, data) {
  function listener(buffer) {
    if (buffer.length >= bytes) {
      // Request can be fully satisfied from this buffer.
      this.removeListener('data', listener);
      this.buffers[0] = buffer.slice(bytes, buffer.length);

      callback(buffer.slice(0, bytes), data);
      if (complete instanceof Function) complete(data);
      bytes = 0;
    }
    else {
      // Request can only be partially satisfied from this buffer.
      bytes -= buffer.length;
      this.buffers.shift();
      callback(buffer, data);
    }
  };

  // First try to satisfy the request from the existing data.
  for (var buffer = this.buffers[0]; buffer && bytes; buffer = this.buffers[0]) {
    listener.call(this, buffer);
  }

  if (!bytes) {
    return true;
  }
  else {
    this.on('data', listener);
  }
};
