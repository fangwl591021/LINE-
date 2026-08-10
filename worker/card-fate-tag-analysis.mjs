const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const integer = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const id = () => `CFT_${crypto.randomUUID().replace(/-/g, '')}`;
const TAG_COLUMNS = ['personality', 'hobbies', 'wealth', 'health', 'career'];

export function isTaipeiOffPeak(now = new Date(), startHour = 2, endHour = 5) {
  const hour = (now.getUTCHours() + 8) % 24;
  return hour >= integer(startHour, 2) && hour < integer(endHour, 5);
}

export function hasUsefulCardInput(card = {}) {
  return [card.name, card.mobile, card.birthday, card.company_name, card.title].some(value => text(value, 160));
}

export function parseFateTags(content) {
  const source = text(content, 12000);
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('MODEL_JSON_INVALID');
  const raw = JSON.parse(match[0]);
  const pick = (lower, upper) => text(raw[lower] ?? raw[upper], 500);
  const tags = {
    personality: pick('personality', 'Personality'),
    hobbies: pick('hobbies', 'Hobbies'),
    wealth: pick('wealth', 'Wealth'),
    health: pick('health', 'Health'),
    career: pick('career', 'Career')
  };
  if (TAG_COLUMNS.some(key => !tags[key])) throw new Error('MODEL_TAGS_INCOMPLETE');
  return tags;
}

async function first(env, sql, binds = []) {
  return await env.ACTMASTER_DB.prepare(sql).bind(...binds).first();
}

async function all(env, sql, binds = []) {
  const result = await env.ACTMASTER_DB.prepare(sql).bind(...binds).all();
  return Array.isArray(result?.results) ? result.results : [];
}

function allTagsPresent(card = {}) {
  return TAG_COLUMNS.every(key => text(card[key], 500));
}

function safeError(error) {
  const code = text(error?.message, 80).toUpperCase();
  if (/^MODEL_(JSON_INVALID|TAGS_INCOMPLETE)$/.test(code)) return code;
  if (code === 'OPENAI_KEY_MISSING') return code;
  return 'AI_PROVIDER_TEMPORARY_FAILURE';
}

