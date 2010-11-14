var flow = require('flow');
var imap = require('./support/imap');

exports['test sequential flow'] = function(assert, beforeExit) {
  var seq = new flow.Sequence();
  var stages = 0;

  function fn(flow) {
    stages++;
    setTimeout(flow.next, 50);
    if (stages < 4) seq.add(fn);
  }

  seq.add(fn).add(fn);

  beforeExit(function() {
    assert.equal(5, stages);
  });
};

exports['test parallel flow'] = function(assert, beforeExit) {
  var par = new flow.Parallel();
  var intermediate = false;
  var stages = 0;
  var last = false;

  for (var i = 0; i < 10; i++) {
    par.add(function(flow) {
      stages++;
      setTimeout(flow.next, 50);
    });
  }
  par.complete();
  assert.ok(par.completed);

  setTimeout(function() {
    assert.equal(10, stages);
    assert.equal(false, par.completed); // autoreset becaue this is root.
    intermediate = true;
    
    par.add(function(flow) {
      setTimeout(function() {
        last = true;
        flow.next();
      }, 50);
    });
    par.complete();
  }, 100);

  beforeExit(function() {
    assert.ok(intermediate);
    assert.ok(last);
  });
};

exports['test nested flows'] = function(assert, beforeExit) {
  var parent = {};
  var seq = new flow.Sequence(parent);

  var last = false;
  var parallel = 0;

  seq.add(function(flow) {
    assert.equal(this, parent);
    var context = {};
    var par = flow.parallel(context);

    function fn(flow) {
      assert.equal(this, context);
      setTimeout(function() {
        parallel++;
        flow.next();
      }, 100);
    }

    par.add(fn).add(fn).add(fn).complete();
  })
  seq.add(function(flow) {
    assert.equal(this, parent);
    assert.equal(3, parallel);
    last = true;
    flow.next();
  });
  seq.complete();

  beforeExit(function() {
    assert.ok(last);
  });
};

exports['test more complex example with imap mock objects'] = function(assert, beforeExit) {
  var mailboxes = 0;
  var messages = 0;
  var external = 0;
  var last = false;

  var account = new imap.Account(new imap.Connection);
  account
    .login('foo', 'bar')
    .mailboxes('*', function() {
      var parent = this;
      mailboxes++;
      assert.ok(this instanceof imap.Mailbox);
      this
        .select()
        .run(function(flow) {
          setTimeout(function() { flow.next(); }, 100);
        })
        .external(function() {
          external++;
        })
        .run(function(flow) {
          assert.ok(this === parent);
          // this instanceof imap.Mailbox, but with a new empty Sequence queue.
          this.connection.message('STATUS', {
            complete: flow.next
          });
        });

      this.fetch('all', ['flags', 'internaldate'], function() {
        messages++;
        assert.ok(this instanceof imap.Message);
        // this instanceof imap.Message
        this.get('body');
        this.external(function() {});
      }, imap.PARALLEL);
    })
    .logout()
    .run(function() {
      last = true;
    });

  beforeExit(function() {
    assert.equal(3, mailboxes);
    assert.equal(9, messages);
    assert.equal(3, external);
    assert.ok(last);
  });
};
