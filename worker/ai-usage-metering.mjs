const PROJECT = { code: 'LINE-', name: 'AI 商脈系統', worker: 'line-engine' };
const text = (v, n = 500) => String(v ?? '').trim().slice(0, n);
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const uid = () => `AIU_${crypto.randomUUID().replace(/-/g, '')}`;

export const AI_ACTIONS = new Map([
  ['recognizeCardWithGPT4o', ['business_card_ocr', '名片 OCR', 'openai', 'OPENAI_API_KEY']],
  ['matchmakeContacts', ['contact_matching', '智能配對', 'openai', 'OPENAI_API_KEY']],
  ['calculateFateTags', ['fate_tags', '五大標籤', 'openai', 'OPENAI_API_KEY']],
  ['reviewCardSafety', ['card_safety', '名片健檢', 'openai', 'OPENAI_API_KEY']],
  ['generateCardCopy', ['card_copy', '名片文案', 'openai', 'OPENAI_API_KEY']],
  ['suggestCustomerImportMapping', ['customer_import_mapping', '客戶匯入欄位分析', 'openai', 'OPENAI_API_KEY']]
]);

export const AIUsageMeter = {
  isTrackedAction(action) { return AI_ACTIONS.has(text(action, 100)); },

  async logAction({ action, payload = {}, body = {}, ok = true, latencyMs = 0 }, env) {
    if (!env?.ACTMASTER_DB) return;
    const meta = AI_ACTIONS.get(text(action, 100));
    if (!meta) return;
    const [featureCode, featureName, defaultProvider, secretName] = meta;
    const success = ok && body?.success !== false && !body?.error;
    const provider = text(body?.providerUsed || body?.provider || body?.data?.providerUsed || body?.data?.provider, 40).toLowerCase() || defaultProvider;
    const model = text(body?.modelUsed || body?.model || body?.data?.modelUsed || body?.data?.model, 120);
    const usage = body?.usage || body?.data?.usage || {};
    const rate = await env.ACTMASTER_DB.prepare('SELECT unit_price_twd FROM ai_billing_rates WHERE project_code=? AND feature_code=? AND enabled=1 LIMIT 1').bind(PROJECT.code, featureCode).first().catch(() => null);
    const price = Math.max(0, num(rate?.unit_price_twd));
    await env.ACTMASTER_DB.prepare(`INSERT INTO ai_usage_logs
      (usage_id,project_code,project_name,worker_name,network_id,actor_user_id,action,feature_code,feature_name,provider,model,secret_name,status,fallback_used,latency_ms,request_count,input_tokens,output_tokens,image_count,unit_price_twd,billable_amount_twd,error_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(uid(),PROJECT.code,PROJECT.name,PROJECT.worker,text(payload.networkId||payload.network_id,160)||'admin',text(payload.userId||payload.lineId,160),text(action,100),featureCode,featureName,provider,model,provider==='gemini'?'GEMINI_API_KEY':secretName,success?'success':'failed',body?.fallbackUsed?1:0,Math.max(0,Math.round(num(latencyMs))),1,num(usage.input_tokens??usage.prompt_tokens),num(usage.output_tokens??usage.completion_tokens),featureCode==='business_card_ocr'?1:0,price,success?price:0,success?'':text(body?.error||body?.data?.error,120)).run();
  },

  async getDashboard(env, payload = {}) {
    const month = /^\d{4}-\d{2}$/.test(text(payload.month,7)) ? text(payload.month,7) : new Date().toISOString().slice(0,7);
    const start = `${month}-01 00:00:00`;
    const next = new Date(`${month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1);
    const end = `${next.toISOString().slice(0,7)}-01 00:00:00`;
    const summary = await env.ACTMASTER_DB.prepare(`SELECT feature_code,feature_name,provider,status,SUM(request_count) requests,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(image_count) image_count,SUM(billable_amount_twd) billable_amount_twd,AVG(latency_ms) avg_latency_ms FROM ai_usage_logs WHERE project_code=? AND created_at>=? AND created_at<? GROUP BY feature_code,feature_name,provider,status ORDER BY requests DESC`).bind(PROJECT.code,start,end).all();
    const recent = await env.ACTMASTER_DB.prepare(`SELECT created_at,feature_name,provider,model,status,fallback_used,latency_ms,unit_price_twd,billable_amount_twd,error_code FROM ai_usage_logs WHERE project_code=? ORDER BY created_at DESC LIMIT 100`).bind(PROJECT.code).all();
    const rates = await env.ACTMASTER_DB.prepare(`SELECT feature_code,feature_name,billing_unit,unit_price_twd,enabled,updated_at FROM ai_billing_rates WHERE project_code=? ORDER BY feature_code`).bind(PROJECT.code).all();
    return { success:true, data:{ project:PROJECT, month, providers:[{provider:'gemini',secretName:'GEMINI_API_KEY',role:'available'},{provider:'openai',secretName:'OPENAI_API_KEY',role:'primary_current'}], summary:summary.results||[], recent:recent.results||[], rates:rates.results||[] } };
  },

  async saveRate(env, payload = {}) {
    const featureCode = text(payload.featureCode,80);
    const meta = [...AI_ACTIONS.values()].find(v => v[0]===featureCode);
    if (!meta) return { success:false, error:'INVALID_FEATURE_CODE' };
    const price = Math.max(0,num(payload.unitPriceTwd));
    await env.ACTMASTER_DB.prepare(`INSERT INTO ai_billing_rates(project_code,feature_code,feature_name,billing_unit,unit_price_twd,enabled,updated_at) VALUES(?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(project_code,feature_code) DO UPDATE SET unit_price_twd=excluded.unit_price_twd,enabled=1,updated_at=CURRENT_TIMESTAMP`).bind(PROJECT.code,featureCode,meta[1],'request',price).run();
    return { success:true, data:{ featureCode, unitPriceTwd:price } };
  }
};
