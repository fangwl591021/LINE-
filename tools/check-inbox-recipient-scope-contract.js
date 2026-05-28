const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function fail(message) {
  console.error(`Inbox recipient scope contract failed: ${message}`);
  process.exit(1);
}

if (!worker.includes('async actorReachContext(payload, env)')) {
  fail('missing actor reach context helper');
}

if (!worker.includes('actorReferrerIds')) {
  fail('recipient scope must include actor referrer IDs');
}

if (!worker.includes('legacy_line_id IN') || !worker.includes('point_line_id IN')) {
  fail('store recipient search must resolve legacy and point identity IDs');
}

if (!worker.includes('async canReachRecipient(payload, receiverRow, env)')) {
  fail('canReachRecipient must be async so it can resolve actor identity links');
}

if (!worker.includes('await this.canReachRecipient(payload, receiver.user, env)')) {
  fail('direct inbox send must await the async reachability check');
}

if (!worker.includes('await this.canReachRecipient(payload, userRow, env)')) {
  fail('course recipient summary must await the async reachability check');
}

console.log('Inbox recipient scope contract passed.');
