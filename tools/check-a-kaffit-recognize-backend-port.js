const fs = require('fs');
const read = p => fs.readFileSync(p,'utf8');
const core = read('worker/a-kaffit-card-recognize.mjs');
const entry = read('worker-entry.mjs');
const adapter = read('js/modules/a-kaffit-card-scanner-adapter.js');
function ok(v,label){if(!v){console.error('FAIL',label);process.exit(1)}console.log('OK',label)}

ok(core.includes("const FIELD_LIMITS = { displayName:120, englishName:120, companyName:180"),'A-kaffit field limits preserved');
ok(core.includes("'健康醫療','美容美業','餐飲食品','零售電商','直銷／社群電商'"),'A-kaffit industry options preserved');
ok(core.includes("required:['detected','incomplete','cropConfidence','boundingBox','corners','clippedEdges']"),'localization schema preserved');
ok(core.includes("additionalProperties:false") && core.includes("strict:true,schema:OCR_SCHEMA"),'strict JSON schema preserved');
ok(core.includes("detail:'high'"),'A-kaffit high-detail image input preserved');
ok(core.includes("https://api.openai.com/v1/responses"),'Responses API used');
ok(core.includes("reasoning:{effort:'low'}"),'reasoning effort preserved');
ok(core.includes("max_output_tokens:2100"),'output token limit preserved');
ok(core.includes("'gpt-5.6-terra'"),'A-kaffit model fallback preserved');
ok(core.includes('不得包入明顯桌面、手掌、鍵盤等背景'),'background exclusion prompt preserved');
ok(core.includes('不得憑空補出不存在的邊'),'incomplete edge rule preserved');
ok(entry.includes("import { recognizeAkaffitBusinessCard } from './worker/a-kaffit-card-recognize.mjs';"),'worker imports A-kaffit recognize core');
ok(entry.includes("if (action === 'recognizeCardWithGPT4o')"),'recognize action intercepted before legacy worker');
ok(entry.includes('const result = await recognizeAkaffitBusinessCard(payload, env);'),'recognize action uses A-kaffit core');
ok(!adapter.includes("if(typeof window.normalizeOcrCardData==='function')return window.normalizeOcrCardData(ocr);"),'A-kaffit field names are not remapped through legacy OCR first');
ok((adapter.match(/fetchAPI\('recognizeCardWithGPT4o'/g)||[]).length===1,'frontend still performs exactly one OCR call');
console.log('A-kaffit recognize backend parity contract passed.');
