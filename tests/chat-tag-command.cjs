// /projekt, /arbeitsbereich, /gruppe im Website-Chat: dieselben Fälle wie
// server/test/messageFormat.test.mjs der App (tagCommand in MessageFormat.js),
// damit beide Eingaben dieselben Befehle verstehen.
// Start: node tests/chat-tag-command.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../public/pages/nachrichten.js'), 'utf8');
const part = source.slice(source.indexOf('  const TAG_KINDS ='), source.indexOf('  // Was die nächste Nachricht markiert'));
const context = {};
vm.runInNewContext(part + '\nglobalThis.tagCommand = tagCommand;', context);
const { tagCommand } = context;
const at = (text) => tagCommand(text, text.length);
const kinds = (text) => [...at(text).kinds].join();

assert.equal(at('/projekt').active, true);
assert.equal(kinds('/projekt'), 'project');
assert.equal(kinds('hi /project'), 'project');
assert.equal(kinds('/arbeitsbereich'), 'workspace');
assert.equal(kinds('/workspace'), 'workspace');
assert.equal(kinds('/gruppe'), 'community');
assert.equal(kinds('/community'), 'community');
assert.equal(kinds('/group'), 'community');
assert.equal(at('/').active, true);
assert.equal(at('/').kinds.length, 3);
assert.equal(kinds('/pro'), 'project');
assert.equal(kinds('/arb'), 'workspace');
assert.equal(kinds('/g'), 'community');
assert.equal(kinds('/GRUPPE'), 'community');
assert.equal(at('/remind').active, false);
assert.equal(at('/projekt apo').prefix, 'apo');
assert.equal(at('/arbeitsbereich stu').prefix, 'stu');
assert.equal(kinds('/arbeitsbereich stu'), 'workspace');
assert.equal(at('/pro apo').active, false);
assert.equal(at('and/projekt').active, false);
assert.equal(at('https://xyntal.de/projekt').active, false);
assert.equal(at('hello /projekt').start, 6);
assert.equal(at('zeile\n/gruppe').start, 6);
assert.equal(tagCommand('/projekt x', 0).active, false);
assert.equal(at('/projekt ' + 'a'.repeat(41)).active, false);
console.log('chat tag commands ok');
