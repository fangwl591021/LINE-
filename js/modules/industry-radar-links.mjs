// The five dimensions are editorial estimates of a specific two-way proposal.
// A directory listing or the score of either industry's own business is not an input.
export const linkScoreNote = '這是依合作情境推估的分數，每項最高 20 分。分數反映雙方在指定服務、時段與客群上的配合條件，尚待實際轉介與消費紀錄驗證。';

const dimensions = ['客群重疊', '服務互補', '我方導給對方', '對方導給我方', '購物金雙向應用'];

// label, bookable item, trial scope to agree before offering shopping credits
const sectors = {
  'finance': ['財務規劃', '家庭預算入門工作坊', '公開課程'],
  accounting: ['會計稅務', '開業帳務入門課', '教育課程'],
  'interior': ['室內設計', '小空間配置諮詢', '定價配置諮詢'],
  dining: ['餐飲與烘焙', '平日雙人餐', '平日指定餐點'],
  lodging: ['旅宿', '平日雙人住房', '平日指定房型'],
  'real-estate': ['房仲', '社區看屋預約', '社區公開活動'],
  learning: ['教育與培訓', '單堂體驗課', '指定體驗課'],
  healthcare: ['健康專業', '公開生活保健講座', '獨立的一般教育活動'],
  professional: ['專業顧問', '小型企業經營工作坊', '公開教育活動'],
  fitness: ['運動場館', '初階小班體驗', '離峰體驗課'],
  events: ['活動企劃', '小型聚會場地體驗', '平日場地體驗'],
  local: ['到府清潔', '入住前基礎清潔', '指定坪數清潔'],
  beauty: ['美業與造型', '預約造型體驗', '平日時段造型'],
  creative: ['攝影與設計', '定時段形象拍攝', '指定拍攝方案'],
  b2b: ['企業與科技服務', '預約系統示範工作坊', '指定系統操作課'],
  travel: ['在地導覽', '小團街區散步', '指定場次導覽'],
  retail: ['零售選物', '當季伴手禮組', '指定禮盒'],
  legal: ['法律服務', '契約識讀公開講座', '公開教育活動'],
  seniors: ['樂齡生活', '退休生活規劃體驗課', '一般生活課程'],
  career: ['職涯服務', '職涯轉換工作坊', '定價工作坊'],
  coworking: ['共享辦公', '平日共享工作日票', '離峰日票'],
  office: ['辦公用品', '小型工作室開業用品組', '指定用品組'],
  payroll: ['人資培訓', '首次聘僱實務課', '指定課程'],
  furniture: ['家具選配', '小宅家具試坐及選配', '指定家具配件'],
  curtains: ['窗簾布藝', '到府窗簾丈量與選樣', '指定布樣或安裝項目'],
  lighting: ['燈飾照明', '住宅燈光選樣體驗', '指定燈具'],
  appliances: ['家電選購', '嵌入式家電尺寸諮詢', '指定安裝加購'],
  cabinets: ['系統櫃', '收納需求與櫃體估算', '指定收納配件'],
  moving: ['搬家搬運', '小家庭搬遷估價', '指定到府打包加購'],
  bedding: ['寢具用品', '寢具尺寸與布料體驗', '指定枕套組'],
  homecare: ['居家安全設備', '居家門鎖到府評估', '指定門鎖安裝加購'],
  floral: ['花藝', '桌花體驗課', '指定桌花課'],
  bookstore: ['書店', '週末讀書會', '指定選書或付費活動'],
  bakeryClass: ['烘焙教室', '親子點心課', '指定課程材料包'],
  bike: ['單車租借', '半日單車租借', '平日車款'],
  transit: ['旅遊接駁', '預約車站接駁', '指定路線'],
  museum: ['展覽場館', '週末主題展', '指定授權票種'],
  crafts: ['手作工坊', '在地手作課', '指定課程材料包'],
  laundry: ['洗衣服務', '旅行衣物洗烘組', '指定洗烘服務'],
  coworkTravel: ['行李寄放', '單件短時寄放', '離峰寄放時段'],
  sportsgear: ['運動用品', '入門裝備體驗', '指定配件'],
  printer: ['印刷與包裝', '小量打樣服務', '指定打樣規格']
};

