const text = value => String(value ?? '').trim();
export const normalizeCrmPhone = value => text(value).normalize('NFKC')
  .replace(/[-‐‑‒–—−﹣－\s()（）]/g, '').replace(/^\+?886(?=9\d{8}$)/, '0');
const validPhone = value => /^\+?\d{7,15}$/.test(value);
const phoneOf = card => [card.mobile, card.office_phone].map(normalizeCrmPhone).find(validPhone) || '';
const fail = error => ({success:false, error});
// All columns below are fixed identifiers, never client input.
const snapshotFields = ['name','company_name','title','mobile','office_phone','line_id','profile_user_id','owner_user_id','creator_id','source_type','custom_config'];
const snapshot = card => JSON.stringify(snapshotFields.map(key => String(card[key] ?? '')));
async function fingerprint(card) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot(card)));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2,'0')).join('');
}
function eligible(card, uid, cardAccess) {
  const access = cardAccess(card);
  if (access.sourceType === 'referral_placeholder') return false;
  if ([card.line_id, access.profileUserId].some(value => text(value) && text(value) !== uid)) return false;
  if ((access.isSelfProfile || access.sourceType === 'video_profile') && text(access.ownerUserId) !== uid) return false;
  return !!phoneOf(card);
}
function normalizedPhoneSql(column) {
  let expr = `TRIM(COALESCE(${column},''))`;
  for (const separator of ['-', '‐','‑','‒','–','—','−','﹣','－',' ', '(', ')','（','）','\t','\n','\r','\u00a0','\u3000']) {
    expr = `REPLACE(${expr},'${separator}','')`;
  }
  for (let n=0;n<10;n++) expr = `REPLACE(${expr},'${String.fromCharCode(0xff10+n)}','${n}')`;
  expr = `REPLACE(${expr},'＋','+')`;
  return `(CASE WHEN ${expr} LIKE '+8869%' AND LENGTH(${expr})=13 THEN '0'||SUBSTR(${expr},5) WHEN ${expr} LIKE '8869%' AND LENGTH(${expr})=12 THEN '0'||SUBSTR(${expr},4) ELSE ${expr} END)`;
}
export async function handleCrmCardPhoneLink(action, payload, env, actor, options) {
  try { return await runCrmCardPhoneLink(action, payload, env, actor, options); }
  catch { return fail('名片關聯暫時無法處理，請稍後重新搜尋確認'); }
}
async function runCrmCardPhoneLink(action, payload, env, actor, {cardAccess, reservedPhones=[]}) {
  if (!actor?.userId || actor.role !== 'admin' || !actor.token || actor.source === 'd1_identity_fallback') return fail('僅限已登入的總管操作');
  if (!env.ACTMASTER_DB) return fail('會員資料庫暫時無法使用');
  const db = env.ACTMASTER_DB.withSession ? env.ACTMASTER_DB.withSession('first-primary') : env.ACTMASTER_DB;
  const uid = text(payload.targetUserId);
  const user = uid && await db.prepare('SELECT row_id,line_id,name,phone,legacy_line_id,point_line_id FROM users WHERE line_id=? LIMIT 1').bind(uid).first();
  if (!user) return fail('找不到已註冊的 CRM 會員');
  if (action === 'adminSearchCrmCards') {
    const query = text(payload.query).slice(0,80);
    const reference = await db.prepare('SELECT card_row_id,card_name,phone,created_at FROM crm_card_phone_links WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(uid).first();
    if (!query) return {success:true,data:{cards:[],reference,userPhone:text(user.phone),hasMore:false}};
    const normalizedQuery = normalizeCrmPhone(query);
    const rows = await db.prepare(`SELECT * FROM card_contacts c
      WHERE LOWER(COALESCE(c.source_type,'')) <> 'referral_placeholder'
        AND (TRIM(COALESCE(c.line_id,''))='' OR c.line_id=?)
        AND (TRIM(COALESCE(c.profile_user_id,''))='' OR c.profile_user_id=?)
        AND (INSTR(LOWER(COALESCE(c.name,'')),LOWER(?))>0 OR INSTR(LOWER(COALESCE(c.company_name,'')),LOWER(?))>0
          OR INSTR(${normalizedPhoneSql('c.mobile')},?)>0 OR INSTR(${normalizedPhoneSql('c.office_phone')},?)>0)
      ORDER BY COALESCE(c.updated_at,c.created_at) DESC,c.row_id DESC LIMIT 26`).bind(uid,uid,query,query,normalizedQuery || query,normalizedQuery || query).all();
    const cards = await Promise.all((rows.results || []).slice(0,25).filter(card => eligible(card,uid,cardAccess)).map(async card => ({
      rowId:card.row_id,name:text(card.name),company:text(card.company_name),title:text(card.title),phone:phoneOf(card),
      boundToTarget:!!text(card.line_id || card.profile_user_id),fingerprint:await fingerprint(card)
    })));
    return {success:true,data:{cards,reference,userPhone:text(user.phone),hasMore:(rows.results || []).length>25}};
  }
  if (action !== 'adminLinkCrmCard' || payload.confirmed !== true) return fail('請核對會員與名片並確認送出');
  if (text(user.phone)) return fail('CRM 已有電話，不會覆蓋；請重新整理確認');
  const card = await db.prepare('SELECT * FROM card_contacts WHERE row_id=? LIMIT 1').bind(text(payload.cardRowId)).first();
  if (!card || !eligible(card,uid,cardAccess)) return fail('名片沒有有效電話，或已綁定其他會員，不能關聯');
  if (await fingerprint(card) !== text(payload.fingerprint)) return fail('名片資料已變更，請重新搜尋並核對');
  const phone = phoneOf(card);
  if (reservedPhones.map(normalizeCrmPhone).includes(phone)) return fail('此電話屬保留管理帳號，請勿用於補資料');
  const collision = await db.prepare(`SELECT row_id FROM users WHERE row_id<>? AND ${normalizedPhoneSql('phone')}=? LIMIT 1`).bind(user.row_id,phone).first();
  if (collision) return fail('此電話已被其他會員使用，請先核對，不能直接關聯');
  const id = crypto.randomUUID(), createdAt = new Date().toISOString();
  const sourceUnchanged = snapshotFields.map(key => `COALESCE(c.${key},'')=?`).join(' AND ');
  // D1 batch is a transaction: provenance and phone are committed together.
  // Repeat all mutable checks within the write to handle concurrent edits safely.
  const result = await db.batch([
    db.prepare(`INSERT INTO crm_card_phone_links(id,user_row_id,user_id,card_row_id,card_name,phone,actor_uid,created_at)
      SELECT ?,u.row_id,u.line_id,?,?,?,?,? FROM users u
      WHERE u.row_id=? AND u.line_id=? AND TRIM(COALESCE(u.phone,''))=''
      AND EXISTS (SELECT 1 FROM card_contacts c WHERE c.row_id=? AND ${sourceUnchanged})
      AND NOT EXISTS (SELECT 1 FROM users other WHERE other.row_id<>u.row_id AND ${normalizedPhoneSql('other.phone')}=?)`)
      .bind(id,card.row_id,text(card.name),phone,actor.userId,createdAt,user.row_id,uid,card.row_id,...snapshotFields.map(key=>String(card[key] ?? '')),phone),
    db.prepare(`UPDATE users SET phone=? WHERE row_id=? AND TRIM(COALESCE(phone,''))=''
      AND EXISTS (SELECT 1 FROM crm_card_phone_links WHERE id=? AND user_row_id=users.row_id)`).bind(phone,user.row_id,id)
  ]);
  if (Number(result[0]?.meta?.changes)!==1 || Number(result[1]?.meta?.changes)!==1) return fail('資料已變更或電話已被使用，未補入電話，請重新搜尋');
  if (env.ACTMASTER_KV) {
    await Promise.all([...new Set([uid,user.legacy_line_id,user.point_line_id].filter(Boolean))].map(async key => {
      try { await env.ACTMASTER_KV.delete(`U_PROFILE_${key}`); } catch { /* Database is authoritative; cache expires normally. */ }
    }));
  }
  return {success:true,data:{userId:uid,phone,reference:{card_row_id:card.row_id,card_name:text(card.name),phone,created_at:createdAt}}};
}
