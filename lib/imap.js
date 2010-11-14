var imap = exports;
var flow = require('./flow');

imap.SEQUENTIAL = 0x0000;
imap.PARALLEL = 0x0001;
imap.RANGED = 0x0002;

imap.DEFAULT = imap.SEQUENTIAL;

imap.flowType = function(flags) {
  flags = flags || imap.DEFAULT;
  return (flags & imap.PARALLEL) ? 'parallel' : 'sequence';
};

function Entity() {}
imap.Entity = Entity;
Entity.prototype.run = flow.run;
Entity.prototype.external = flow.external;

require('./connection');
require('./imap/account');
require('./imap/mailbox');