// One entry serves both directions. The two moments describe a visible need in
// the source's and target's own journeys, without transferring a customer list.
const proposals = [
  ['finance','accounting',[17,19,17,17,11],'想分清家庭支出與開業帳務','整理完營業收支，想另訂家庭預算'],
  ['finance','legal',[17,18,15,14,9],'正整理家庭文件，想了解契約常用詞','處理家庭規劃後，想學習盤點日常支出'],
  ['finance','real-estate',[17,18,14,18,9],'已訂購屋預算，接著想實地看屋','選屋前想估算每月可負擔的居住支出'],
  ['finance','seniors',[18,17,16,16,14],'盤點退休預算後，想安排日常生活活動','規劃退休生活時想把每月開支列成表'],
  ['finance','career',[15,17,14,18,14],'現金收支盤點後正準備轉職','考慮轉職空窗期，想先安排生活預備金'],
  ['finance','professional',[14,17,14,15,12],'正把副業發展成小企業','規劃創業時想區分個人和事業預算'],
  ['finance','learning',[14,16,14,15,13],'替家庭成員編列進修預算後想試課','選擇長期進修前想先排出學費與生活費'],
  ['finance','interior',[14,17,13,16,13],'已劃出裝修預算，希望了解空間配置的取捨','正在比較裝修支出與家庭年度預算'],
  ['finance','coworking',[14,16,14,16,13],'已把接案收入編入預算，想試用工作地點','準備從受僱改為接案，想學習管理不固定收入'],
  ['finance','payroll',[14,15,12,15,12],'準備為工作室初次聘僱員工','安排員工教育，想加開家庭預算公開課'],

  ['accounting','professional',[18,18,17,18,12],'帳務建好後想訂定營運目標','準備開業，要先弄清單據和帳本怎麼整理'],
  ['accounting','legal',[18,18,15,16,9],'創業前想先讀懂租約或合夥文件','創辦人處理完合作文件，準備建立帳務流程'],
  ['accounting','payroll',[18,19,18,18,14],'剛設好行號帳務，準備聘第一位員工','整理完聘僱流程，接著要學薪資紀錄如何入帳'],
  ['accounting','coworking',[18,17,16,18,14],'準備開業，短期需要工作座位','租下第一個工作位置，正在準備開始接案收款'],
  ['accounting','office',[15,16,15,14,14],'開始記帳，要備齊整理憑證的用品','買齊工作室用品後，想知道如何建收支檔案'],
  ['accounting','b2b',[17,18,16,17,13],'剛整理好收款及開單流程，準備選系統','準備導入預約和收款系統，想先理清記帳流程'],
  ['accounting','printer',[15,16,14,15,12],'開始營業，要印製服務單和包裝','準備小量上市，想知道開業後應保留哪些單據'],
  ['accounting','creative',[15,15,13,16,12],'完成開業準備，打算製作品牌形象照','開始以工作室名義接案，想整理收支和憑證'],
  ['accounting','learning',[14,16,12,15,13],'安排店員訓練，想試辦小班教學','剛開始收學費，想建立小教室的記帳流程'],

  ['interior','furniture',[19,20,19,18,17],'平面配置確定，準備按尺寸試坐家具','看中大型家具，發現家中動線與尺寸需要重排'],
  ['interior','real-estate',[17,19,14,19,10],'原屋空間確實不足，準備比較其他物件','看中物件，想先了解新家能如何配置'],
  ['interior','curtains',[18,19,18,15,17],'配置接近定案，想選擇相襯的窗簾布樣','換窗簾時也希望重新規劃客廳採光與配色'],
  ['interior','appliances',[18,20,17,16,16],'配置廚房時需要核對嵌入家電的尺寸','選購嵌入家電時發現原有廚房需要調整'],
  ['interior','lighting',[18,20,18,16,17],'格局與使用區域已明確，準備試燈色','想更換照明，也需要整體空間的配色建議'],
  ['interior','cabinets',[18,20,18,16,15],'已確認收納位置，要比較櫃體尺寸與五金','估算櫃體後發現玄關和起居室動線需統一規劃'],
  ['interior','local',[16,18,18,12,16],'裝修結束前要預約入住清潔','入住整理時想重新規劃難清潔的區域'],
  ['interior','moving',[16,17,16,12,15],'確認完工時程後要安排家具回搬','打包時才發現新住處的家具擺設需要調整'],
  ['interior','bedding',[15,17,15,12,16],'臥房配置底定，想挑選適合的寢具','購買新床寢具前，想先調整睡眠區布局'],
  ['interior','homecare',[16,18,16,13,14],'確認出入口配置後想評估電子門鎖','換鎖時準備整修玄關，希望一起規劃空間'],

  ['dining','lodging',[18,19,14,19,18],'外地親友來聚餐，準備找附近住宿','入住前想先訂好附近的第一頓晚餐'],
  ['dining','events',[18,19,16,19,18],'聚餐人數增加，需要小型包場空間','訂完聚會場地，接著要預訂聚餐'],
  ['dining','floral',[16,18,15,16,17],'準備紀念日晚餐，想加訂桌花','上完花藝課，想安排周邊聚餐'],
  ['dining','bookstore',[16,17,14,17,17],'等候餐敘時想安排附近的閱讀活動','讀書會結束，想在步行可達的地點續聊'],
  ['dining','bakeryClass',[16,18,15,16,17],'親子用餐後想一起動手做點心','親子課結束時想找有座位的餐廳用餐'],
  ['dining','travel',[18,19,16,19,18],'用餐之後想步行認識周邊街區','完成導覽路線，希望預約沿線餐廳'],
  ['dining','fitness',[15,17,13,15,15],'用餐後詢問附近可預約的平日運動課','離開場館時想找能先訂位的附近餐廳'],
  ['dining','creative',[15,17,14,15,15],'在餐廳談好慶祝活動，想留下聚會照片','拍完紀念照，打算在附近預約慶祝餐'],
  ['dining','museum',[16,18,15,18,16],'安排週末約會，希望飯後能步行逛展','逛完展覽，想找散場後能預約的餐點'],
  ['dining','retail',[16,17,16,14,17],'剛用完餐，想挑當地伴手禮帶回家','挑選禮盒後要找能接待外地親友的餐廳'],

  ['real-estate','moving',[18,20,19,13,10],'已確認交屋日期，開始安排搬家','詢問長程搬遷時仍在比較新家區域'],
  ['real-estate','local',[18,19,18,13,10],'交屋後想在入住前處理清潔','打算出租空屋，清潔完還需要評估招租'],
  ['real-estate','furniture',[18,18,17,12,9],'正在準備搬入，需要試坐與丈量家具','試看大型家具時仍在比較住處大小'],
  ['real-estate','homecare',[17,18,17,12,9],'即將入住，希望先檢查原有門鎖','屋主換妥門鎖，正考慮整理房屋待租'],
  ['real-estate','legal',[16,18,14,12,6],'看完租賃標的後想了解租約常見條款','上完租賃契約公開課，想親自比較不同物件'],
  ['real-estate','coworking',[15,17,15,15,10],'小型團隊尚未租到辦公室，需要過渡空間','團隊擴張，需要從共享座位換成固定租賃空間'],
  ['real-estate','appliances',[16,17,17,10,9],'交屋後開始挑選廚房家電','準備添購家電，同時在評估換屋格局'],
  ['real-estate','lighting',[15,17,16,10,9],'準備出租前打算改善屋內照明','屋主更新設備後準備委託出租'],

  ['lodging','travel',[19,20,19,18,18],'已訂妥房間，想補一個在地半日行程','想把半日行程延長為兩天一夜'],
  ['lodging','bike',[18,19,18,16,17],'住第二晚，隔天想沿河騎車','預約清晨騎車，前一晚想住在取車點附近'],
  ['lodging','transit',[18,20,19,17,15],'已選好房型，需要安排車站到旅宿的接送','預約末班車接送，還在找能配合晚到的住宿'],
  ['lodging','museum',[18,18,16,17,16],'正在規劃雨天備案，想看隔日展覽','計畫跨縣市看展，考慮加住一晚'],
  ['lodging','crafts',[17,18,16,16,17],'希望住兩晚的行程裡有半日手作課','報名外縣市早場工作坊，想先住一晚'],
  ['lodging','laundry',[14,17,17,10,14],'長住或環島途中需要清洗衣物','長程旅客要停留洗衣，還在找隔晚住宿'],
  ['lodging','coworkTravel',[17,18,17,14,15],'退房後要繼續玩，想找下一站行李寄放','寄放行李時旅客想延住，但還沒訂房'],
  ['lodging','events',[17,19,15,18,16],'小團入住，希望安排聚會空間','要參加連續兩天活動，想找鄰近住宿'],
  ['lodging','retail',[15,17,16,13,16],'退房前想帶一份有地方特色的伴手禮','規劃採買行程時考慮在當地留宿'],

  ['beauty','creative',[19,20,18,19,17],'剛完成造型，想預約形象照','排好棚拍日期，需要安排拍攝前造型'],
  ['beauty','events',[17,18,15,17,16],'準備造型時也在籌備個人慶祝活動','安排重要聚會前想整理儀容'],
  ['beauty','floral',[15,16,13,15,16],'準備約會造型，想預約一束花','準備花禮和慶祝活動，打算先做一次造型'],
  ['fitness','sportsgear',[19,19,18,18,17],'試課後想親自比較適合初學者的裝備','剛選完入門器材，想學基本操作'],
  ['fitness','travel',[15,16,13,15,15],'習慣步行運動，假日想探索街區','短程步行後想建立規律運動習慣'],
  ['learning','bookstore',[18,19,18,17,17],'試課後要找延伸閱讀與讀者活動','讀完主題書後希望跟老師實際練習'],
  ['learning','events',[17,18,16,17,16],'班級想辦公開成果聚會','規劃活動時在找可以讓參加者試學的內容'],
  ['healthcare','seniors',[17,18,15,15,6],'參加公開健康活動後想了解社區生活課','規劃退休生活時想參加公開保健教育活動'],
  ['healthcare','learning',[16,17,13,16,6],'參與社區公開講座後想找成人學習活動','規劃學期活動時想加入公開的保健知識講座'],
  ['healthcare','events',[15,16,12,14,5],'希望為社區公開講座找活動空間','正在安排社區活動，要找公開健康教育主題'],
  ['professional','coworking',[17,18,16,17,13],'創業計畫進入試營運，需要臨時辦公空間','正在組成小團隊，希望有人帶著梳理營運計畫'],
  ['professional','creative',[17,17,15,15,14],'完成客群定位後希望製作形象照片','品牌攝影前想先整理公司的服務定位'],
  ['local','moving',[19,20,18,19,18],'搬出清潔已排期，還需要預約清運打包','確認搬家日期後想在交屋前整理舊居'],
  ['local','homecare',[16,16,15,14,16],'清潔玄關時發現想更換門鎖','整理完門禁後，還想在入住前做基本清潔'],
  ['creative','printer',[18,19,17,17,17],'拍妥照片，要製作小量宣傳品','準備送印宣傳品，缺少合適的商品照片'],
  ['b2b','payroll',[17,18,15,17,15],'準備把新員工排班流程搬到系統','第一次做排班紀錄，想試用數位工具'],
  ['b2b','professional',[17,18,16,16,14],'試用數位系統時想梳理公司的工作流程','完成流程盤點後想比較可導入的系統'],
  ['travel','crafts',[18,19,17,18,17],'走完街區路線後想學習在地工藝','從工藝課開始對附近街區故事感到好奇'],
  ['retail','printer',[16,18,15,13,15],'選好禮盒後想印製活動腰封','客製包裝前想先選適合的實體禮品'],
  ['retail','events',[17,18,15,16,17],'正在挑活動贈禮，也想規劃小型聚會','辦好活動場地後，要準備給來賓的禮物']
];

