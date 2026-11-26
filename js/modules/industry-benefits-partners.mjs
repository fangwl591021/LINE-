const catalog = 'https://line-engine.fangwl591021.workers.dev/v1/store-shop';
const shopId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const group = (categories, reason, terms = null) => ({categories, reason, terms});
const groups = {
  home: group(['服務','購','製造'], '可洽談交屋清潔、居家維護或搬遷服務的雙向轉介。', /清潔|家事|搬家|水電|修繕|裝修|室內設計|居家收納/u),
  dining: group(['食'], '可洽談餐飲搭配、聯合優惠或互相推薦。'),
  tourism: group(['遊','宿'], '可把旅宿或在地體驗串成一條行程，互相推薦給旅客。'),
  transport: group(['行','服務','遊'], '可洽談接駁或包車，讓旅客更容易往返。', /接駁|包車|租車|交通接送|遊覽車|計程車/u),
  gifts: group(['購','食','製造'], '可洽談選品組合、迎賓小禮或共同推廣。', /伴手禮|禮盒|香氛|手作|禮品|烘焙|文創/u),
  retail: group(['購'], '可洽談選品展示、客群互推或小型聯合活動。'),
  media: group(['服務','製造'], '可洽談內容製作、品牌曝光或聯合推廣。', /攝影|影像|品牌設計|行銷|平面設計|印刷|廣告/u),
  beauty: group(['服務'], '可洽談造型、體驗流程或跨店推薦。', /美髮|美容|美甲|美睫|婚紗|造型|理容|彩妝/u),
  learning: group(['服務','遊'], '可規劃課程體驗、公開分享或共同招生。', /教室|培訓|才藝|課程|教學|工作坊|親子/u),
  venue: group(['服務','食','遊','宿'], '可洽談場地、活動時段與現場服務。', /場地|展場|會議|包場|活動空間|展演|共享空間/u),
  fitness: group(['服務','遊'], '可洽談運動體驗、場地或公開健康主題活動。', /健身|瑜珈|瑜伽|皮拉提斯|運動場館|運動教練|舞蹈/u),
  consulting: group(['服務'], '可洽談互補的專業服務與公開分享，並確認轉介範圍。', /會計|記帳|顧問|財稅|法律|人資|地政士/u),
  supplier: group(['製造','服務','購'], '可洽談試作、供應、通路或售後方面的合作。', /製造|加工|批發|供應|通路|物流|代工/u)
};
const priorities = {
  dining:['venue','gifts','learning','tourism','media'],
  retail:['media','venue','supplier','gifts'],
  beauty:['media','beauty','retail','venue'],
  fitness:['dining','fitness','retail','venue'],
  learning:['venue','learning','dining','media'],
  travel:['tourism','dining','transport','gifts'],
  lodging:['dining','tourism','transport','gifts'],
  'real-estate':['home'],
  professional:['consulting','media','venue'],
  healthcare:['fitness','learning','venue'],
  local:['home','gifts','retail'],
  creative:['venue','retail','media','supplier'],
  events:['venue','dining','media','gifts'],
  b2b:['supplier','retail','media','consulting'],
  general:['media','gifts','venue']
};

export function recommendPartners(shops, industry) {
  const active = shops.filter(shop => shop?.status === 'active' && shopId.test(shop.id) &&
    typeof shop.name === 'string' && shop.name.trim());
  const requested = priorities[industry] || priorities.general;
  const rankings = requested.map(key => {
    const {categories, terms, reason} = groups[key];
    return active.flatMap(shop => {
      if (!categories.includes(shop.category)) return [];
      const score = !terms ? 1 : terms.test(shop.name) ? 3 : terms.test(shop.description || '') ? 2 : 0;
      return score ? [{id:shop.id, name:shop.name.trim(), reason, score}] : [];
    }).sort((a,b) => b.score - a.score);
  });
  const selected = new Map();
  for (const ranked of rankings) {
    const first = ranked.find(shop => !selected.has(shop.id));
    if (first) selected.set(first.id, first);
    if (selected.size === 3) return [...selected.values()];
  }
  for (const ranked of rankings) {
    for (const shop of ranked) {
      if (!selected.has(shop.id)) selected.set(shop.id, shop);
      if (selected.size === 3) return [...selected.values()];
    }
  }
  return [...selected.values()];
}

let snapshot;
let pending;

async function readPublicShops() {
  const shops = [];
  const url = new URL(catalog);
  const signal = AbortSignal.timeout(9000);
  const cursors = new Set();
  for (let page = 0; page < 4; page++) {
    const response = await fetch(url, {credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer', redirect:'error', signal});
    if (!response.ok) throw Error('Catalog unavailable');
    const data = await response.json();
    if (data.success !== true || !Array.isArray(data.shops) || data.shops.length > 40) throw Error('Invalid shop page');
    for (const shop of data.shops) {
      if (!shop || typeof shop !== 'object') continue;
      const {id, name, status, description, category} = shop;
      shops.push({id, name, status, description, category});
    }
    if (!data.next) break;
    if (typeof data.next !== 'string' || data.next.length > 256 || cursors.has(data.next)) throw Error('Invalid catalog cursor');
    cursors.add(data.next);
    url.searchParams.set('after', data.next);
  }
  return shops;
}

function publicShops() {
  if (snapshot && Date.now() < snapshot.until) return Promise.resolve(snapshot.shops);
  if (!pending) {
    pending = readPublicShops().then(shops => {
      snapshot = {shops, until:Date.now() + 60000};
      return shops;
    }).finally(() => { pending = undefined; });
  }
  return pending;
}

export function showIndustryPartners(panel, profileId) {
  const status = panel.querySelector('[role="status"]');
  const results = panel.querySelector('.partner-list');
  const retry = panel.querySelector('button');

  async function load() {
    retry.hidden = true;
    status.textContent = '正在讀取商城已上架店家…';
    try {
      const shops = await publicShops();
      if (!panel.isConnected) return;
      const matches = recommendPartners(shops, profileId);
      status.textContent = matches.length ? '' : '目前沒有符合這個合作方向的公開店家。';
      for (const shop of matches) {
        const card = document.createElement('article');
        const name = document.createElement('a');
        const url = new URL('store-shop.html', location.href);
        url.searchParams.set('shop', shop.id);
        name.href = url.href;
        name.textContent = shop.name;
        const reason = document.createElement('p');
        reason.textContent = shop.reason;
        card.append(name, reason);
        results.append(card);
      }
    } catch {
      if (!panel.isConnected) return;
      status.textContent = '暫時無法讀取公開店家。';
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', load);
  void load();
}
