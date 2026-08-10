import assert from 'node:assert/strict';
import { hasUsefulCardInput, isTaipeiOffPeak, parseFateTags } from '../worker/card-fate-tag-analysis.mjs';

assert.equal(isTaipeiOffPeak(new Date('2026-08-10T18:15:00.000Z'), 2, 5), true);
assert.equal(isTaipeiOffPeak(new Date('2026-08-10T21:00:00.000Z'), 2, 5), false);
assert.equal(hasUsefulCardInput({ name: '王小明' }), true);
assert.equal(hasUsefulCardInput({ notes: '只有備註' }), false);

assert.deepEqual(parseFateTags('```json\n{"Personality":"重視條理，適合先提供重點摘要再補充完整資料。","Hobbies":"偏好實用交流，可用產業案例與共同話題開啟對話。","Wealth":"預算溝通宜先說明範圍與風險，不預測任何財務結果。","Health":"互動宜尊重工作節奏，避免提出醫療判斷或健康診斷。","Career":"適合以具體目標、時程和下一步行動推進商務合作。"}\n```'), {
  personality: '重視條理，適合先提供重點摘要再補充完整資料。',
  hobbies: '偏好實用交流，可用產業案例與共同話題開啟對話。',
  wealth: '預算溝通宜先說明範圍與風險，不預測任何財務結果。',
  health: '互動宜尊重工作節奏，避免提出醫療判斷或健康診斷。',
  career: '適合以具體目標、時程和下一步行動推進商務合作。'
});

assert.throws(() => parseFateTags('{"personality":"只有一項"}'), /MODEL_TAGS_INCOMPLETE/);
console.log('Card fate tag analysis tests passed.');