const conditions = {
  'finance': '先由承辦單位核對金融業務與課程的適用規範，排除金融交易、商品招攬及依成交給付的介紹費。',
  accounting: '由事務所確認執業獨立性及利益衝突，課程與個案簽證分別報價。',
  legal: '先請承辦專業人士確認招攬、介紹費及利益衝突，公開課和個案委任分開。',
  'real-estate': '仲介自行確認適用規範、服務費及合作揭露。此方案的購物金限於另外列明的活動項目。',
  healthcare: '先由承辦單位核對公開教育活動的適用規範。診療、購藥、病人轉介及就醫獎勵均排除於此提案。',
  professional: '先確認資格、個案保密義務及是否涉及抽成或利益衝突。',
  'interior': '設計、丈量與施工分別確認報價和責任，介紹供應商時揭露合作關係。',
  lodging: '先對齊可用房量、日期、取消及退款條件。',
  dining: '先對齊供餐時段、可接人數及訂位方式。',
  fitness: '確認體驗課適合程度及現場名額，鼓勵客人自行預約。',
  transit: '先確認供應資格、可接路線、載客容量與改期責任。'
};
const regulated = new Set(['finance','accounting','legal','healthcare','professional','real-estate']);

function describeProposal(sourceId, targetId, scores, outboundNeed, inboundNeed) {
  const [source, sourceService, sourceCredit] = sectors[sourceId];
  const [target, targetService, targetCredit] = sectors[targetId];
  const conditionsForPair = [conditions[sourceId], conditions[targetId]].filter(Boolean);
  const restricted = regulated.has(sourceId) || regulated.has(targetId);
  return {
    industry: target,
    score: scores.reduce((total, score) => total + score, 0),
    criteria: dimensions.map((label, index) => ({ label, score: scores[index], max: 20 })),
    reason: `對${source}客人而言，從「${sourceService}」延伸到「${targetService}」適合${outboundNeed}的情境。`,
    outbound: `遇到${outboundNeed}的客人，提供「${targetService}」的公開預約資訊。`,
    inbound: `${target}遇到${inboundNeed}的客人，可分享我方「${sourceService}」的入口。`,
    service: `${sourceService} × ${targetService}，各自預約、各自報價。`,
    points: restricted
      ? `待雙方確認適用範圍，才在「${sourceCredit}」或「${targetCredit}」試辦。贈額、折抵上限各自訂定，接洽階段只分享公開資訊。`
      : `可試辦完成指定消費後贈購物金，雙方各公告「${sourceCredit}」與「${targetCredit}」適用的時段及折抵上限。`,
    limitations: conditionsForPair.join('') || '先約定供應地區、可用名額及取消方式，由客人自行選擇並聯繫。'
  };
}

export function getIndustryLinks(profileId) {
  if (!Object.hasOwn(sectors, profileId)) return [];
  const links = [];
  for (const [left, right, scores, outbound, inbound] of proposals) {
    if (left === profileId) {
      links.push(describeProposal(left, right, scores, outbound, inbound));
    } else if (right === profileId) {
      const [audience, fit, forward, reverse, credit] = scores;
      links.push(describeProposal(right, left, [audience, fit, reverse, forward, credit], inbound, outbound));
    }
  }
  return links.sort((a, b) => b.score - a.score).slice(0, 10);
}
