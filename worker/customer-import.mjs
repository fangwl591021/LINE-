const SOURCE_TYPES = new Set(['manual', 'csv', 'xlsx', 'xls']);
const CUSTOMER_STATUSES = new Set(['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'inactive']);
const RESOLUTIONS = new Set(['create', 'fill_blanks', 'skip']);

export function resolveImportResolution(decision, requestedResolution) {
  const nextDecision = text(decision, 30).toLowerCase();
  const requested = text(requestedResolution, 30).toLowerCase();
  if (nextDecision === 'create') return 'create';
  if (nextDecision === 'duplicate') return requested === 'fill_blanks' ? 'fill_blanks' : 'skip';
  return 'skip';
}

export function text(value, max = 500) {
  return String(value ?? '').normalize('NFKC').trim().slice(0, max);
}

export function safeSpreadsheetText(value, max = 500) {
  const next = text(value, max);
  if (!next) return '';
  if (/^[=@]/.test(next) || (/^[+-]/.test(next) && !/^\+\d[\d\s().-]{5,}$/.test(next))) return `'${next}`;
  return next;
}

export function normalizePhone(value) {
  let digits = text(value, 40).replace(/\D/g, '');
  if (digits.startsWith('886') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  return digits.slice(0, 20);
}

export function normalizeEmail(value) {
  const email = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function normalizeCustomer(input = {}) {
  const pick = (...keys) => {
    for (const key of keys) if (input[key] !== undefined && input[key] !== null) return input[key];
    return '';
  };
  const status = text(pick('status', 'customerStatus', '客戶狀態'), 30).toLowerCase();
  return {
    name: safeSpreadsheetText(pick('name', 'customerName', '姓名', '客戶姓名'), 120),
    mobile: text(pick('mobile', 'phone', '手機', '手機號碼'), 40),
    normalizedMobile: normalizePhone(pick('mobile', 'phone', '手機', '手機號碼')),
    email: text(pick('email', '電子郵件', 'Email'), 254).toLowerCase(),
    normalizedEmail: normalizeEmail(pick('email', '電子郵件', 'Email')),
    company: safeSpreadsheetText(pick('company', 'companyName', '公司', '公司名稱'), 160),
    title: safeSpreadsheetText(pick('title', '職稱'), 120),
    address: safeSpreadsheetText(pick('address', '地址', '公司地址'), 500),
    birthday: text(pick('birthday', '生日'), 20),
    category: safeSpreadsheetText(pick('category', 'customerCategory', '分類', '客戶類型'), 80),
    status: CUSTOMER_STATUSES.has(status) ? status : 'new',
    lastContactAt: text(pick('lastContactAt', 'lastContact', '最後聯絡日期'), 40),
    nextFollowupAt: text(pick('nextFollowupAt', 'nextFollowup', '下次跟進日期'), 40),
    notes: safeSpreadsheetText(pick('notes', 'note', '備註'), 3000),
    externalId: safeSpreadsheetText(pick('externalId', 'customerId', '外部編號', '客戶編號'), 160)
  };
}

export function validateCustomer(customer) {
  const errors = [];
  if (!customer.name) errors.push('NAME_REQUIRED');
  if (customer.email && !customer.normalizedEmail) errors.push('EMAIL_INVALID');
  if (customer.mobile && customer.normalizedMobile.length < 7) errors.push('MOBILE_INVALID');
  return errors;
}

function id(prefix = 'ID') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

function scope(payload = {}) {
  const ownerUserId = text(payload.authenticatedUserId, 160);
  const networkId = text(payload.authenticatedNetworkId, 160) || 'admin';
  if (!ownerUserId) throw new Error('CUSTOMER_IMPORT_AUTH_REQUIRED');
  return { ownerUserId, networkId };
}

async function first(env, sql, binds = []) {
  const statement = env.ACTMASTER_DB.prepare(sql);
  return binds.length ? statement.bind(...binds).first() : statement.first();
}

async function all(env, sql, binds = []) {
  const statement = env.ACTMASTER_DB.prepare(sql);
  const result = binds.length ? await statement.bind(...binds).all() : await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
}

function customerRow(row) {
  if (!row) return null;
  return {
    customerId: text(row.customer_id), name: text(row.name), mobile: text(row.mobile), email: text(row.email),
    company: text(row.company), title: text(row.title), address: text(row.address), birthday: text(row.birthday),
    category: text(row.category), status: text(row.status, 30), lastContactAt: text(row.last_contact_at, 40),
    nextFollowupAt: text(row.next_followup_at, 40), notes: text(row.notes, 3000), sourceType: text(row.source_type, 30),
    sourceBadge: text(row.source_badge, 40), version: Number(row.version || 1), createdAt: text(row.created_at, 40),
    updatedAt: text(row.updated_at, 40)
  };
}

async function ownedBatch(payload, env, allowedStates = null) {
  const { ownerUserId, networkId } = scope(payload);
  const batchId = text(payload.batchId || payload.batch_id, 160);
  if (!batchId) throw new Error('BATCH_ID_REQUIRED');
  const batch = await first(env, `SELECT * FROM customer_import_batches WHERE batch_id = ? AND network_id = ? AND owner_user_id = ? LIMIT 1`, [batchId, networkId, ownerUserId]);
  if (!batch) throw new Error('BATCH_NOT_FOUND');
  if (allowedStates && !allowedStates.includes(text(batch.state, 30))) throw new Error('BATCH_STATE_INVALID');
  return batch;
}

async function exactDuplicate(env, networkId, ownerUserId, customer) {
  const conditions = [];
  const binds = [networkId, ownerUserId];
  if (customer.externalId) { conditions.push('external_id = ?'); binds.push(customer.externalId); }
  if (customer.normalizedMobile) { conditions.push('normalized_mobile = ?'); binds.push(customer.normalizedMobile); }
  if (customer.normalizedEmail) { conditions.push('normalized_email = ?'); binds.push(customer.normalizedEmail); }
  if (!conditions.length) return null;
  return first(env, `SELECT * FROM customer_records WHERE network_id = ? AND owner_user_id = ? AND archived_at = '' AND (${conditions.join(' OR ')}) ORDER BY updated_at DESC LIMIT 1`, binds);
}

export const CustomerImportModule = {
  async listCustomers(payload, env) {
    const { ownerUserId, networkId } = scope(payload);
    const query = text(payload.query, 120);
    const like = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const rows = query
      ? await all(env, `SELECT * FROM customer_records WHERE network_id = ? AND owner_user_id = ? AND archived_at = '' AND (name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR mobile LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT 300`, [networkId, ownerUserId, like, like, like, like])
      : await all(env, `SELECT * FROM customer_records WHERE network_id = ? AND owner_user_id = ? AND archived_at = '' ORDER BY updated_at DESC LIMIT 300`, [networkId, ownerUserId]);
    return { success: true, data: rows.map(customerRow) };
  },

  async saveCustomer(payload, env) {
    const { ownerUserId, networkId } = scope(payload);
    const customer = normalizeCustomer(payload.customer || payload.data || payload);
    const errors = validateCustomer(customer);
    if (errors.length) return { success: false, error: errors[0], errors };
    const customerId = text(payload.customerId || payload.customer_id, 160) || id('CUS');
    const existing = await first(env, `SELECT * FROM customer_records WHERE customer_id = ? AND network_id = ? AND owner_user_id = ? LIMIT 1`, [customerId, networkId, ownerUserId]);
    if (payload.customerId && !existing) return { success: false, error: 'CUSTOMER_NOT_FOUND' };
    const duplicate = await exactDuplicate(env, networkId, ownerUserId, customer);
    if (duplicate && duplicate.customer_id !== existing?.customer_id) {
      return { success: false, error: 'EXACT_DUPLICATE_REVIEW_REQUIRED', duplicateCustomerId: duplicate.customer_id };
    }
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO customer_records (customer_id,network_id,owner_user_id,name,mobile,normalized_mobile,email,normalized_email,company,title,address,birthday,category,status,last_contact_at,next_followup_at,notes,external_id,source_type,source_badge,is_private,is_public,marketing_consent,version,created_at,updated_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual','手動',1,0,0,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'')
      ON CONFLICT(customer_id) DO UPDATE SET name=excluded.name,mobile=excluded.mobile,normalized_mobile=excluded.normalized_mobile,email=excluded.email,normalized_email=excluded.normalized_email,company=excluded.company,title=excluded.title,address=excluded.address,birthday=excluded.birthday,category=excluded.category,status=excluded.status,last_contact_at=excluded.last_contact_at,next_followup_at=excluded.next_followup_at,notes=excluded.notes,external_id=excluded.external_id,version=customer_records.version+1,updated_at=CURRENT_TIMESTAMP
      WHERE customer_records.network_id=excluded.network_id AND customer_records.owner_user_id=excluded.owner_user_id
    `).bind(customerId,networkId,ownerUserId,customer.name,customer.mobile,customer.normalizedMobile,customer.email,customer.normalizedEmail,customer.company,customer.title,customer.address,customer.birthday,customer.category,customer.status,customer.lastContactAt,customer.nextFollowupAt,customer.notes,customer.externalId).run();
    return { success: true, data: customerRow(await first(env, `SELECT * FROM customer_records WHERE customer_id = ? AND network_id = ? AND owner_user_id = ?`, [customerId, networkId, ownerUserId])) };
  },

  async archiveCustomer(payload, env) {
    const { ownerUserId, networkId } = scope(payload);
    const customerId = text(payload.customerId || payload.customer_id, 160);
    const result = await env.ACTMASTER_DB.prepare(`UPDATE customer_records SET archived_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE customer_id=? AND network_id=? AND owner_user_id=? AND archived_at=''`).bind(customerId, networkId, ownerUserId).run();
    return { success: true, customerId, archived: Number(result?.meta?.changes || 0) === 1 };
  },

  async createBatch(payload, env) {
    const { ownerUserId, networkId } = scope(payload);
    const sourceType = text(payload.sourceType || payload.source_type, 20).toLowerCase();
    if (!SOURCE_TYPES.has(sourceType) || sourceType === 'manual') return { success: false, error: 'SOURCE_TYPE_INVALID' };
    const idempotencyKey = text(payload.idempotencyKey, 160);
    if (idempotencyKey) {
      const existing = await first(env, `SELECT batch_id,state,source_type FROM customer_import_batches WHERE network_id=? AND owner_user_id=? AND idempotency_key=? LIMIT 1`, [networkId,ownerUserId,idempotencyKey]);
      if (existing) return { success: true, existed: true, data: { batchId: existing.batch_id, state: existing.state, sourceType: existing.source_type } };
    }
    const batchId = id('CIB');
    await env.ACTMASTER_DB.prepare(`INSERT INTO customer_import_batches (batch_id,network_id,owner_user_id,initiated_by,source_type,source_name,state,mapping_json,idempotency_key,total_rows,ready_rows,error_rows,created_rows,updated_rows,skipped_rows,checkpoint,created_at,updated_at) VALUES (?,?,?,?,?,?,'mapping','{}',?,0,0,0,0,0,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(batchId,networkId,ownerUserId,ownerUserId,sourceType,text(payload.sourceName || payload.fileName,240),idempotencyKey || batchId).run();
    return { success: true, data: { batchId, state: 'mapping', sourceType } };
  },

  async previewRows(payload, env) {
    const batch = await ownedBatch(payload, env, ['mapping', 'validating', 'ready']);
    const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 500) : [];
    if (!rows.length) return { success: false, error: 'ROWS_REQUIRED' };
    const { ownerUserId, networkId } = scope(payload);
    const summary = { total: rows.length, ready: 0, duplicate: 0, error: 0 };
    await env.ACTMASTER_DB.prepare(`DELETE FROM customer_import_rows WHERE batch_id=? AND network_id=? AND owner_user_id=? AND status='previewed'`).bind(batch.batch_id,networkId,ownerUserId).run();
    for (let index = 0; index < rows.length; index++) {
      const rowNumber = Number(rows[index].rowNumber || index + 1);
      const customer = normalizeCustomer(rows[index].data || rows[index]);
      const errors = validateCustomer(customer);
      const duplicate = errors.length ? null : await exactDuplicate(env, networkId, ownerUserId, customer);
      const stagedDuplicate = errors.length || duplicate ? null : await first(env, `
        SELECT row_number FROM customer_import_rows
        WHERE batch_id=? AND network_id=? AND owner_user_id=? AND row_number<>?
          AND ((?<>'' AND normalized_mobile=?) OR (?<>'' AND normalized_email=?) OR (?<>'' AND external_id=?))
        LIMIT 1
      `, [batch.batch_id,networkId,ownerUserId,rowNumber,customer.normalizedMobile,customer.normalizedMobile,customer.normalizedEmail,customer.normalizedEmail,customer.externalId,customer.externalId]);
      const decision = errors.length ? 'error' : duplicate || stagedDuplicate ? 'duplicate' : 'create';
      summary[decision === 'create' ? 'ready' : decision]++;
      const resolution = resolveImportResolution(decision, rows[index].resolution);
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO customer_import_rows (batch_id,row_number,network_id,owner_user_id,normalized_json,normalized_mobile,normalized_email,external_id,validation_json,duplicate_customer_id,decision,resolution,status,error_code,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'previewed',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(batch_id,row_number) DO UPDATE SET normalized_json=excluded.normalized_json,normalized_mobile=excluded.normalized_mobile,normalized_email=excluded.normalized_email,external_id=excluded.external_id,validation_json=excluded.validation_json,duplicate_customer_id=excluded.duplicate_customer_id,decision=excluded.decision,resolution=excluded.resolution,status='previewed',error_code=excluded.error_code,updated_at=CURRENT_TIMESTAMP
      `).bind(batch.batch_id,rowNumber,networkId,ownerUserId,JSON.stringify(customer),customer.normalizedMobile,customer.normalizedEmail,customer.externalId,JSON.stringify(errors),text(duplicate?.customer_id,160),decision,resolution,errors[0]||(stagedDuplicate?'DUPLICATE_IN_BATCH':'')).run();
    }
    await env.ACTMASTER_DB.prepare(`UPDATE customer_import_batches SET state='ready',mapping_json=?,total_rows=?,ready_rows=?,error_rows=?,updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND network_id=? AND owner_user_id=?`).bind(JSON.stringify(payload.mapping || {}),summary.total,summary.ready+summary.duplicate,summary.error,batch.batch_id,networkId,ownerUserId).run();
    return { success: true, data: { batchId: batch.batch_id, state: 'ready', summary } };
  },

  async commitBatch(payload, env) {
    const batch = await ownedBatch(payload, env, ['ready', 'importing', 'partial_failed']);
    if (payload.confirmAuthority !== true) return { success: false, error: 'AUTHORITY_CONFIRMATION_REQUIRED' };
    const { ownerUserId, networkId } = scope(payload);
    await env.ACTMASTER_DB.prepare(`UPDATE customer_import_batches SET state='importing',updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND network_id=? AND owner_user_id=?`).bind(batch.batch_id,networkId,ownerUserId).run();
    const rows = await all(env, `SELECT * FROM customer_import_rows WHERE batch_id=? AND network_id=? AND owner_user_id=? AND status='previewed' ORDER BY row_number LIMIT 200`, [batch.batch_id,networkId,ownerUserId]);
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    for (const row of rows) {
      try {
        const customer = JSON.parse(row.normalized_json || '{}');
        const resolution = RESOLUTIONS.has(row.resolution) ? row.resolution : 'skip';
        if (row.error_code || resolution === 'skip') {
          counts.skipped++;
          await env.ACTMASTER_DB.prepare(`UPDATE customer_import_rows SET status='skipped',committed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND row_number=? AND network_id=? AND owner_user_id=? AND status='previewed'`).bind(batch.batch_id,row.row_number,networkId,ownerUserId).run();
          continue;
        }
        const currentDuplicate = await exactDuplicate(env, networkId, ownerUserId, customer);
        if (!row.duplicate_customer_id && currentDuplicate) {
          counts.skipped++;
          await env.ACTMASTER_DB.prepare(`UPDATE customer_import_rows SET status='skipped',error_code='DUPLICATE_CHANGED_AFTER_PREVIEW',duplicate_customer_id=?,committed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND row_number=? AND network_id=? AND owner_user_id=? AND status='previewed'`).bind(currentDuplicate.customer_id,batch.batch_id,row.row_number,networkId,ownerUserId).run();
          continue;
        }
        const existing = row.duplicate_customer_id ? await first(env, `SELECT * FROM customer_records WHERE customer_id=? AND network_id=? AND owner_user_id=? AND archived_at=''`, [row.duplicate_customer_id,networkId,ownerUserId]) : null;
        const customerId = existing?.customer_id || `CUS_${batch.batch_id}_${row.row_number}`;
        const beforeJson = existing ? JSON.stringify(existing) : '';
        if (existing && resolution === 'fill_blanks') {
          await env.ACTMASTER_DB.prepare(`UPDATE customer_records SET name=CASE WHEN name='' THEN ? ELSE name END,mobile=CASE WHEN mobile='' THEN ? ELSE mobile END,normalized_mobile=CASE WHEN normalized_mobile='' THEN ? ELSE normalized_mobile END,email=CASE WHEN email='' THEN ? ELSE email END,normalized_email=CASE WHEN normalized_email='' THEN ? ELSE normalized_email END,company=CASE WHEN company='' THEN ? ELSE company END,title=CASE WHEN title='' THEN ? ELSE title END,address=CASE WHEN address='' THEN ? ELSE address END,birthday=CASE WHEN birthday='' THEN ? ELSE birthday END,category=CASE WHEN category='' THEN ? ELSE category END,next_followup_at=CASE WHEN next_followup_at='' THEN ? ELSE next_followup_at END,external_id=CASE WHEN external_id='' THEN ? ELSE external_id END,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE customer_id=? AND network_id=? AND owner_user_id=?`).bind(customer.name,customer.mobile,customer.normalizedMobile,customer.email,customer.normalizedEmail,customer.company,customer.title,customer.address,customer.birthday,customer.category,customer.nextFollowupAt,customer.externalId,customerId,networkId,ownerUserId).run();
          counts.updated++;
        } else {
          await env.ACTMASTER_DB.prepare(`INSERT OR IGNORE INTO customer_records (customer_id,network_id,owner_user_id,name,mobile,normalized_mobile,email,normalized_email,company,title,address,birthday,category,status,last_contact_at,next_followup_at,notes,external_id,source_type,source_badge,source_batch_id,is_private,is_public,marketing_consent,version,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,0,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'')`).bind(customerId,networkId,ownerUserId,customer.name,customer.mobile,customer.normalizedMobile,customer.email,customer.normalizedEmail,customer.company,customer.title,customer.address,customer.birthday,customer.category,customer.status,customer.lastContactAt,customer.nextFollowupAt,customer.notes,customer.externalId,batch.source_type,batch.source_type.toUpperCase(),batch.batch_id).run();
          counts.created++;
        }
        const saved = await first(env, `SELECT version FROM customer_records WHERE customer_id=? AND network_id=? AND owner_user_id=?`, [customerId,networkId,ownerUserId]);
        await env.ACTMASTER_DB.prepare(`UPDATE customer_import_rows SET status='committed',customer_id=?,before_json=?,applied_customer_version=?,committed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND row_number=? AND network_id=? AND owner_user_id=? AND status='previewed'`).bind(customerId,beforeJson,Number(saved?.version||1),batch.batch_id,row.row_number,networkId,ownerUserId).run();
      } catch (error) {
        counts.failed++;
        await env.ACTMASTER_DB.prepare(`UPDATE customer_import_rows SET status='failed',error_code='COMMIT_ROW_FAILED',updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND row_number=? AND network_id=? AND owner_user_id=?`).bind(batch.batch_id,row.row_number,networkId,ownerUserId).run();
      }
    }
    const remaining = await first(env, `SELECT COUNT(*) AS count FROM customer_import_rows WHERE batch_id=? AND network_id=? AND owner_user_id=? AND status='previewed'`, [batch.batch_id,networkId,ownerUserId]);
    const state = Number(remaining?.count||0) > 0 ? 'importing' : counts.failed ? 'partial_failed' : 'completed';
    await env.ACTMASTER_DB.prepare(`UPDATE customer_import_batches SET state=?,created_rows=created_rows+?,updated_rows=updated_rows+?,skipped_rows=skipped_rows+?,checkpoint=checkpoint+?,updated_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE batch_id=? AND network_id=? AND owner_user_id=?`).bind(state,counts.created,counts.updated,counts.skipped,rows.length,state,batch.batch_id,networkId,ownerUserId).run();
    return { success: true, data: { batchId: batch.batch_id, state, counts, remaining: Number(remaining?.count||0) } };
  },

  async getBatch(payload, env) {
    const batch = await ownedBatch(payload, env);
    const rows = await all(env, `SELECT row_number,decision,resolution,status,error_code,duplicate_customer_id,customer_id FROM customer_import_rows WHERE batch_id=? AND network_id=? AND owner_user_id=? ORDER BY row_number LIMIT 500`, [batch.batch_id,batch.network_id,batch.owner_user_id]);
    return { success: true, data: { batch, rows } };
  },

  async rollbackBatch(payload, env) {
    const batch = await ownedBatch(payload, env, ['completed', 'partial_failed']);
    const { ownerUserId, networkId } = scope(payload);
    const rows = await all(env, `SELECT * FROM customer_import_rows WHERE batch_id=? AND network_id=? AND owner_user_id=? AND status='committed' ORDER BY row_number DESC`, [batch.batch_id,networkId,ownerUserId]);
    const result = { rolledBack: 0, blocked: 0 };
    for (const row of rows) {
      const current = await first(env, `SELECT * FROM customer_records WHERE customer_id=? AND network_id=? AND owner_user_id=?`, [row.customer_id,networkId,ownerUserId]);
      if (!current || Number(current.version) !== Number(row.applied_customer_version)) { result.blocked++; continue; }
      if (!row.before_json) {
        await env.ACTMASTER_DB.prepare(`DELETE FROM customer_records WHERE customer_id=? AND network_id=? AND owner_user_id=? AND version=?`).bind(row.customer_id,networkId,ownerUserId,row.applied_customer_version).run();
      } else {
        const before = JSON.parse(row.before_json);
        await env.ACTMASTER_DB.prepare(`UPDATE customer_records SET name=?,mobile=?,normalized_mobile=?,email=?,normalized_email=?,company=?,title=?,address=?,birthday=?,category=?,status=?,last_contact_at=?,next_followup_at=?,notes=?,external_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE customer_id=? AND network_id=? AND owner_user_id=? AND version=?`).bind(before.name,before.mobile,before.normalized_mobile,before.email,before.normalized_email,before.company,before.title,before.address,before.birthday,before.category,before.status,before.last_contact_at,before.next_followup_at,before.notes,before.external_id,row.customer_id,networkId,ownerUserId,row.applied_customer_version).run();
      }
      await env.ACTMASTER_DB.prepare(`UPDATE customer_import_rows SET status='rolled_back',updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND row_number=? AND network_id=? AND owner_user_id=?`).bind(batch.batch_id,row.row_number,networkId,ownerUserId).run();
      result.rolledBack++;
    }
    const state = result.blocked ? 'partial_failed' : 'rolled_back';
    await env.ACTMASTER_DB.prepare(`UPDATE customer_import_batches SET state=?,rolled_back_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND network_id=? AND owner_user_id=?`).bind(state,batch.batch_id,networkId,ownerUserId).run();
    return { success: true, data: { batchId: batch.batch_id, state, ...result } };
  }
};
