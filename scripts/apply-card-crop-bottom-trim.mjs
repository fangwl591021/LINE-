import fs from 'node:fs';

const path = 'js/modules/card-vision-crop.js';
let source = fs.readFileSync(path, 'utf8');

const marker = "  const MANUAL_HINT_TTL_MS = 10000;\n";
if (!source.includes("const BOUNDING_BOX_BOTTOM_TRIM_RATIO")) {
  if (!source.includes(marker)) throw new Error('marker not found');
  source = source.replace(marker, marker + "  const BOUNDING_BOX_BOTTOM_TRIM_RATIO = 0.48;\n");
} else {
  source = source.replace(/const BOUNDING_BOX_BOTTOM_TRIM_RATIO = [0-9.]+;/, 'const BOUNDING_BOX_BOTTOM_TRIM_RATIO = 0.48;');
}

const manualOld = `    const right = Math.min(1, box.x + box.width + padX);\n    const bottom = Math.min(1, box.y + box.height + padY);\n    const cropWidth = Math.max(0, (right - left) * width);\n    const cropHeight = Math.max(0, (bottom - top) * height);`;
const manualNew = `    const right = Math.min(1, box.x + box.width + padX);\n    const rawBottom = Math.min(1, box.y + box.height + padY);\n    const rawHeight = Math.max(0, rawBottom - top);\n    const bottom = Math.max(top, rawBottom - rawHeight * BOUNDING_BOX_BOTTOM_TRIM_RATIO);\n    const cropWidth = Math.max(0, (right - left) * width);\n    const cropHeight = Math.max(0, (bottom - top) * height);`;
if (source.includes(manualOld)) source = source.replace(manualOld, manualNew);
else if (!source.includes('rawBottom - rawHeight * BOUNDING_BOX_BOTTOM_TRIM_RATIO')) throw new Error('manual crop block not found');

const autoOld = `    const right = Math.min(1, box.x + box.width + padX);\n    const bottom = Math.min(1, box.y + box.height + padY);\n    const bx = Math.round(left * source.width);\n    const by = Math.round(top * source.height);\n    const bw = Math.round((right - left) * source.width);\n    const bh = Math.round((bottom - top) * source.height);`;
const autoNew = `    const right = Math.min(1, box.x + box.width + padX);\n    const rawBottom = Math.min(1, box.y + box.height + padY);\n    const rawHeight = Math.max(0, rawBottom - top);\n    const bottom = Math.max(top, rawBottom - rawHeight * BOUNDING_BOX_BOTTOM_TRIM_RATIO);\n    const bx = Math.round(left * source.width);\n    const by = Math.round(top * source.height);\n    const bw = Math.round((right - left) * source.width);\n    const bh = Math.round((bottom - top) * source.height);`;
if (source.includes(autoOld)) source = source.replace(autoOld, autoNew);
else if ((source.match(/rawBottom - rawHeight \* BOUNDING_BOX_BOTTOM_TRIM_RATIO/g) || []).length < 2) throw new Error('auto crop block not found');

fs.writeFileSync(path, source);
console.log('Applied 48% bottom trim to bounding-box fallback and manual hint.');
