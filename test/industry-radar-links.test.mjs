import assert from 'node:assert/strict';
import test from 'node:test';
import {getIndustryLinks, linkScoreNote} from '../js/modules/industry-radar-links.mjs';

const supported = [
  'finance','accounting','interior','dining','lodging','real-estate','learning',
  'healthcare','professional','fitness','events','local','beauty','creative','b2b','travel','retail'
];

test('all profiles offer distinct two-way proposals with verifiable totals and stable ordering', () => {
  for (const id of supported) {
    const links = getIndustryLinks(id);
    assert.ok(links.length > 0 && links.length <= 10, id);
    assert.equal(new Set(links.map(row => row.industry)).size, links.length, id);
    assert.deepEqual(links, getIndustryLinks(id));
    assert.deepEqual(links.map(link => link.score), links.map(link => link.score).sort((a,b) => b-a));
    for (const link of links) {
      assert.equal(link.criteria.length, 5);
      assert.equal(new Set(link.criteria.map(row => row.label)).size, 5);
      assert.ok(link.criteria.every(({score,max}) => Number.isInteger(score) && score >= 0 && score <= max && max === 20));
      assert.equal(link.score, link.criteria.reduce((total, {score}) => total + score, 0));
      assert.notEqual(link.outbound, link.inbound);
      for (const field of ['reason','outbound','inbound','service','points','limitations']) {
        assert.ok(link[field].length > 5 && !link[field].includes('undefined'), id + ' ' + field);
      }
    }
  }
});

test('six anchor industries have a full shortlist; interior leads with fitting collaborators', () => {
  for (const id of ['finance','accounting','interior','dining','real-estate','lodging']) {
    assert.equal(getIndustryLinks(id).length, 10, id);
  }
  const interior = getIndustryLinks('interior');
  assert.equal(interior[0].industry, '家具選配');
  assert.match(interior[0].outbound, /尺寸試坐家具/);
  assert.match(interior[0].inbound, /動線與尺寸需要重排/);
  assert.ok(getIndustryLinks('lodging').some(item => item.industry === '旅遊接駁'));
  assert.ok(getIndustryLinks('finance').some(item => item.industry === '會計稅務'));
  assert.ok(getIndustryLinks('accounting').some(item => item.industry === '人資培訓'));
});

test('reverse pathways reverse directional dimensions as well as the actual referral moments', () => {
  const a = getIndustryLinks('lodging').find(link => link.industry === '餐飲與烘焙');
  const b = getIndustryLinks('dining').find(link => link.industry === '旅宿');
  assert.equal(a.score, b.score);
  assert.notEqual(a.criteria[2].score, a.criteria[3].score);
  assert.equal(a.criteria[2].score, b.criteria[3].score);
  assert.equal(a.criteria[3].score, b.criteria[2].score);
  assert.match(a.outbound, /附近的第一頓晚餐/);
  assert.match(b.inbound, /附近的第一頓晚餐/);
});

test('regulated industries use public opt-in activities and limit incentives', () => {
  for (const id of ['finance','healthcare','accounting','real-estate']) {
    for (const link of getIndustryLinks(id)) {
      assert.match(link.points, /待雙方確認適用範圍/);
      assert.match(link.points, /只分享公開資訊/);
    }
  }
  assert.ok(getIndustryLinks('healthcare').every(link => link.limitations.includes('病人轉介及就醫獎勵均排除')));
});

test('unsupported inputs and inherited object keys return no invented industry matches', () => {
  for (const id of [undefined, null, 'general', 'toString', '__proto__', 'unknown']) {
    assert.deepEqual(getIndustryLinks(id), []);
  }
  assert.match(linkScoreNote, /推估/);
  assert.match(linkScoreNote, /實際轉介與消費紀錄驗證/);
});
