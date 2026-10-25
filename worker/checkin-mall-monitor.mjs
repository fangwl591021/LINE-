// Read-only CRM projection. LINE acceptance is evidence of API acceptance only;
// this module never sends, queries a wallet, awards points, or recreates mother text.
import { readCheckinDashboardSnapshots } from './checkin-chat-dashboard.mjs';
import { productDisplay } from './checkin-dashboard-products.mjs';
const UID = /^U[0-9a-f]{32}$/i;
const PREFIX = 'CHECKIN_MALL:';
const MAX_THREADS = 100;
const MAX_MESSAGES = 80;
const virtualSql = `WITH virtual_cards AS (
  SELECT c.id,c.recipient_uid,
    CASE WHEN typeof(c.balance)='integer' AND c.balance BETWEEN 0 AND 9007199254740991 THEN c.balance ELSE NULL END AS balance,c.created_at
  FROM checkin_mall_cards c
  JOIN line_oa_threads t ON t.thread_id='line:'||c.recipient_uid
    AND t.user_id=c.recipient_uid AND t.source_type='user'
  WHERE c.state='accepted'
    AND length(c.recipient_uid)=33 AND substr(c.recipient_uid,1,1) IN ('U','u')
    AND substr(c.recipient_uid,2) NOT GLOB '*[^0-9a-fA-F]*'
    AND length(c.id)=36 AND substr(c.id,9,1)='-' AND substr(c.id,14,1)='-'
    AND substr(c.id,19,1)='-' AND substr(c.id,24,1)='-'
    AND length(replace(c.id,'-',''))=32 AND replace(c.id,'-','') NOT GLOB '*[^0-9a-fA-F]*'
    AND typeof(c.created_at)='integer' AND c.created_at>0 AND c.created_at<=8640000000000000
    AND NOT EXISTS(SELECT 1 FROM line_oa_messages m WHERE m.message_id='${PREFIX}'||c.id)
)`;

