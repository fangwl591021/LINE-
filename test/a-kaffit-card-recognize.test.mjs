import assert from 'node:assert/strict';
import test from 'node:test';

import { recognizeAkaffitBusinessCard } from '../worker/a-kaffit-card-recognize.mjs';

const image = 'data:image/jpeg;base64,ZmFrZS1jYXJk';
const recognized = {
  isBusinessCard:true,
  confidence:0.98,
  language:'zh-TW',
  cardLocalization:{
    detected:true,
    incomplete:false,
    cropConfidence:0.95,
    boundingBox:{x:0.1,y:0.2,width:0.8,height:0.5},
    corners:[{x:0.1,y:0.2},{x:0.9,y:0.2},{x:0.9,y:0.7},{x:0.1,y:0.7}],
    clippedEdges:[],
  },
  primaryIndustry:'科技資訊',
  secondaryIndustries:[],
  industryConfidence:0.9,
  displayName:'王小明',
  englishName:'',
  companyName:'測試公司',
  jobTitle:'工程師',
  department:'',
  mobile:'',
  companyPhone:'',
  email:'',
  websiteUrl:'',
  lineUrl:'',
  address:'',
  serviceDescription:'',
  note:'',
};

test('falls back to Gemini when OpenAI has no credits', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({url:String(url), init});
    if (calls.length === 1) {
      return new Response(JSON.stringify({error:{message:'You have no credits remaining.'}}), {status:429});
    }
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(recognized)}]}}]});
  });

  const result = await recognizeAkaffitBusinessCard(
    {base64Image:image},
    {OPENAI_API_KEY:'sk-test-key', GEMINI_API_KEY:'gemini-test-key'},
  );

  assert.deepEqual(result, recognized);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\.openai\.com\/v1\/responses/);
  assert.match(calls[1].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.7-flash:generateContent/);
  assert.equal(calls[1].init.headers['x-goog-api-key'], 'gemini-test-key');
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
  assert.equal(body.contents[0].parts[1].inline_data.data, 'ZmFrZS1jYXJk');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal('additionalProperties' in body.generationConfig.responseSchema, false);
});

test('uses Gemini directly when no OpenAI key is configured', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(recognized)}]}}]});
  });

  const result = await recognizeAkaffitBusinessCard(
    {base64Image:image},
    {GEMINI_API_KEY:'gemini-test-key', GEMINI_VISION_MODEL:'gemini-3.7-flash'},
  );

  assert.equal(result.displayName, '王小明');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /generativelanguage\.googleapis\.com/);
});

test('rejects the request when neither provider is configured', async () => {
  await assert.rejects(
    recognizeAkaffitBusinessCard({base64Image:image}, {}),
    /名片 AI 辨識服務尚未連線/,
  );
});