async function callModel(card, env) {
  const apiKey = text(env.OPENAI_API_KEY, 500);
  if (!apiKey) throw new Error('OPENAI_KEY_MISSING');
  const model = text(env.OPENAI_TEXT_MODEL || env.OPENAI_MODEL, 120) || 'gpt-4o-mini';
  const prompt = `你是商務溝通輔助 AI。依據名片中使用者主動提供的資料，產生五項商務互動建議。不得聲稱醫療診斷、財務結果或確定命運；「財富」只描述預算/風險溝通偏好，「健康」只描述工作節奏與關懷溝通方式。資訊不足時使用保守、中性的表述。每項 20 至 40 個繁體中文字，輸出純 JSON。\n\n姓名：${text(card.name, 100) || '未提供'}\n手機：${text(card.mobile, 40) || '未提供'}\n生日：${text(card.birthday, 40) || '未提供'}\n公司：${text(card.company_name, 160) || '未提供'}\n職稱：${text(card.title, 100) || '未提供'}\n\nJSON：{"personality":"","hobbies":"","wealth":"","health":"","career":""}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('AI_PROVIDER_TEMPORARY_FAILURE');
    const result = await response.json();
    return {
      model,
      tags: parseFateTags(result?.choices?.[0]?.message?.content),
      inputTokens: integer(result?.usage?.prompt_tokens),
      outputTokens: integer(result?.usage?.completion_tokens)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const CardFateTagAnalysisModule = {
  async enqueueCard(cardRowId, env) {
    const rowId = text(cardRowId, 160);
    if (!rowId || !env?.ACTMASTER_DB) return { skipped: 'CARD_ID_MISSING' };
    const card = await first(env, `SELECT * FROM card_contacts WHERE row_id=? LIMIT 1`, [rowId]);
    if (!card || text(card.archived_at)) return { skipped: 'CARD_NOT_ELIGIBLE' };
    if (allTagsPresent(card)) {
      await env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET fate_analysis_status='completed',fate_analysis_error='',fate_analyzed_at=CASE WHEN fate_analyzed_at='' THEN CURRENT_TIMESTAMP ELSE fate_analyzed_at END WHERE row_id=?`).bind(rowId).run();
      return { skipped: 'TAGS_ALREADY_COMPLETE' };
    }
    if (!hasUsefulCardInput(card)) {
      await env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET fate_analysis_status='insufficient',fate_analysis_error='' WHERE row_id=?`).bind(rowId).run();
      return { skipped: 'CARD_INPUT_INSUFFICIENT' };
    }
    await env.ACTMASTER_DB.prepare(`INSERT INTO card_fate_tag_jobs (job_id,card_row_id,network_id,owner_user_id,status,attempts,available_at,lease_until,error_code,updated_at,completed_at) VALUES (?,?,?,?, 'pending',0,CURRENT_TIMESTAMP,'','',CURRENT_TIMESTAMP,'') ON CONFLICT(card_row_id) DO UPDATE SET network_id=excluded.network_id,owner_user_id=excluded.owner_user_id,status='pending',attempts=0,available_at=CURRENT_TIMESTAMP,lease_until='',error_code='',updated_at=CURRENT_TIMESTAMP,completed_at=''`).bind(id(),rowId,text(card.network_id,160)||'admin',text(card.owner_user_id || card.creator_id || card.line_id,160)).run();
    await env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET fate_analysis_status='queued',fate_analysis_error='' WHERE row_id=?`).bind(rowId).run();
    return { queued: true, cardRowId: rowId };
  },

  async processOffPeak(env, now = new Date()) {
    const settings = await first(env, `SELECT * FROM card_fate_tag_settings WHERE settings_key='global'`).catch(() => null);
    if (!settings || integer(settings.master_enabled) !== 1) return { skipped: 'MASTER_DISABLED' };
    if (!isTaipeiOffPeak(now, settings.offpeak_start_hour_taipei, settings.offpeak_end_hour_taipei)) return { skipped: 'OUTSIDE_OFFPEAK' };
    const maxAttempts = Math.max(1, integer(settings.max_attempts, 3));
    await env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status='pending',lease_until='',available_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='leased' AND lease_until<>'' AND lease_until<CURRENT_TIMESTAMP AND attempts<?`).bind(maxAttempts).run();
    await env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status='failed',error_code='RETRY_LIMIT_REACHED',updated_at=CURRENT_TIMESTAMP WHERE status='leased' AND lease_until<>'' AND lease_until<CURRENT_TIMESTAMP AND attempts>=?`).bind(maxAttempts).run();
    const todayCount = await first(env, `SELECT COUNT(*) AS count FROM card_fate_tag_jobs WHERE status='completed' AND completed_at>=datetime('now','start of day')`);
    const remaining = Math.max(0, integer(settings.max_jobs_per_day, 100) - integer(todayCount?.count));
    const limit = Math.min(Math.max(1, integer(settings.max_jobs_per_run, 5)), remaining);
    if (!limit) return { skipped: 'DAILY_LIMIT_REACHED' };
    const candidates = await all(env, `SELECT job_id FROM card_fate_tag_jobs WHERE status='pending' AND attempts<? AND available_at<=CURRENT_TIMESTAMP ORDER BY available_at,created_at LIMIT ?`, [maxAttempts, limit]);
    let completed = 0;
    for (const candidate of candidates) {
      const claim = await env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status='leased',attempts=attempts+1,lease_until=datetime('now','+2 minutes'),updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND status='pending'`).bind(candidate.job_id).run();
      if (integer(claim?.meta?.changes) !== 1) continue;
      const job = await first(env, `SELECT * FROM card_fate_tag_jobs WHERE job_id=?`, [candidate.job_id]);
      const card = await first(env, `SELECT * FROM card_contacts WHERE row_id=? LIMIT 1`, [job.card_row_id]);
      if (!card || text(card.archived_at)) {
        await env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status='cancelled',lease_until='',error_code='CARD_NOT_ELIGIBLE',updated_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(job.job_id).run();
        continue;
      }
      if (!hasUsefulCardInput(card)) {
        await env.ACTMASTER_DB.batch([
          env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status='insufficient',lease_until='',error_code='',updated_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(job.job_id),
          env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET fate_analysis_status='insufficient',fate_analysis_error='' WHERE row_id=?`).bind(job.card_row_id)
        ]);
        continue;
      }
      await env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET fate_analysis_status='analyzing',fate_analysis_error='' WHERE row_id=?`).bind(job.card_row_id).run();
      try {
        const result = await callModel(card, env);
        await env.ACTMASTER_DB.batch([
          env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET personality=?,hobbies=?,wealth=?,health=?,career=?,fate_analysis_status='completed',fate_analysis_error='',fate_analyzed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE row_id=?`).bind(result.tags.personality,result.tags.hobbies,result.tags.wealth,result.tags.health,result.tags.career,job.card_row_id),
          env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status='completed',lease_until='',error_code='',model=?,input_tokens=?,output_tokens=?,updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(result.model,result.inputTokens,result.outputTokens,job.job_id)
        ]);
        completed += 1;
      } catch (error) {
        const code = safeError(error);
        const failed = integer(job.attempts) >= maxAttempts || code === 'OPENAI_KEY_MISSING';
        const delay = integer(job.attempts) <= 1 ? '+15 minutes' : '+60 minutes';
        await env.ACTMASTER_DB.batch([
          env.ACTMASTER_DB.prepare(`UPDATE card_fate_tag_jobs SET status=?,lease_until='',available_at=datetime('now',?),error_code=?,updated_at=CURRENT_TIMESTAMP WHERE job_id=?`).bind(failed?'failed':'pending',delay,code,job.job_id),
          env.ACTMASTER_DB.prepare(`UPDATE card_contacts SET fate_analysis_status=?,fate_analysis_error=? WHERE row_id=?`).bind(failed?'failed':'queued',code,job.card_row_id)
        ]);
      }
    }
    return { claimed: candidates.length, completed };
  }
};