const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
function time(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '');
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? text.replace(' ', 'T') + 'Z' : text);
}
function exactThread(row) {
  return row && UID.test(row.user_id || '') && row.thread_id === 'line:' + row.user_id && row.source_type === 'user';
}
function projectedMessage(card, snapshot) {
  const queriedAt = new Date(card.created_at).toISOString();
  const balance = Number.isSafeInteger(card.balance) && card.balance >= 0 ? card.balance : null;
  const amount = balance === null ? '暫時無法取得（不代表餘額為零）' : balance.toLocaleString('zh-TW') + ' 元';
  const displayTime = new Date(card.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  return {
    message_id: PREFIX + card.id, thread_id: 'line:' + card.recipient_uid, user_id: card.recipient_uid,
    direction: 'outbound', message_type: 'flex', event_type: 'checkin_mall_card',
    text_content: `會員購物金・前往商城\n購物金：${amount}\n查詢時間：${displayTime}（台北時間）\nLINE API已接受；送達與已讀未確認。\n母站文字回覆未取得，不在此重建。`,
    created_at: queriedAt, delivery_status: 'accepted', record_source: 'checkin_mall_cards',
    card_preview: { title: '會員購物金', balance, queried_at: queriedAt, mother_reply_available: false, ...(snapshot && snapshot.createdAt === card.created_at ? {
      template_revision: snapshot.templateRevision,
      theme_color: snapshot.config.themeColor,
      pages: snapshot.config.pages.map(page => {
        if(page.kind==='product'){
          const frozen=snapshot.productSnapshots?.find(row=>row.pageId===page.id&&row.shopId===page.shopId&&row.productId===page.productId&&row.createdAt===snapshot.createdAt);
          const available=frozen?.available===true&&!!frozen.product,display=productDisplay(available?frozen.product:null);
          return {kind:'product',...display,buttons:[{label:available?'查看商品':'前往商城',target:available?'product':'mall'}]};
        }
        return { kind: page.kind, title: page.title, body: page.body, heroImageUrl: page.heroImageUrl,
          buttons: page.buttons.map(button => ({ label: button.label, target: button.target })) };
      })
    } : {}) }
  };
}
async function rows(db, sql, args = []) {
  const result = await db.prepare(sql).bind(...args).all();
  if (result.success === false || !Array.isArray(result.results)) throw Error('projection unavailable');
  return result.results;
}

/** Augment the existing monitor data without altering any database record. */
export async function projectCheckinMallMonitor(db, data) {
  if (!db || !data || !Array.isArray(data.threads) || !Array.isArray(data.messages)) return data;
  try {
    const eligible = data.threads.slice(0, MAX_THREADS).filter(exactThread);
    const recipients = [...new Set(eligible.map(row => row.user_id))];
    const selected = String(data.selectedThreadId || '');
    const selectedRow = data.threads.find(row => row.thread_id === selected);
    const selectedUid = selected.startsWith('line:') && UID.test(selected.slice(5))
      && (!selectedRow || exactThread(selectedRow)) ? selected.slice(5) : '';
    const [threadCards, selectedCards, totals] = await Promise.all([
      recipients.length ? rows(db, `${virtualSql}, ranked AS (
        SELECT *,COUNT(*) OVER(PARTITION BY recipient_uid) AS virtual_count,
          ROW_NUMBER() OVER(PARTITION BY recipient_uid ORDER BY created_at DESC,id DESC) AS rn
        FROM virtual_cards WHERE recipient_uid IN (SELECT value FROM json_each(?))
      ) SELECT id,recipient_uid,balance,created_at,virtual_count FROM ranked WHERE rn=1 LIMIT 100`, [JSON.stringify(recipients)]) : [],
      selectedUid ? rows(db, `${virtualSql} SELECT id,recipient_uid,balance,created_at FROM virtual_cards
        WHERE recipient_uid=? ORDER BY created_at DESC,id DESC LIMIT 80`, [selectedUid]) : [],
      rows(db, `${virtualSql} SELECT COUNT(*) AS virtual_count FROM virtual_cards`)
    ]);
    const virtualCount = count(totals[0]?.virtual_count);
    if (!virtualCount && !threadCards.length && !selectedCards.length) return data;
    const latest = new Map(threadCards.map(row => [row.recipient_uid, row]));
    const threads = data.threads.map(row => {
      const card = exactThread(row) ? latest.get(row.user_id) : null;
      if (!card) return row;
      const message = projectedMessage(card);
      const newer = card.created_at > (time(row.last_event_at || row.updated_at) || 0);
      return { ...row, message_count: count(row.message_count) + count(card.virtual_count), ...(newer ? {
        last_message_text: message.text_content, last_message_type: message.message_type,
        last_event_type: message.event_type, last_event_at: message.created_at
      } : {}) };
    }).sort((a, b) => (time(b.last_event_at || b.updated_at) || 0) - (time(a.last_event_at || a.updated_at) || 0)
      || String(a.thread_id || '').localeCompare(String(b.thread_id || '')));
    let messages = data.messages;
    if (selectedCards.length) {
      const snapshots = await readCheckinDashboardSnapshots(db, selectedCards.map(card => card.id));
      // Physical messages win even if a caller supplies an already-projected list.
      const merged = new Map(selectedCards.map(card => { const message = projectedMessage(card, snapshots.get(card.id)); return [message.message_id, message]; }));
      for (const message of data.messages) merged.set(message.message_id, message);
      messages = [...merged.values()].sort((a, b) => (time(b.created_at) || 0) - (time(a.created_at) || 0)
        || String(b.message_id || '').localeCompare(String(a.message_id || ''))).slice(0, MAX_MESSAGES).reverse();
    }
    return { ...data, summary: { ...data.summary, messages: count(data.summary?.messages) + virtualCount }, threads, messages };
  } catch {
    // Older deployments may lack the sidecar table. Existing monitoring remains usable.
    return data;
  }
}
