const fs = require('fs');

const navPath = 'js/navigation.js';
const htmlPath = 'index.html';
const cameraContractPath = 'tools/check-android-business-card-camera-contract.js';

let nav = fs.readFileSync(navPath, 'utf8');
const oldSet = "new Set(['home', 'card', 'customers', 'admin-settings'])";
const newSet = "new Set(['home', 'card', 'customers', 'admin-settings', 'card-detail'])";
if (nav.includes(oldSet)) nav = nav.replace(oldSet, newSet);
else if (!nav.includes(newSet)) throw new Error('shared banner page set not found');
fs.writeFileSync(navPath, nav);

let html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('js/navigation.js?v=7.95')) html = html.replace('js/navigation.js?v=7.95', 'js/navigation.js?v=7.96');
else if (!html.includes('js/navigation.js?v=7.96')) throw new Error('navigation cache-bust marker not found');
fs.writeFileSync(htmlPath, html);

let cameraContract = fs.readFileSync(cameraContractPath, 'utf8');
cameraContract = cameraContract.replace("/(?:94|95)/", "/(?:94|95|96)/");
if (!cameraContract.includes('(?:94|95|96)')) {
  cameraContract = cameraContract.replace("/(?:94|95)/", "/(?:94|95|96)/");
}
fs.writeFileSync(cameraContractPath, cameraContract);

console.log('Enabled shared banner on card-detail and bumped navigation cache.');
