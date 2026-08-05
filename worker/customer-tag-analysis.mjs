const text = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const integer = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const id = prefix => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

function scope(payload = {}) {
  const ownerUserId = text(payload.authenticatedUserId || payload.userId, 160);
  const networkId = text(payload.authenticatedNetworkId || payload.networkId, 160) || 'admin';
  if (!ownerUserId) throw new Error('AUTHENTICATED_USER_REQUIRED');
  return { ownerUserId, networkId };
}

function requireTony(payload = {}) {
  const actorId = text(payload.authenticatedUserId, 160);
  if (!actorId || payload.customerTagApprovalAuthorized !== true) throw new Error('TONY_APPROVAL_REQUIRED');
  return actorId;
}

function tokenEstimateForCustomer(row = {}) {
  const source = [row.name, row.company, row.title, row.category, row.status, row.notes]
    .map(value => text(value, 2000)).filter(Boolean).join('\n');
  const input = Math.max(180, Math.ceil(Array.from(source).length / 2) + 220);
  return { input, output: 220 };
}

export function calculateCostMicrousd(inputTokens, outputTokens, price = {}) {
  const inputRate = integer(price.input_price_microusd_per_million);
  const outputRate = integer(price.output_price_microusd_per_million);
  return Math.ceil((integer(inputTokens) * inputRate + integer(outputTokens) * outputRate) / 1_000_000);
}

export function isTaipeiOffPeak(now = new Date(), startHour = 2, endHour = 5) {
  const hour = (now.getUTCHours() + 8) % 24;
  return hour >= integer(startHour, 2) && hour < integer(endHour, 5);
}

function priceIsFresh(row, now = Date.now()) {
  const verified = Date.parse(row?.verified_at || '');
  return Number.isFinite(verified) && now - verified <= 31 * 86400 * 1000;
}

async function first(env, sql, binds = []) {
  return await env.ACTMASTER_DB.prepare(sql).bind(...binds).first();
}

async function all(env, sql, binds = []) {
  const result = await env.ACTMASTER_DB.prepare(sql).bind(...binds).all();
  return Array.isArray(result?.results) ? result.results : [];
}

function publicBatch(row) {
  if (!row) return null;
  return {
    batchId: row.batch_id, state: row.state, provider: row.provider, model: row.model,
    eligibleCustomers: integer(row.eligible_customers), estimatedInputTokens: integer(row.estimated_input_tokens),
    estimatedOutputTokens: integer(row.estimated_output_tokens), estimatedCostMicrousd: integer(row.estimated_cost_microusd),
    estimatedHighCostMicrousd: integer(row.estimated_high_cost_microusd), maxCostMicrousd: integer(row.max_cost_microusd),
    actualCostMicrousd: integer(row.actual_cost_microusd), approvedBy: text(row.approved_by, 160),
    approvedAt: row.approved_at || '', expiresAt: row.expires_at || '', createdAt: row.created_at || ''
  };
}

