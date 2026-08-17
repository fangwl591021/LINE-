const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const oldBlock = `    <div id="page-card" class="hidden space-y-0 animate-in fade-in">\n<div class="bg-white p-5 border-y border-slate-100">\n\n        <div class="flex gap-3 mt-4">\n          <label id="collected-card-camera-label" class="flex-1 bg-blue-50 text-blue-600 py-4 rounded-2xl font-bold flex flex-col justify-center items-center gap-2 cursor-pointer active:scale-95 transition-transform border border-blue-100 shadow-sm">\n            <span class="material-symbols-outlined text-3xl">photo_camera</span>\n            <span class="text-[13px]">拍照掃描</span>\n          </label>\n\n          <button onclick="document.getElementById('galleryInput').click()" class="flex-1 bg-slate-50 text-slate-600 py-4 rounded-2xl font-bold flex flex-col justify-center items-center gap-2 cursor-pointer active:scale-95 transition-transform border border-slate-200 shadow-sm">\n            <span class="material-symbols-outlined text-3xl">image</span>\n            <span class="text-[13px]">相簿上傳</span>\n          </button>`;

const newBlock = `    <div id="page-card" class="hidden space-y-0 animate-in fade-in">\n      <div class="bg-white px-4 py-3 border-y border-slate-100">\n\n        <div class="flex gap-3 mt-0">\n          <label id="collected-card-camera-label" class="flex-1 bg-blue-50 text-blue-600 py-3 rounded-2xl font-bold flex flex-col justify-center items-center gap-1.5 cursor-pointer active:scale-95 transition-transform border border-blue-100 shadow-sm">\n            <span class="material-symbols-outlined text-2xl">photo_camera</span>\n            <span class="text-[13px]">拍照掃描</span>\n          </label>\n\n          <button onclick="document.getElementById('galleryInput').click()" class="flex-1 bg-slate-50 text-slate-600 py-3 rounded-2xl font-bold flex flex-col justify-center items-center gap-1.5 cursor-pointer active:scale-95 transition-transform border border-slate-200 shadow-sm">\n            <span class="material-symbols-outlined text-2xl">image</span>\n            <span class="text-[13px]">相簿上傳</span>\n          </button>`;

if (!html.includes(oldBlock)) {
  if (html.includes('id="collected-card-camera-label"') && html.includes('bg-white px-4 py-3 border-y border-slate-100')) {
    console.log('Card upload controls already compacted.');
    process.exit(0);
  }
  throw new Error('Card upload control block not found');
}
html = html.replace(oldBlock, newBlock);
fs.writeFileSync(path, html);
console.log('Compacted card-page spacing and upload controls.');
