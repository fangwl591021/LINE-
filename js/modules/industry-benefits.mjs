import {analyzeIndustry} from './industry-radar-scores.mjs?v=1';
import {getIndustryLinks, linkScoreNote} from './industry-radar-links.mjs?v=1';
import {showIndustryPartners} from './industry-benefits-partners.mjs?v=2';
import {industries} from './industry-benefits-data.mjs?v=2';

const byId = id => document.getElementById(id);
const money = value => 'NT$' + value.toLocaleString('zh-TW');
const flows = {repurchase:'導流回購', outflow:'客戶外溢', inflow:'新客導入'};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function definitions(rows) {
  const list = element('dl');
  for (const [term, value] of rows) list.append(element('dt', term), element('dd', value));
  return list;
}

function listOf(values) {
  const list = element('ul');
  for (const text of values) list.append(element('li', text));
  return list;
}

function renderScores(report) {
  byId('report-title').textContent = report.industry;
  byId('judgement').textContent = report.summary;
  byId('scenario').textContent = report.assumptions[0];
  byId('score-total').textContent = report.total;
  byId('score-grade').textContent = report.grade + ' 級 · ' + report.gradeLabel;
  const groups = byId('groups');
  const criteria = byId('criteria');
  groups.replaceChildren();
  criteria.replaceChildren();
  byId('breakdown').open = false;
  for (const group of report.groups) {
    const bar = element('progress');
    bar.max = group.max;
    bar.value = group.score;
    bar.setAttribute('aria-label', group.label);
    const row = element('div', undefined, 'metric');
    row.append(element('span', group.label), bar, element('strong', group.score + ' / ' + group.max));
    groups.append(row);
    criteria.append(element('h4', group.label));
    for (const item of group.criteria) {
      const line = element('div', undefined, 'criterion');
      line.append(element('span', item.label), element('strong', item.score + ' / ' + item.max), element('p', item.reason));
      criteria.append(line);
    }
  }
  const confidence = ({medium:'中',low:'低',high:'高'})[report.confidence] || report.confidence;
  byId('basis').replaceChildren(element('p', '評估信心：' + confidence), listOf(report.assumptions));
}

function renderLinks(report) {
  byId('link-note').textContent = linkScoreNote;
  const list = byId('link-list');
  list.replaceChildren();
  for (const link of getIndustryLinks(report.id)) {
    const card = element('details');
    const header = element('summary', undefined, 'link-summary');
    header.append(element('span', link.industry, 'link-name'), element('span', link.score + ' / 100', 'link-score'));
    card.append(header, element('p', link.reason), definitions([
      ['我推薦給對方', link.outbound], ['對方推薦給我', link.inbound], ['可試辦的服務', link.service],
      ['購物金用法', link.points], ['合作前確認', link.limitations]
    ]), element('p', link.criteria.map(item => item.label + ' ' + item.score + '/' + item.max).join(' · '), 'fine'));
    list.append(card);
  }
  if (!list.childElementCount) list.append(element('p', '這個產業的雙向合作方式仍待驗證。'));
}

function renderExamples(report) {
  byId('points-strategy').textContent = report.pointsStrategy;
  const list = byId('cases');
  list.replaceChildren(element('p', '以下金額為試算。原價扣除本次折抵為實付，新贈購物金供下次依條件使用。', 'fine'));
  for (const [index, item] of report.cases.entries()) {
    const card = element('div', undefined, 'case-card');
    const flow = Object.keys(flows)[index];
    card.append(element('h4', (flows[item.type] || flows[flow]) + ' · ' + item.service),
      element('p', report.applications[item.type] || report.applications[flow]),
      element('p', '原價 ' + money(item.originalAmount) + '，本次折抵 ' + money(item.discount) + '，實付 ' + money(item.actualPayment) + '。另贈購物金 ' + item.issued + ' 元。'),
      element('p', item.benefit, 'fine'));
    list.append(card);
  }
}

function renderPitch(report) {
  const {sales, risks} = report;
  byId('pitch').replaceChildren(definitions([
    ['切入方向', sales.focus], ['先試辦', sales.priority], ['對方可能會問', sales.objection]
  ]), element('h4', '可以這樣邀請'), element('blockquote', sales.invitation),
  element('h4', '合作前先核對'), definitions(risks.map(item => [item.risk, item.solution])));
  const guidance = {
    finance:['查看金管會招攬及營業促銷規範','https://law.fsc.gov.tw/LawContent.aspx?id=GL000327'],
    healthcare:['查看醫療法第 61 條','https://law.moj.gov.tw/LawClass/LawSingle.aspx?flno=61&pcode=L0020021']
  }[report.id];
  if (guidance) {
    const source = element('a', guidance[0]);
    source.href = guidance[1];
    byId('pitch').append(source);
  }
  const rows = [
    ['電子名片與名片收藏', '分享自己的服務與聯絡方式。雙方交換名片後，收藏對方的名片方便回訪。'],
    ['行事曆', '把試辦日期、回訪與檢討時間排進行事曆。'],
    ['智能配對', '依專長、服務或合作需求，尋找可進一步接洽的人。']
  ];
  const legacy = industries.find(item => item.id === report.directoryId);
  if (['finance','healthcare','accounting'].includes(report.id)) {
    rows.push(['商城曝光', '可先整理獨立提供的服務、資格與適用條件，再確認可公開的內容。'],
      ['共用受眾', '共同發布公開活動，讓有興趣的人自行報名或聯繫。']);
  } else if (legacy) {
    rows.push(['商城曝光', legacy.ideas[2]], ['共用受眾', legacy.ideas[3]]);
  }
  byId('platform').replaceChildren(definitions(rows));
}

function showReport(input) {
  const result = analyzeIndustry(input);
  byId('partner-slot').replaceChildren();
  const report = byId('report');
  const clarify = byId('clarify');
  for (const button of document.querySelectorAll('[data-example]')) {
    button.setAttribute('aria-pressed', String(button.dataset.example === input));
  }
  if (result.status !== 'ok') {
    report.hidden = true;
    clarify.hidden = false;
    byId('clarify-text').textContent = result.question;
    byId('profile').replaceChildren(new Option('請選擇主要服務', ''), ...result.options.map(option => new Option(option.label, option.id)));
    return;
  }
  clarify.hidden = true;
  renderScores(result);
  renderLinks(result);
  renderExamples(result);
  renderPitch(result);
  report.hidden = false;
  const panel = byId('partner-template').content.firstElementChild.cloneNode(true);
  byId('partner-slot').append(panel);
  showIndustryPartners(panel, result.id);
  byId('report-title').focus();
}

byId('industry-form').addEventListener('submit', event => {
  event.preventDefault();
  showReport(byId('industry').value.trim());
});

byId('profile').addEventListener('change', event => {
  if (!event.target.value) return;
  byId('industry').value = event.target.selectedOptions[0].textContent;
  showReport(event.target.value);
});

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    byId('industry').value = button.dataset.example;
    showReport(button.dataset.example);
  });
}
