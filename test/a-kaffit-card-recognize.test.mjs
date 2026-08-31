import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProfileDescription,
  enrichSocialContacts,
  lineUrlFromId,
  normalizeLineContactUrl,
  recognizeAkaffitBusinessCard,
} from '../worker/a-kaffit-card-recognize.mjs';

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
  lineId:'',
  lineUrl:'',
  instagramId:'',
  socialAccounts:'',
  address:'',
  serviceDescription:'',
  profileDescription:'測試公司的工程師王小明，歡迎透過名片上的聯絡方式洽詢。',
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

test('converts personal and official LINE IDs to friend URLs', () => {
  assert.equal(lineUrlFromId('jhan1201'), 'https://line.me/ti/p/~jhan1201');
  assert.equal(lineUrlFromId('LINE ID: @demo123'), 'https://line.me/R/ti/p/%40demo123');
  assert.equal(lineUrlFromId('not a valid id'), '');
});

test('accepts only trusted LINE contact hosts', () => {
  assert.equal(normalizeLineContactUrl('http://line.me/ti/p/~jhan1201'), 'https://line.me/ti/p/~jhan1201');
  assert.equal(normalizeLineContactUrl('https://lin.ee/abc123'), 'https://lin.ee/abc123');
  assert.equal(normalizeLineContactUrl('https://example.com/line.me/ti/p/~jhan1201'), '');
});

test('builds canonical social accounts without losing other platforms', () => {
  const result = enrichSocialContacts({
    lineId:'jhan1201',
    lineUrl:'',
    instagramId:'q_q_1201',
    socialAccounts:'LINE ID: jhan1201｜Instagram: q_q_1201｜Facebook: example.page',
  });
  assert.equal(result.lineUrl, 'https://line.me/ti/p/~jhan1201');
  assert.equal(result.socialAccounts, 'LINE: https://line.me/ti/p/~jhan1201｜Instagram: https://www.instagram.com/q_q_1201｜Facebook: example.page');
});

test('keeps the AI profile description when it is present', () => {
  assert.equal(
    buildProfileDescription({profileDescription:'任職於中原大學產學營運處，職稱為專案經理。'}),
    '任職於中原大學產學營運處，職稱為專案經理。',
  );
});

test('builds a factual non-empty profile fallback without inventing services', () => {
  assert.equal(
    buildProfileDescription({displayName:'高靖航',companyName:'中原大學',department:'產學營運處',jobTitle:'專案經理'}),
    '高靖航任職於中原大學，職務為產學營運處 專案經理。歡迎透過名片所列聯絡方式洽詢。',
  );
});
