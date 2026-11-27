import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeIndustry,gradeFor,profileOptions} from '../js/modules/industry-radar-scores.mjs';

test('grade boundaries include 0 and 100 and reject invalid totals', () => {
  for (const [value,expected] of [[0,'D'],[49,'D'],[50,'C'],[64,'C'],[65,'B'],[79,'B'],[80,'A'],[89,'A'],[90,'S'],[100,'S']]) {
    assert.equal(gradeFor(value),expected);
  }
  for (const invalid of [-1,101,NaN,null,'65',64.9]) assert.throws(() => gradeFor(invalid),RangeError);
});

test('finance replicates the supplied assumptions and 68-point scenario', () => {
  const result = analyzeIndustry('財務規劃師');
  assert.deepEqual(result.groups.map(group => group.score),[15,28,25]);
  assert.equal(result.total,68);
  assert.equal(result.grade,'B');
  assert.equal(result.directoryId,'professional');
  assert.match(result.assumptions[0],/假設|情境/);
  assert.match(result.risks[0].risk,/金融商品/);
});

test('each profile supplies 10 reasoned bounded integers, consistent grades, examples and usable strategies', () => {
  const observedGrades = new Set();
  assert.equal(new Set(profileOptions.map(item => item.id)).size,17);
  for (const {id,label} of profileOptions) {
    const result = analyzeIndustry(id);
    assert.equal(result.id,id);
    assert.equal(analyzeIndustry(label).id,id);
    assert.deepEqual(result.groups.map(item => item.max),[30,30,40]);
    const indicators = result.groups.flatMap(group => group.criteria);
    assert.deepEqual(indicators.map(item => item.id),['R1','R2','R3','O1','O2','O3','I1','I2','I3','I4']);
    assert.equal(indicators.reduce((sum,item) => sum+item.score,0),result.total);
    assert.ok(indicators.every(({score,reason}) => Number.isInteger(score) && score >= 0 && score <= 10 && reason.length > 5));
    assert.equal(gradeFor(result.total),result.grade);
    observedGrades.add(result.grade);
    assert.deepEqual(result.cases.map(item => item.type),['repurchase','outflow','inflow']);
    for (const example of result.cases) {
      assert.equal(example.originalAmount-example.discount,example.actualPayment);
      assert.ok(example.illustrative && example.issued >= 0 && example.actualPayment >= 0);
      assert.ok(example.service.length && example.benefit.length);
    }
    assert.ok(result.applications.repurchase && result.applications.outflow && result.applications.inflow);
    assert.ok(result.assumptions.length && result.risks[0].solution && result.sales.objection && result.sales.invitation);
    assert.deepEqual(analyzeIndustry(id),result);
  }
  assert.ok(observedGrades.size >= 4);
});

test('specific service inputs and industry ids select the right profile', () => {
  for (const [input,id,directory] of [
    ['我是室內設計師','interior','local'],['會計師','accounting','professional'],['房屋仲介','real-estate','real-estate'],
    ['ＨＯＴＥＬ','lodging','lodging'],['餐廳','dining','dining'],['財務顧問','finance','professional']
  ]) {
    assert.equal(analyzeIndustry(input).id,id);
    assert.equal(analyzeIndustry(input).directoryId,directory);
  }
});

test('unclear, unsupported, or multi-industry inputs are not arbitrarily assigned a score', () => {
  for (const input of ['',null,{},'顧問','foo','律師','飯店兼營餐廳','製造／餐飲','律師與餐飲','天地創作','壽司'.repeat(80)]) {
    const response=analyzeIndustry(input);
    assert.equal(response.status,'clarify',String(input));
    assert.equal(response.total,undefined);
    assert.ok(response.question && response.options.length);
  }
  assert.deepEqual(analyzeIndustry('飯店兼營餐廳').options.map(item => item.id).sort(),['dining','lodging']);
});

test('healthcare baseline excludes financial incentives and does not use referrals to patients', () => {
  const result=analyzeIndustry('診所');
  assert.equal(result.grade,'D');
  assert.ok(result.cases.every(example => example.discount === 0 && example.issued === 0 && example.actualPayment === 0));
  assert.match(result.risks[0].solution,/衛教/);
});

test('a reward issued for a future visit does not reduce the cash due today', () => {
  const newDiner=analyzeIndustry('餐廳').cases.find(item => item.type === 'inflow');
  assert.equal(newDiner.issued,20);
  assert.equal(newDiner.discount,20);
  assert.equal(newDiner.actualPayment,180);
  assert.equal(analyzeIndustry('財務規劃師').cases.every(item => item.issued === 0),true);
});
