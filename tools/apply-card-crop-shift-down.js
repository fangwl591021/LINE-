const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'js/modules/card-vision-crop.js');
let source = fs.readFileSync(file, 'utf8');

const before = `    const left = Math.max(0, box.x - padX);\n    const top = Math.max(0, box.y - padY);\n    const right = Math.min(1, box.x + box.width + padX);\n    const bottom = Math.min(1, box.y + box.height + padY);\n    const cropWidth = Math.max(0, (right - left) * width);\n    const cropHeight = Math.max(0, (bottom - top) * height);`;

const after = `    const left = Math.max(0, box.x - padX);\n    const right = Math.min(1, box.x + box.width + padX);\n    const rawTop = Math.max(0, box.y - padY);\n    const rawBottom = Math.min(1, box.y + box.height + padY);\n    // 依實機兩張測試照校正：低信心人工預框整體向下 4%，框寬高保持不變。\n    const verticalShift = Math.max(0, Math.min(0.04, 1 - rawBottom));\n    const top = rawTop + verticalShift;\n    const bottom = rawBottom + verticalShift;\n    const cropWidth = Math.max(0, (right - left) * width);\n    const cropHeight = Math.max(0, (bottom - top) * height);`;

if (!source.includes(before)) {
  console.error('Target manualCropData block not found; refusing to patch.');
  process.exit(1);
}
source = source.replace(before, after);
fs.writeFileSync(file, source);
console.log('Applied 4% downward shift to low-confidence manual card crop hint.');
