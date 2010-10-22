var sys = require('sys');


var IMAPResponse = exports.IMAPResponse = function(connection) {
  this.connection = connection;
  this.lines = [];

  this.line = [];
  this.line.text = '';
  this.connection._stream.requestNextLine(this.parseLine, this);
};

IMAPResponse.prototype.parseLine = function(line) {
  // Check for literals embedded in this line.
  if (line[line.length - 3] === '}') {
    this.line.text += line.substring(0, line.length - 2);
    
    // There's a literal in this line. We need to receive that and continue on
    // the next line to get the overall line.
    var bytes = parseInt(line.substring(line.lastIndexOf('{') + 1, line.length - 3), 10);
    var chunks = [];
    var self = this;
    this.connection._stream.request(bytes, function(chunk) {
      chunks.push(chunk);
    }, function() {
      // All chunks from this literal have been put in the chunks array.
      self.line.push(chunks);
      
      // We need another line to complete the logical line.
      self.connection._stream.requestNextLine(self.parseLine, self);
    });
  }
  else {
    // This line is finished.
    this.line.text += line;
    this.addLine(this.line);
  }
};


IMAPResponse.prototype.addLine = function(line) {
  this.line = [];
  this.line.text = '';

  // console.dir(line.text);
  if (line.text[0] !== '*' && line.text[0] !== '+') {
    // This response is finished.
    var self = this;
    this.tag = line.text.split(' ', 1)[0];
    this.done = line.text.substring(this.tag.length + 1);

    // Parse this response.
    // TODO

    if (this.tag in this.connection._callbacks) {
      process.nextTick(function() {
        // Pass the data objects associated with this tag to the function.
        self.command = self.connection._callbacks[self.tag].command;
        self.connection._callbacks[self.tag].callback.call(self.connection, self);
      });
    }

    // Make the connection get the next response.
    process.nextTick(function() {
      new IMAPResponse(self.connection);
    });
  }
  else {
    // There are more lines to be expected in this response.
    this.lines.push(line);
    this.connection._stream.requestNextLine(this.parseLine, this);
  }
};

