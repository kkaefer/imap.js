var util = require('util');
var flow = exports;


flow.defer = function(fn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    this.commands.add(fn, args);
    return this;
  };
};

flow.run = function() {
  var callback = arguments[0];
  var args = Array.prototype.slice.call(arguments);
  this.commands.add(function(flow) {
    args[0] = flow;
    callback.apply(this, args);
  });
  return this;
};

flow.external = function(callback) {
  var callback = arguments[0];
  var args = Array.prototype.slice.call(arguments, 1);
  this.commands.add(function(flow) {
    var context = this;
    process.nextTick(function() { callback.apply(context, args); });
    flow.next();
  });
  return this;
};


function Sequence(context) {
  this.context = context;
  this.queue = [];
  this.next = this.next.bind(this);
  this.complete = this.complete.bind(this);
};
exports.Sequence = Sequence;

Sequence.prototype.running = false;
Sequence.prototype.completed = false;

Sequence.prototype.add = function(fn, args) {
  this.queue.push([ fn, args || [] ]);
  if (!this.running) this.next();
  return this;
};

Sequence.prototype.next = function() {
  this.running = this.queue.length;
  if (this.running) {
    var next = this.queue.shift();
    next[1].unshift(this);
    next[0].apply(this.context, next[1]);
  }
  if (!this.running && this.completed) this.complete();
};

Sequence.prototype.perform = function(callback, context) {
  return this.add(function() {
    callback.call(context);
    context.commands.complete();
  });
};

Sequence.prototype.complete = function() {
  this.completed = true; // all are in the queue
  if (!this.running) {
    if (this.parent) {
      this.parent.next();
      delete this;
    }
    else {
      // Reset this
      this.completed = false;
    }
  }
};

Sequence.prototype.sequence = function(context) {
  var seq = new Sequence(context);
  seq.parent = this;
  return seq;
};

Sequence.prototype.parallel = function(context) {
  var par = new Parallel(context);
  par.parent = this;
  return par;
};



function Parallel(context) {
  this.context = context;
  this.count = 0;
  this.next = this.next.bind(this);
  this.complete = this.complete.bind(this);
};
exports.Parallel = Parallel;

Parallel.prototype.perform = Sequence.prototype.perform;
Parallel.prototype.sequence = Sequence.prototype.sequence;
Parallel.prototype.parallel = Sequence.prototype.parallel;

Parallel.prototype.completed = false;

Parallel.prototype.add = function(callback, args) {
  this.count++;
  args = args || [];
  args.unshift(this);
  callback.apply(this.context, args);
  return this;
};

Parallel.prototype.next = function() {
  this.count--;
  if (this.count <= 0 && this.completed) this.complete();
};

Parallel.prototype.complete = function() {
  this.completed = true;
  if (this.count <= 0) {
    if (this.parent) {
      this.parent.next();
      delete this;
    }
    else {
      // Reset this for reuse.
      this.completed = false;
      this.count = 0;
    }
  }
};
