import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'modules', 'business-richman.js'), 'utf8');

assert.match(indexHtml, /openBusinessRichman/);
assert.match(indexHtml, /id="page-business-richman"/);
assert.match(indexHtml, /js\/modules\/business-richman\.js\?v=1\.0/);
assert.match(indexHtml, /js\/navigation\.js\?v=8\.02/);
assert.match(navigation, /page === 'business-richman'.*initBusinessRichman/);

assert.match(source, /loadCardData\(\{ render: false, harvest: true, initPanels: false \}\)/);
assert.match(source, /window\.harvestCards/);
assert.doesNotMatch(source, /matchmakeContacts/);
assert.match(source, /window\.openCardDetailById\(tile\.id\)/);
assert.match(source, /sessionStorage\.setItem/);
assert.match(source, /registerBusinessRichmanProvider/);
assert.match(source, /state\.tiles\[index % state\.tiles\.length\]/);
assert.match(source, /providers\.card/);

console.log('business richman contract passed');
