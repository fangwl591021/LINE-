const text = (value, max = 12000) => String(value ?? '').trim().slice(0, max);

const OCR_PROMPT = `請解析這張名片並提取資訊。支援多國語言（如英文、日文等），若無中文請直接保留原文。只輸出 JSON，不要 Markdown。JSON 格式：{"姓名":"","英文名":"","職稱":"","公司名稱":"","手機號碼":"","公司電話":"","電子郵件":"","公司網址":"","公司地址":"","統一編號":"","分機":"","傳真":"","部門":"","社群帳號":"","服務項目":""}。所有欄位必須是字串，電話號碼保留開頭的 0。`;

function parseDataUri(dataUri) {
  const match = String(dataUri || '').match(/^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('INVALID_CARD_IMAGE');
  return { mimeType: match[1] || 'image/jpeg', data: match[2].replace(/\s+/g, '') };
}

function extractJson(raw) {
  const source = text(raw);
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('GEMINI_JSON_INVALID');
  const parsed = JSON.parse(match[0]);
  const fields = ['姓名','英文名','職稱','公司名稱','手機號碼','公司電話','電子郵件','公司網址','公司地址','統一編號','分機','傳真','部門','社群帳號','服務項目'];
  const result = {};
  for (const field of fields) result[field] = parsed[field] == null ? '' : String(parsed[field]).trim();
  return result;
}

async function uploadImage(base64Image, env) {
  if (!env?.IMG_BUCKET) return '';
  const { mimeType, data } = parseDataUri(base64Image);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const subtype = (mimeType.split('/')[1] || 'jpeg').replace(/[^a-zA-Z0-9]/g, '') || 'jpeg';
  const fileName = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${subtype}`;
  await env.IMG_BUCKET.put(fileName, bytes, { httpMetadata: { contentType: mimeType } });
  const baseUrl = text(env.R2_WORKER_URL, 500).replace(/\/$/, '') || 'https://photoman.fangwl591021.workers.dev';
  return `${baseUrl}/${fileName}`;
}

function decorateCard(cardData, uploadedImgUrl) {
  cardData['名片圖檔'] = uploadedImgUrl;
  const buttons = [];
  if (cardData['手機號碼']) buttons.push({ l: '撥打手機', u: 'tel:' + cardData['手機號碼'].replace(/[^0-9+]/g, ''), c: '#06C755' });
  if (cardData['公司電話']) buttons.push({ l: '撥打市話', u: 'tel:' + cardData['公司電話'].replace(/[^0-9+]/g, ''), c: '#3b82f6' });
  if (cardData['公司地址']) buttons.push({ l: '地圖導航', u: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cardData['公司地址']), c: '#ef4444' });
  if (cardData['公司網址']) {
    let url = cardData['公司網址'];
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    buttons.push({ l: '官方網站', u: url, c: '#64748b' });
  }
  cardData['自訂名片設定'] = JSON.stringify({ cardType: 'v1', imgUrl: uploadedImgUrl, title: cardData['姓名'] || cardData['英文名'] || '數字名片', desc: cardData['服務項目'] || cardData['職稱'] || cardData['公司名稱'] || '', buttons, isPrivate: false, descAlign: 'center', descColor: '#666666' });
  return cardData;
}

export const GeminiCardOCR = {
  async recognize(payload = {}, env) {
    if (!env?.GEMINI_API_KEY) throw new Error('GEMINI_KEY_MISSING');
    const base64Image = String(payload.base64Image || '');
    const image = parseDataUri(base64Image);
    const model = text(env.GEMINI_OCR_MODEL || env.GEMINI_MODEL, 120) || 'gemini-3.6-flash';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: image.mimeType, data: image.data } }, { text: OCR_PROMPT }] }], generationConfig: { responseMimeType: 'application/json' } }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
      const raw = (body?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('');
      const cardData = extractJson(raw);
      const uploadedImgUrl = await uploadImage(base64Image, env);
      decorateCard(cardData, uploadedImgUrl);
      return { success: true, data: cardData, providerUsed: 'gemini', modelUsed: model, fallbackUsed: false, usage: { input_tokens: Number(body?.usageMetadata?.promptTokenCount || 0), output_tokens: Number(body?.usageMetadata?.candidatesTokenCount || 0) } };
    } finally {
      clearTimeout(timeout);
    }
  }
};
