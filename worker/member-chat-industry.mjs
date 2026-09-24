// Read-only directory filter. Keep fallback order/keywords aligned with the existing card folder.
const RULES = [
  ['健康醫療', '醫療|診所|醫院|藥局|健康|保健|復健|牙醫|護理|中醫|營養'],
  ['美容美業', '美容|美髮|美甲|美睫|彩妝|造型|SPA|芳療|美體'],
  ['餐飲食品', '餐飲|食品|餐廳|咖啡|飲料|烘焙|便當|料理|食材'],
  ['零售電商', '零售|電商|購物|批發|百貨|選物|網拍|商城'],
  ['直銷／社群電商', '直銷|社群電商|團購|微商|代理|經銷'],
  ['金融保險', '金融|保險|理財|投資|銀行|證券|貸款'],
  ['房地產居家', '房地產|房仲|不動產|室內設計|裝潢|家具|居家'],
  ['工商專業服務', '顧問|法律|會計|工程|建築|貿易|人力|清潔'],
  ['教育培訓', '教育|培訓|課程|講師|補習|學習|教學'],
  ['科技資訊', '科技|資訊|軟體|系統|AI|網路|程式|雲端'],
  ['行銷設計媒體', '行銷|廣告|設計|媒體|社群|公關|攝影|影音'],
  ['製造批發貿易', '製造|工廠|批發|進出口|貿易|供應鏈|原料'],
  ['旅遊交通服務', '旅遊|旅行|飯店|民宿|交通|租車|導遊|航空'],
  ['社團協會公益', '協會|社團|公益|基金會|商會|公會|非營利']
];
export const CHAT_INDUSTRIES = [...RULES.map(([label]) => label), '其他行業', '待分類'];
// Only code-owned constants are interpolated; the selected industry is always bound as ?4.
const literal = value => "'" + value.replace(/'/g, "''") + "'";
const config = "(CASE WHEN json_valid(c.custom_config) THEN c.custom_config ELSE '{}' END)";
const primary = `TRIM(COALESCE(json_extract(${config},'$.industryClassification.primary'),''))`;
const inLabels = CHAT_INDUSTRIES.map(literal).join(',');
const tokenMatch = (source, target) => `instr('|'||replace(replace(replace(replace(COALESCE(${source},''),'，','|'),'、','|'),',','|'),' ','')||'|','|'||${target}||'|')>0`;
const tags = "(CASE WHEN json_valid(c.tags) THEN CASE WHEN json_type(c.tags)='array' THEN c.tags ELSE json_array(c.tags) END ELSE json_array(COALESCE(c.tags,'')) END)";
const tagMatch = target => `EXISTS(SELECT 1 FROM json_each(${tags}) tag WHERE ${tokenMatch('tag.value', target)})`;
const hasIndustryTags = CHAT_INDUSTRIES.map(label => tagMatch(literal(label))).join(' OR ');
const source = "lower(COALESCE(c.services,'')||' '||COALESCE(c.tags,'')||' '||COALESCE(c.company_name,'')||' '||COALESCE(c.title,''))";
const fallback = `CASE ${RULES.map(([label, words]) => `WHEN ${words.split('|').map(word => `instr(${source},${literal(word.toLowerCase())})>0`).join(' OR ')} THEN ${literal(label)}`).join(' ')} ELSE '其他行業' END`;
export const CHAT_INDUSTRY_FILTER = `(?4='' OR ${primary}=?4
  OR EXISTS(SELECT 1 FROM json_each(${config},'$.industryClassification.secondary') secondary WHERE ${tokenMatch('secondary.value', '?4')})
  OR (${primary} NOT IN (${inLabels}) AND (${tagMatch('?4')} OR (NOT (${hasIndustryTags}) AND (${fallback})=?4))))`;