export const CustomerTagAnalysisModule = {
  async getControl(payload, env) {
    requireTony(payload);
    const settings = await first(env, `SELECT * FROM customer_tag_analysis_settings WHERE settings_key='global'`);
    const prices = await all(env, `SELECT provider,model,input_price_microusd_per_million,output_price_microusd_per_million,currency,effective_at,verified_at,enabled FROM ai_model_price_catalog ORDER BY updated_at DESC`);
    const batches = await all(env, `SELECT * FROM customer_tag_analysis_batches ORDER BY created_at DESC LIMIT 20`);
    return { success: true, data: { settings, prices, batches: batches.map(publicBatch) } };
  },

  async saveControl(payload, env) {
    const actorId = requireTony(payload);
    const enabled = payload.masterEnabled === true ? 1 : 0;
    const start = Math.min(23, Math.max(0, integer(payload.offpeakStartHourTaipei, 2)));
    const end = Math.min(24, Math.max(start + 1, integer(payload.offpeakEndHourTaipei, 5)));
    const perRun = Math.min(50, Math.max(1, integer(payload.maxJobsPerRun, 5)));
    const perDay = Math.min(10000, Math.max(1, integer(payload.maxJobsPerDay, 100)));
    await env.ACTMASTER_DB.prepare(`INSERT INTO customer_tag_analysis_settings (settings_key,master_enabled,offpeak_start_hour_taipei,offpeak_end_hour_taipei,max_jobs_per_run,max_jobs_per_day,updated_by,updated_at) VALUES ('global',?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(settings_key) DO UPDATE SET master_enabled=excluded.master_enabled,offpeak_start_hour_taipei=excluded.offpeak_start_hour_taipei,offpeak_end_hour_taipei=excluded.offpeak_end_hour_taipei,max_jobs_per_run=excluded.max_jobs_per_run,max_jobs_per_day=excluded.max_jobs_per_day,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(enabled,start,end,perRun,perDay,actorId).run();
    return { success: true, data: { masterEnabled: !!enabled, offpeakStartHourTaipei: start, offpeakEndHourTaipei: end, maxJobsPerRun: perRun, maxJobsPerDay: perDay } };
  },

  async savePrice(payload, env) {
    const actorId = requireTony(payload);
    const provider = text(payload.provider, 40).toLowerCase();
    const model = text(payload.model, 120);
    const inputRate = integer(payload.inputPriceMicrousdPerMillion, -1);
    const outputRate = integer(payload.outputPriceMicrousdPerMillion, -1);
    if (!provider || !model || inputRate < 0 || outputRate < 0) return { success: false, error: 'MODEL_PRICE_INVALID' };
    const effectiveAt = text(payload.effectiveAt, 40) || new Date().toISOString();
    const verifiedAt = new Date().toISOString();
    await env.ACTMASTER_DB.prepare(`INSERT INTO ai_model_price_catalog (provider,model,input_price_microusd_per_million,output_price_microusd_per_million,currency,effective_at,verified_at,enabled,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,1,?,CURRENT_TIMESTAMP) ON CONFLICT(provider,model) DO UPDATE SET input_price_microusd_per_million=excluded.input_price_microusd_per_million,output_price_microusd_per_million=excluded.output_price_microusd_per_million,currency=excluded.currency,effective_at=excluded.effective_at,verified_at=excluded.verified_at,enabled=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(provider,model,inputRate,outputRate,'USD',effectiveAt,verifiedAt,actorId).run();
    return { success: true, data: { provider, model, inputRate, outputRate, verifiedAt } };
  },

  async estimateBatch(payload, env) {
    const actorId = requireTony(payload);
    const { ownerUserId, networkId } = scope(payload);
    const provider = text(payload.provider, 40).toLowerCase();
    const model = text(payload.model, 120);
    const price = await first(env, `SELECT * FROM ai_model_price_catalog WHERE provider=? AND model=? AND enabled=1`, [provider, model]);
    if (!price) return { success: false, error: 'MODEL_PRICE_REQUIRED' };
    if (!priceIsFresh(price)) return { success: false, error: 'MODEL_PRICE_STALE' };
    const customers = await all(env, `SELECT c.* FROM customer_records c LEFT JOIN customer_tag_profiles p ON p.customer_id=c.customer_id AND p.network_id=c.network_id AND p.owner_user_id=c.owner_user_id WHERE c.network_id=? AND c.owner_user_id=? AND c.archived_at='' AND (p.customer_id IS NULL OR (p.human_confirmed=0 AND (p.customer_version<>c.version OR p.analysis_status IN ('not_requested','failed','stale')))) ORDER BY c.updated_at DESC LIMIT 10000`, [networkId, ownerUserId]);
    const totals = customers.reduce((sum, row) => { const next = tokenEstimateForCustomer(row); sum.input += next.input; sum.output += next.output; return sum; }, { input: 0, output: 0 });
    const baseCost = calculateCostMicrousd(totals.input, totals.output, price);
    const highCost = Math.ceil(baseCost * 1.35);
    const batchId = id('CTB');
    const snapshot = JSON.stringify({ provider, model, inputPriceMicrousdPerMillion: integer(price.input_price_microusd_per_million), outputPriceMicrousdPerMillion: integer(price.output_price_microusd_per_million), currency: price.currency, verifiedAt: price.verified_at });
    await env.ACTMASTER_DB.prepare(`INSERT INTO customer_tag_analysis_batches (batch_id,network_id,owner_user_id,created_by,state,provider,model,price_snapshot_json,eligible_customers,estimated_input_tokens,estimated_output_tokens,estimated_cost_microusd,estimated_high_cost_microusd,max_cost_microusd) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?,?)`).bind(batchId,networkId,ownerUserId,actorId,provider,model,snapshot,customers.length,totals.input,totals.output,baseCost,highCost,highCost).run();
    return { success: true, data: publicBatch(await first(env, `SELECT * FROM customer_tag_analysis_batches WHERE batch_id=?`, [batchId])) };
  },

  async approveBatch(payload, env) {
    const actorId = requireTony(payload);
    const batchId = text(payload.batchId, 160);
    const batch = await first(env, `SELECT * FROM customer_tag_analysis_batches WHERE batch_id=? AND state='draft'`, [batchId]);
    if (!batch) return { success: false, error: 'DRAFT_BATCH_NOT_FOUND' };
    const price = await first(env, `SELECT * FROM ai_model_price_catalog WHERE provider=? AND model=? AND enabled=1`, [batch.provider, batch.model]);
    if (!price || !priceIsFresh(price)) return { success: false, error: 'MODEL_PRICE_STALE' };
    const approvedMax = integer(payload.maxCostMicrousd, -1);
    if (approvedMax < integer(batch.estimated_high_cost_microusd)) return { success: false, error: 'MAX_COST_BELOW_ESTIMATE' };
    if (approvedMax > integer(batch.estimated_high_cost_microusd)) return { success: false, error: 'REESTIMATE_REQUIRED_FOR_HIGHER_BUDGET' };
    const customers = await all(env, `SELECT c.* FROM customer_records c LEFT JOIN customer_tag_profiles p ON p.customer_id=c.customer_id AND p.network_id=c.network_id AND p.owner_user_id=c.owner_user_id WHERE c.network_id=? AND c.owner_user_id=? AND c.archived_at='' AND (p.customer_id IS NULL OR (p.human_confirmed=0 AND (p.customer_version<>c.version OR p.analysis_status IN ('not_requested','failed','stale')))) ORDER BY c.updated_at DESC LIMIT 10000`, [batch.network_id,batch.owner_user_id]);
    if (customers.length !== integer(batch.eligible_customers)) return { success: false, error: 'CUSTOMER_SET_CHANGED_REESTIMATE_REQUIRED' };
    const statements = customers.map(row => { const estimate = tokenEstimateForCustomer(row); return env.ACTMASTER_DB.prepare(`INSERT OR IGNORE INTO customer_tag_analysis_jobs (job_id,batch_id,customer_id,network_id,owner_user_id,customer_version,status,estimated_input_tokens,estimated_output_tokens) VALUES (?,?,?,?,?,?,'pending',?,?)`).bind(id('CTJ'),batchId,row.customer_id,batch.network_id,batch.owner_user_id,row.version,estimate.input,estimate.output); });
    if (statements.length) {
      for (let offset = 0; offset < statements.length; offset += 100) await env.ACTMASTER_DB.batch(statements.slice(offset, offset + 100));
    }
    await env.ACTMASTER_DB.prepare(`UPDATE customer_tag_analysis_batches SET state='approved',max_cost_microusd=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,expires_at=datetime('now','+7 days'),updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND state='draft'`).bind(approvedMax,actorId,batchId).run();
    return { success: true, data: publicBatch(await first(env, `SELECT * FROM customer_tag_analysis_batches WHERE batch_id=?`, [batchId])) };
  },

  async pauseBatch(payload, env) {
    requireTony(payload);
    const batchId = text(payload.batchId, 160);
    await env.ACTMASTER_DB.prepare(`UPDATE customer_tag_analysis_batches SET state='paused',updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND state IN ('approved','running')`).bind(batchId).run();
    await env.ACTMASTER_DB.prepare(`UPDATE customer_tag_analysis_jobs SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND status='pending'`).bind(batchId).run();
    return { success: true, data: { batchId, state: 'paused' } };
  },

  async listProfiles(payload, env) {
    const { ownerUserId, networkId } = scope(payload);
    const rows = await all(env, `SELECT p.* FROM customer_tag_profiles p JOIN customer_records c ON c.customer_id=p.customer_id AND c.network_id=p.network_id AND c.owner_user_id=p.owner_user_id WHERE p.network_id=? AND p.owner_user_id=? AND c.archived_at='' ORDER BY p.updated_at DESC LIMIT 500`, [networkId,ownerUserId]);
    return { success: true, data: rows.map(row => ({ customerId: row.customer_id, personality: row.personality, hobbies: row.hobbies, wealth: row.wealth, health: row.health, career: row.career, analysisStatus: row.analysis_status, humanConfirmed: !!row.human_confirmed, analyzedAt: row.analyzed_at })) };
  },

  async processOffPeak(env, now = new Date()) {
    const settings = await first(env, `SELECT * FROM customer_tag_analysis_settings WHERE settings_key='global'`).catch(() => null);
    if (!settings || integer(settings.master_enabled) !== 1) return { skipped: 'MASTER_DISABLED' };
    if (!isTaipeiOffPeak(now, settings.offpeak_start_hour_taipei, settings.offpeak_end_hour_taipei)) return { skipped: 'OUTSIDE_OFFPEAK' };
    // The approval queue is intentionally claimed only after the model executor is enabled.
    // This prevents a schema deployment or Cron change from spending tokens by itself.
    return { skipped: 'EXECUTOR_NOT_ENABLED', approvedOnly: true };
  }
};
