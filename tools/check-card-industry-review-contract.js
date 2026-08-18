#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const adapterPath = path.join(root, 'js/modules/a-kaffit-card-scanner-adapter.js');
const source = fs.readFileSync(adapterPath, 'utf8');

function assertIncludes(fragment, label) {
  if (!source.includes(fragment)) {
    console.error(`Card industry review contract failed: missing ${label}`);
    process.exit(1);
  }
}

const requiredIndustries = [
  '健康醫療','美容美業','餐飲食品','零售電商','直銷／社群電商',
  '金融保險','房地產居家','工商專業服務','教育培訓','科技資訊',
  '行銷設計媒體','製造批發貿易','旅遊交通服務','社團協會公益','其他行業'
];

requiredIndustries.forEach((industry) => assertIncludes(`'${industry}'`, `industry option ${industry}`));
assertIncludes("const INDUSTRY_PENDING = '待分類'", 'pending classification state');
assertIncludes('primaryIndustry', 'AI primary industry mapping');
assertIncludes('secondaryIndustries', 'AI secondary industry mapping');
assertIncludes('industryConfidence', 'AI industry confidence mapping');
assertIncludes('name="ak-primary-industry"', 'single primary-industry selector');
assertIncludes('data-ak-secondary-industry', 'secondary-industry checkboxes');
assertIncludes('checked.length>2', 'maximum two secondary industries guard');
assertIncludes('cfg.industryClassification=classification', 'custom_config persistence');
assertIncludes("locked:true,source:'human_review'", 'human review lock');
assertIncludes("card['標籤']", 'industry tag persistence');
assertIncludes('installIndustryFilterBridge', 'card-folder industry filter bridge');

const compilable = source.replace(/^import[^\n]*\n/, '');
try {
  new Function(compilable);
} catch (error) {
  console.error('Card industry review contract failed: adapter syntax error');
  console.error(error.stack || error.message);
  process.exit(1);
}

console.log('Card industry review contract: success');
