/**
 * ACTMASTER v6.0 - 企業安全防護版 (Edge Auth & Security)
 * 特點：導入 Cloudflare KV 進行毫秒級身分驗證，並新增 LINE Token 強制核對與 OpenAI 流量防護機制
 */

// ==================== 模組 0: 資安防護 (Security Module) ====================
const SecurityModule = {
  // 驗證 LIFF Token，確保 userId 未被偽造
  async verifyLineAuth(userId, token, env) {
    if (!token || !userId) return false;
    if (!env.ACTMASTER_KV) return true; // 若未綁定 KV 則暫時放行(避免癱瘓系統)

    const cacheKey = `AUTH_${token.substring(0, 30)}`; // 避免 Key 過長
    const cachedUserId = await env.ACTMASTER_KV.get(cacheKey);
    if (cachedUserId === userId) return true;

    try {
      const res = await fetch('https://api.line.me/v2/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status !== 200) return false;
      const data = await res.json();
      
      if (data.userId === userId) {
        // 驗證成功，快取 1 小時，大幅降低 LINE API 呼叫延遲
        await env.ACTMASTER_KV.put(cacheKey, userId, { expirationTtl: 3600 });
        return true;
      }
      return false;
    } catch(e) {
      return false;
    }
  },

  // 防刷機制 (Rate Limiting)
  async checkRateLimit(userId, action, env, role) {
    if (!env.ACTMASTER_KV || !userId) return true;
    
    const date = new Date().toISOString().split('T')[0];
    const key = `RL_${action}_${userId}_${date}`;
    
    // 定義各項 AI 功能的每日上限
    const limits = { 
      recognizeCardWithGPT4o: 10, 
      fateTags: 10, 
      matchmakeContacts: 20,
      reviewCardSafety: 50,
      generateCardCopy: 50
    };
    let max = limits[action] || 50;
    if (action === 'generateCardCopy' || action === 'reviewCardSafety') {
      if (role === 'admin') return true;
      max = (role === 'store' || role === 'tenant') ? 50 : 5;
    }

    let count = parseInt(await env.ACTMASTER_KV.get(key)) || 0;
    if (count >= max) return false;

    await env.ACTMASTER_KV.put(key, (count + 1).toString(), { expirationTtl: 86400 });
    return true;
  }
};

// ==================== 模組 1: 核心工具 (Core Utils) ====================
const Utils = {
  zwsp: String.fromCharCode(8203),
  
  getIconUrl(type) {
    const icons = {
      "LINE": "https://aiwe.cc/wp-content/uploads/2026/02/b75a5831fd553c7130aeafbb9783cf79.png",
      "FB":   "https://aiwe.cc/wp-content/uploads/2026/02/3986d1fd62384c8cdaa0e7c82f2740d1.png",
      "IG":   "https://aiwe.cc/wp-content/uploads/2026/02/a33306edcecd1ebdfd14baea6718cf23.png",
      "YT":   "https://aiwe.cc/wp-content/uploads/2026/02/87e6f8054bd3672f2885e38bddb112e2.png",
      "TEL":  "https://aiwe.cc/wp-content/uploads/2026/02/7254567388850a6b4d77b75208ebd4b8.png",
      "WEB":  "https://cdn-icons-png.flaticon.com/512/1006/1006771.png"
    };
    return icons[type] || icons['WEB'];
  },

  cleanURI(uri) {
    if (!uri) return '';
    uri = uri.trim();
    if (uri === 'http://' || uri === 'https://') return '';
    if (!uri.match(/^(http|https|tel|mailto|line):/i)) return 'https://' + uri;
    return uri;
  },

  formatPhone(val) {
    if (!val) return '';
    let s = String(val).replaceAll(this.zwsp, '').replaceAll("'", "");
    return this.zwsp + s;
  },

  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

// ==================== 模組 2: 圖片處理 (Storage Module) ====================
const StorageModule = {
  async upload(base64Image, env) {
    try {
      if (env.IMG_BUCKET) {
        const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const binaryStr = atob(matches[2]);
          const buffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) buffer[i] = binaryStr.charCodeAt(i);
          const ext = mimeType.split('/')[1] || 'jpeg';
          const fileName = `card_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
          await env.IMG_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: mimeType } });
          const baseUrl = env.R2_WORKER_URL ? env.R2_WORKER_URL.replace(/\/$/, '') : 'https://photoman.fangwl591021.workers.dev';
          return `${baseUrl}/${fileName}`;
        }
      } 
      
      if (env.PHOTOMAN) {
        const r2Res = await env.PHOTOMAN.fetch("https://photoman.internal/", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        });
        const r2Data = await r2Res.json();
        if (r2Data.url) return r2Data.url;
      }

      // ImgBB 備援 
      if (!env.IMGBB_API_KEY) throw new Error("Missing IMGBB_API_KEY in environment variables");
      const formData = new URLSearchParams();
      formData.append('image', base64Image.replace(/^data:image\/[a-z]+;base64,/, ''));
      const bbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const bbData = await bbRes.json();
      return bbData.data?.url || '';
    } catch (e) {
      console.error("[Storage Error]", e);
      return '';
    }
  }
};

// ==================== 模組 3: AI 服務 (AI Module) ====================
const AIModule = {
  getOpenAIKeys(env) {
    return [
      env.OPENAI_API_KEY,
      env.OPENAI_API_KEY_2,
      env.OPENAI_API_KEY_BACKUP,
      env.OPENAI_BACKUP_API_KEY
    ].filter((key, index, list) => key && list.indexOf(key) === index);
  },

  async callOpenAI(env, body) {
    const keys = this.getOpenAIKeys(env);
    if (!keys.length) throw new Error("Missing OPENAI_API_KEY");

    let lastError = '';
    for (let i = 0; i < keys.length; i++) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + keys[i], 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) {
          lastError = result.error?.message || ('OpenAI HTTP ' + response.status);
          console.warn('[OpenAI fallback]', 'key', i + 1, lastError);
          continue;
        }
        if (!result.choices?.[0]?.message) {
          lastError = 'OpenAI did not return choices';
          continue;
        }
        return result;
      } catch (e) {
        lastError = e.message || String(e);
        console.warn('[OpenAI fallback]', 'key', i + 1, lastError);
      }
    }

    throw new Error(lastError || 'OpenAI request failed');
  },

  async callGemini(env, prompt, temperature = 0.2) {
    if (!env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error?.message || ('Gemini HTTP ' + response.status));
    }
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');
    if (!text) throw new Error('Gemini did not return text');
    return text;
  },

  async recognize(payload, env) {
    try {
      const uploadedImgUrl = await StorageModule.upload(payload.base64Image, env);

      const result = await this.callOpenAI(env, {
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: payload.base64Image, detail: 'high' } },
              { type: 'text', text: '請解析這張名片並提取資訊。支援多國語言（如英文、日文等），若無中文請直接保留原文。輸出JSON格式：{"姓名":"","英文名":"","職稱":"","公司名稱":"","手機號碼":"","公司電話":"","電子郵件":"","公司網址":"","公司地址":"","統一編號":"","分機":"","傳真":"","部門":"","社群帳號":"","服務項目":""}\n所有欄位必須是字串，保留開頭的 0。' }
            ]
          }]
        });
      
      const text = result.choices[0].message.content;
      let cardData = {};
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) cardData = JSON.parse(jsonMatch[0]);
      
      cardData['名片圖檔'] = uploadedImgUrl;
      
      let autoButtons = [];
      if (cardData['手機號碼']) autoButtons.push({ l: '撥打手機', u: 'tel:' + cardData['手機號碼'].replace(/[^0-9+]/g, ''), c: '#06C755' });
      if (cardData['公司電話']) autoButtons.push({ l: '撥打市話', u: 'tel:' + cardData['公司電話'].replace(/[^0-9+]/g, ''), c: '#3b82f6' });
      if (cardData['公司地址']) autoButtons.push({ l: '地圖導航', u: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cardData['公司地址']), c: '#ef4444' });
      if (cardData['電子郵件']) autoButtons.push({ l: '發送郵件', u: 'mailto:' + cardData['電子郵件'], c: '#f59e0b' });
      if (cardData['公司網址']) {
          let url = cardData['公司網址'].trim();
          if (!url.startsWith('http')) url = 'https://' + url;
          autoButtons.push({ l: '官方網站', u: url, c: '#64748b' });
      }
      
      const config = {
        cardType: 'v1', imgUrl: uploadedImgUrl, title: cardData['姓名'] || cardData['英文名'] || '數字名片',
        desc: cardData['服務項目'] || cardData['職稱'] || cardData['公司名稱'] || '',
        buttons: autoButtons, isPrivate: false, descAlign: 'center', descColor: '#666666'
      };
      cardData['自訂名片設定'] = JSON.stringify(config);
      
      return { success: true, data: cardData };
    } catch (e) {
      return { success: false, error: "AI 辨識失敗: " + e.message };
    }
  },

  async matchmaking(payload, env) {
    try {
      const { currentUser, query, contacts } = payload;
      const contactsList = contacts.map((c, i) => `${i+1}. ${c.Name||'未知'} (${c.Company||'無'}) \n標籤: ${c.Tags||'無'}`).join('\n');
      const prompt = `尋求者：${currentUser.name}，需求：${query}\n候選人：\n${contactsList}\n請選前3位，返回純 JSON 陣列: [{"index":0,"score":95,"reason":"結合標籤與需求，給出20字內的推薦理由"}]`;
      
      const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
      const jsonMatch = result.choices[0].message.content.match(/\[[\s\S]*\]/);
      const matches = jsonMatch ? JSON.parse(jsonMatch[0]).map(item => ({ rowId: contacts[item.index]?.rowId, score: item.score, reason: item.reason })) : [];
      return { success: true, data: matches };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async reviewCardSafety(payload, env) {
    try {
      const card = payload.card || {};
      const prompt = `你是名片公開搜尋前的安全審核員。請檢查文字與圖片是否包含色情、性交易、裸露暗示、犯罪、詐騙、毒品、武器、賭博、暴力或其他高風險內容。
只回傳純 JSON，不要解釋在 JSON 外。
格式：{"pass":true,"riskLevel":"low","reasons":[],"suggestions":[]}
若有疑慮 pass=false，reasons 用繁體中文列出原因，suggestions 提供可修改方向。
名片資料：${JSON.stringify(card).slice(0, 6000)}`;
      const content = [{ type: 'text', text: prompt }];
      if (card.imageUrl && /^https?:\/\//i.test(card.imageUrl)) {
        content.push({ type: 'image_url', image_url: { url: card.imageUrl, detail: 'low' } });
      }

      let text = '';
      try {
        const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content }], temperature: 0 });
        text = result.choices?.[0]?.message?.content || '{}';
      } catch (openaiError) {
        console.warn('[AI fallback] reviewCardSafety OpenAI failed, trying Gemini:', openaiError.message);
        text = await this.callGemini(env, prompt, 0);
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { pass: false, reasons: ['AI 健檢沒有回傳有效結果'], suggestions: ['請稍後再試'] };
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'AI 名片健檢失敗: ' + e.message };
    }
  },

  async generateCardCopy(payload, env) {
    try {
      const card = payload.card || {};
      const brief = payload.brief || '';
      const prompt = `你是商務名片文案顧問。請根據名片資料與使用者補充，產生適合數位名片的服務介紹。
要求：
1. 使用繁體中文。
2. 4 到 5 行，每行盡量 16 字內。
3. 具體、可信、不要誇大療效或保證收益。
4. 不得產生色情、犯罪、詐騙、賭博、毒品、武器等違規內容。
只回傳純 JSON：{"service":"第一行\\n第二行\\n第三行","headline":"","tips":[]}
名片資料：${JSON.stringify(card).slice(0, 5000)}
補充需求：${brief}`;

      let text = '';
      try {
        const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.7 });
        text = result.choices?.[0]?.message?.content || '{}';
      } catch (openaiError) {
        console.warn('[AI fallback] generateCardCopy OpenAI failed, trying Gemini:', openaiError.message);
        text = await this.callGemini(env, prompt, 0.7);
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'AI 名片代寫失敗: ' + e.message };
    }
  },

  async fateTags(payload, env) {
    try {
      const prompt = `你是一位專業的商務AI心理與命理分析專家。請根據以下資料（姓名用字、手機號碼頻率與尾數、生日），進行深度商務人格分析。
姓名：${payload.Name || '未知'}
手機：${payload.Mobile || '未知'}
生日：${payload.Birthday || '未知'}
公司：${payload.Company || '未知'}
職稱：${payload.Title || '未知'}

分析邏輯與必含維度參考：
1. 姓名：字形判斷行動/思考型，發音判斷外向/內斂，結構判斷主導/依附。
2. 手機號碼：數字頻率(1領導,2協調...9理想)，尾數判斷決策模式(快攻/慢養)，奇偶比判斷衝動/保守。
3. 生日（若有填寫）：請立即啟動並融合「八字」、「紫微斗數」、「生命靈數」與「東西方星座學」的運算模型，疊加分析其先天命格、潛能與流年運勢。
4. 【重點要求】分析結果必須明確判斷並結合以下商務特徵：
   - 感官接收偏好 (VAK)：視覺型、聽覺型、或觸覺型。
   - 思考與決策模式：分析型、數據型、或直覺型。
   - 行為與風險偏好：積極/消極、冒險/保守。

【強制要求】：請輸出純 JSON 格式。五大維度（Personality, Hobbies, Wealth, Health, Career）的值，每個都「必須」是一段 20 到 40 字的完整情境描述，請直接給出具體特徵與商務應對建議（例如：此人為視覺數據型，決策保守，建議提供圖表數據...），絕對不要只給單詞。
JSON格式：{"Personality":"","Hobbies":"","Wealth":"","Health":"","Career":""}`;

      const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
      const jsonMatch = result.choices[0].message.content.match(/\{[\s\S]*\}/);
      return { success: true, data: jsonMatch ? JSON.parse(jsonMatch[0]) : {} };
    } catch (e) { return { success: false, error: e.message }; }
  }
};

// ==================== 模組 4: 訊息構建 (Messaging Module) ====================
const MessagingModule = {
  buildFlex(payload) {
    const { card, config, referrerId, networkId, liffId } = payload;
    
    const activeLiffId = liffId || '2009886448-2UHnJgyT';
    let badgeUrl = 'https://liff.line.me/' + activeLiffId + '?shareCardId=' + card.rowId;
    if (referrerId) badgeUrl += '&ref=' + referrerId;
    if (networkId) badgeUrl += '&net=' + networkId;

    const imgUrl = config.imgUrl || card['名片圖檔'] || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
    
    let buttons = (config.buttons || []).map(b => ({ l: b.l, u: Utils.cleanURI(b.u), c: b.c }))
      .filter(b => b.l && b.u)
      .map(btn => ({
        type: "button", style: "primary", color: btn.c || "#06C755", height: "sm",
        action: { type: "uri", label: btn.l.substring(0, 40), uri: btn.u }
      }));

    let hero = { type: "image", url: imgUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover", action: { type: "uri", uri: badgeUrl } };
    if (config.cardType === 'video' && config.videoUrl) {
      hero = { type: "video", url: config.videoUrl, previewUrl: imgUrl, aspectRatio: "20:13", altContent: { type: "image", size: "full", aspectRatio: "20:13", aspectMode: "cover", url: imgUrl, action: { type: "uri", uri: badgeUrl } } };
    }

    const titleText = (config.title || card['姓名'] || ' ').trim() || ' ';
    const descText = (config.desc || card['服務項目'] || ' ').trim() || ' ';

    return {
      type: "bubble", size: "mega",
      header: {
        type: "box", layout: "horizontal", justifyContent: "flex-end", paddingAll: "8px",
        contents: [{
          type: "box", layout: "vertical", justifyContent: "center", backgroundColor: "#FF0000", width: "65px", height: "25px", cornerRadius: "25px",
          contents: [{ type: "text", text: "分享", weight: "bold", align: "center", color: "#FFFFFF", size: "xs" }],
          action: { type: "uri", uri: badgeUrl }
        }]
      },
      hero: hero,
      body: {
        type: "box", layout: "vertical", paddingAll: "15px",
        contents: [
          { type: "text", text: titleText, weight: "bold", size: "xl", align: "center", wrap: true },
          { type: "text", text: descText, size: "sm", margin: "md", color: config.descColor || "#666666", wrap: true, align: config.descAlign || "center" }
        ]
      },
      footer: buttons.length > 0 ? { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: buttons } : undefined
    };
  }
};

// ==================== 模組 5: 資料庫轉發 (Database Module) ====================
const DBModule = {
  async forward(action, payload, env) {
    try {
      const response = await fetch(env.GAS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      if (response.status === 302) {
        const loc = response.headers.get('location');
        const res2 = await fetch(loc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
        return await res2.json();
      }
      return await response.json();
    } catch (e) { return { success: false, error: "GAS Connection Failed" }; }
  }
};

// ==================== 模組 6: 邊緣快取驗證 (Edge Auth KV Module) ====================
const AuthModule = {
  getCardLineId(card) {
    return String((card && (card['LINE ID'] || card.lineId || card.userId)) || '').trim();
  },

  buildProfileFromBoundCard(card, userId) {
    const company = String(card['公司名稱'] || '').trim();
    const title = String(card['職稱'] || '').trim();
    const phone = String(card['手機號碼'] || card['公司電話'] || '').trim();
    return {
      userId,
      name: String(card['姓名'] || card['英文名'] || '待補資料').trim(),
      phone,
      industry: title || company || '已綁定名片',
      birthday: '',
      role: 'user',
      networkId: String(card['歸屬網'] || 'admin').trim(),
      claimedCardRowId: card.rowId || '',
      companyName: company,
      title,
      profileStatus: phone ? 'active' : 'bound_card',
      source: 'bound_card'
    };
  },

  async ensureBoundCardUser(userId, env) {
    const cardsResult = await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env);
    const cards = cardsResult && Array.isArray(cardsResult.data) ? cardsResult.data : (Array.isArray(cardsResult) ? cardsResult : []);
    const card = cards.find(c => this.getCardLineId(c) === userId);
    if (!card) return null;

    const profile = this.buildProfileFromBoundCard(card, userId);
    const result = await DBModule.forward('registerUser', profile, env);
    if (!result || !result.success) return null;
    if (env.ACTMASTER_KV) {
      try {
        await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`);
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      } catch (e) { console.error("KV Write Error", e); }
    }
    return profile;
  },

  async getAllUsersWithBoundCards(payload, env) {
    const usersResult = await DBModule.forward('getAllUsers', payload, env);
    const cardsResult = await DBModule.forward('getCardContacts', { ...payload, role: 'admin', networkId: payload.networkId || 'admin' }, env);
    const users = usersResult && Array.isArray(usersResult.data) ? usersResult.data : (Array.isArray(usersResult) ? usersResult : []);
    const cards = cardsResult && Array.isArray(cardsResult.data) ? cardsResult.data : (Array.isArray(cardsResult) ? cardsResult : []);
    const seen = new Set(users.map(u => String(u.userId || '').trim()).filter(Boolean));
    const merged = [...users];

    cards.forEach(card => {
      const userId = this.getCardLineId(card);
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      merged.push(this.buildProfileFromBoundCard(card, userId));
    });

    return { success: true, data: merged };
  },

  async check(payload, env) {
    const userId = payload.userId;
    if (!userId) return { success: false, error: "Missing userId" };

    if (env.ACTMASTER_KV) {
      try {
        // 🚨 修正：變更 Cache Key 前綴，瞬間作廢所有舊記憶
        const cached = await env.ACTMASTER_KV.get(`U_PROFILE_${userId}`, 'json');
        if (cached) {
          return { success: true, data: { isRegistered: true, info: cached } };
        }
      } catch (e) { console.error("KV Read Error", e); }
    }

    const result = await DBModule.forward('checkUser', payload, env);

    if (result && result.success && result.data && result.data.isRegistered && env.ACTMASTER_KV) {
      try {
        // 🚨 修正：縮短快取為 600 秒 (10 分鐘)，避免資料庫變更卡住
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(result.data.info), { expirationTtl: 600 });
      } catch (e) { console.error("KV Write Error", e); }
    }

    if (result && result.success && result.data && !result.data.isRegistered) {
      const boundProfile = await this.ensureBoundCardUser(userId, env);
      if (boundProfile) {
        return { success: true, data: { isRegistered: true, info: boundProfile, source: 'bound_card' } };
      }
    }
    return result;
  },

  async updateAndClearCache(action, payload, env) {
    const forwardPayload = { ...payload };
    if (action === 'updateUserRole' && payload.targetUserId) {
      forwardPayload.userId = payload.targetUserId;
      forwardPayload.operatorId = payload.operatorId || payload.authUserId || payload.userId || '';
    }

    const result = await DBModule.forward(action, forwardPayload, env);

    if (result && result.success && env.ACTMASTER_KV) {
      try {
        let targetUserId = null;
        if (action === 'updateUserRole') {
          targetUserId = payload.targetUserId || payload.userId;
        } else if (action === 'registerUser' || action === 'updateUserProfile') {
          targetUserId = payload.userId;
        }

        if (targetUserId) {
          // 🚨 修正：連帶修改清除指令的前綴
          await env.ACTMASTER_KV.delete(`U_PROFILE_${targetUserId}`);
        }
      } catch(e) { console.error("KV Delete Error", e); }
    }
    return result;
  },

  async adminSyncBoundCardUser(payload, env) {
    const profile = payload.profile || {};
    const targetUserId = payload.targetUserId || profile.userId;
    if (!targetUserId) return { success: false, error: "Missing targetUserId" };

    const nextProfile = {
      ...profile,
      userId: targetUserId,
      role: profile.role || 'user',
      profileStatus: profile.profileStatus || 'incomplete',
      source: profile.source || 'bound_card'
    };

    const result = await DBModule.forward('registerUser', nextProfile, env);
    if (result && result.success && env.ACTMASTER_KV) {
      try {
        await env.ACTMASTER_KV.delete(`U_PROFILE_${targetUserId}`);
      } catch(e) { console.error("KV Delete Error", e); }
    }
    return result;
  }
};

const TrackingModule = {
  async recordShareCardVisit(payload, env) {
    const visitorId = payload.visitorId || payload.userId;
    const shareCardId = payload.shareCardId || '';
    const referrerId = payload.referrerId || '';
    const networkId = payload.networkId || 'admin';

    if (!visitorId || !shareCardId) {
      return { success: false, error: 'Missing visitorId or shareCardId' };
    }
    if (referrerId && referrerId === visitorId) {
      return { success: true, data: { skipped: true, reason: 'self_referral' } };
    }

    const key = `FIRST_SHARE_TOUCH_${visitorId}`;
    if (env.ACTMASTER_KV) {
      const existing = await env.ACTMASTER_KV.get(key, 'json');
      if (existing) {
        return { success: true, data: { skipped: true, existing } };
      }
    }

    const record = {
      visitorId,
      shareCardId,
      referrerId,
      networkId,
      firstTouchOnly: true,
      touchedAt: new Date().toISOString()
    };

    const result = await DBModule.forward('recordShareCardVisit', record, env);

    if (env.ACTMASTER_KV && (!result || result.success !== false)) {
      await env.ACTMASTER_KV.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 365 });
    }

    return result && result.success !== undefined
      ? result
      : { success: true, data: record };
  }
};

const BONUS_POLICY_TYPE = 'left_right_independent_split';

const BonusPolicyModule = {
  getPolicy(payload = {}) {
    const bv = Number(payload.bv || payload.bonusBV || payload.bonusAmount || 3000);
    const splitBonus = Number(payload.bonusPolicy?.splitBonus || payload.splitBonus || Math.floor(bv / 2));
    return {
      type: BONUS_POLICY_TYPE,
      grossAmount: Number(payload.grossAmount || payload.price || payload.fee || payload.amount || 6300),
      bv,
      directFullBonus: Number(payload.bonusPolicy?.directFullBonus || payload.bonusPolicy?.independentBonus || payload.directFullBonus || bv),
      directSplitBonus: splitBonus,
      sponsorSplitBonus: Number(payload.bonusPolicy?.sponsorSplitBonus || payload.sponsorSplitBonus || (bv - splitBonus)),
      renewalReferralBonus: Number(payload.bonusPolicy?.renewalReferralBonus || payload.renewalReferralBonus || splitBonus),
      renewalPlacementBonus: Number(payload.bonusPolicy?.renewalPlacementBonus || payload.renewalPlacementBonus || splitBonus),
      qualificationRequired: 2,
      freezeDays: Number(payload.bonusPolicy?.freezeDays || payload.freezeDays || 14)
    };
  },

  normalizeSide(side) {
    const value = String(side || '').toLowerCase();
    if (value === 'left' || value === 'l' || value === '左') return 'left';
    if (value === 'right' || value === 'r' || value === '右') return 'right';
    return '';
  },

  isIndependent(profile = {}) {
    if (profile.isIndependent === true || profile.independent === true) return true;
    if (profile.independentAt || profile.independenceAt) return true;
    if (String(profile.qualificationStatus || '').toLowerCase() === 'independent') return true;
    const leftDone = !!(profile.qualificationLeftMemberId || profile.leftQualifiedMemberId || profile.leftQualified);
    const rightDone = !!(profile.qualificationRightMemberId || profile.rightQualifiedMemberId || profile.rightQualified);
    if (leftDone && rightDone) return true;
    return Number(profile.qualificationCount || profile.qualifiedCount || 0) >= 2;
  },

  getRecruiterProfile(payload = {}) {
    return {
      ...(payload.recruiter || {}),
      isIndependent: payload.recruiterIsIndependent ?? payload.isRecruiterIndependent,
      independentAt: payload.recruiterIndependentAt,
      qualificationCount: payload.recruiterQualificationCount,
      qualificationLeftMemberId: payload.recruiterQualificationLeftMemberId,
      qualificationRightMemberId: payload.recruiterQualificationRightMemberId
    };
  },

  resolveRecruiterId(payload = {}) {
    return payload.recruiterId || payload.sponsorId || payload.referrerId || payload.introducerId || payload.recommenderId || '';
  },

  resolveRecruiterSponsorId(payload = {}) {
    return payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || payload.uplineSponsorId || '';
  },

  addTransaction(plan, item) {
    if (!item.memberId || Number(item.amount || 0) <= 0) return;
    const idSuffix = plan.transactions.length + 1;
    plan.transactions.push({
      transactionId: item.transactionId || `${plan.orderId}-${String(idSuffix).padStart(2, '0')}`,
      orderId: plan.orderId,
      memberId: item.memberId,
      sourceMemberId: plan.sourceMemberId,
      bonusType: item.bonusType,
      amount: Number(item.amount),
      currency: plan.currency,
      status: 'pending',
      freezeUntil: plan.freezeUntil,
      note: item.note || ''
    });
  },

  getEventTime(payload = {}) {
    const raw = payload.paidAt || payload.createdAt || Date.now();
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  },

  buildPlan(payload = {}) {
    const policy = this.getPolicy(payload);
    const now = this.getEventTime(payload);
    const freezeUntil = new Date(now.getTime() + policy.freezeDays * 24 * 60 * 60 * 1000).toISOString();
    const orderType = payload.orderType || 'tenant_annual_fee';
    const orderId = payload.orderId || '';
    const buyerId = payload.buyerId || payload.tenantId || payload.userId || '';
    const recruiterId = this.resolveRecruiterId(payload);
    const recruiterSponsorId = this.resolveRecruiterSponsorId(payload);
    const placementParentId = payload.placementParentId || payload.placementOwnerId || payload.parentId || '';
    const placementSide = this.normalizeSide(payload.placementSide || payload.qualificationSide);
    const recruiterProfile = this.getRecruiterProfile(payload);
    const recruiterIndependent = this.isIndependent(recruiterProfile);
    const plan = {
      policyType: policy.type,
      orderId,
      orderType,
      sourceMemberId: buyerId,
      currency: payload.currency || 'TWD',
      status: 'pending',
      freezeDays: policy.freezeDays,
      freezeUntil,
      policy,
      relationships: {
        recruiterId,
        recruiterSponsorId,
        placementParentId,
        placementSide
      },
      qualificationUpdate: null,
      transactions: [],
      warnings: []
    };

    if (!orderId) plan.warnings.push('missing_order_id');
    if (!buyerId) plan.warnings.push('missing_buyer_id');

    if (orderType === 'tenant_renewal_fee') {
      if (recruiterId) {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'renewal_referral',
          amount: policy.renewalReferralBonus,
          note: '年度續約：直接推薦獎金'
        });
      } else {
        plan.warnings.push('missing_recruiter_for_renewal');
      }

      if (placementParentId) {
        this.addTransaction(plan, {
          memberId: placementParentId,
          bonusType: 'renewal_placement',
          amount: policy.renewalPlacementBonus,
          note: '年度續約：當下安置獎金'
        });
      } else {
        plan.warnings.push('missing_placement_parent_for_renewal');
      }
    } else {
      if (!recruiterId) {
        plan.warnings.push('missing_recruiter');
      } else if (recruiterIndependent) {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'direct_full',
          amount: policy.directFullBonus,
          note: '推薦人已獨立，取得全額 BV'
        });
      } else {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'direct_split',
          amount: policy.directSplitBonus,
          note: '推薦人未獨立，推薦人取得半額'
        });

        if (recruiterSponsorId) {
          this.addTransaction(plan, {
            memberId: recruiterSponsorId,
            bonusType: 'sponsor_split',
            amount: policy.sponsorSplitBonus,
            note: '推薦人未獨立，上線取得半額'
          });
        } else {
          plan.warnings.push('missing_recruiter_sponsor');
        }

        plan.qualificationUpdate = {
          ownerId: recruiterId,
          sourceMemberId: buyerId,
          side: placementSide,
          requiredCount: policy.qualificationRequired,
          countsTowardIndependence: true,
          completesIndependence: this.wouldCompleteIndependence(recruiterProfile, placementSide)
        };
        if (!placementSide) plan.warnings.push('missing_qualification_side');
      }
    }

    if (plan.warnings.length) plan.status = 'review_required';
    return plan;
  },

  wouldCompleteIndependence(profile = {}, side = '') {
    const normalizedSide = this.normalizeSide(side);
    const leftDone = !!(profile.qualificationLeftMemberId || profile.leftQualifiedMemberId || profile.leftQualified);
    const rightDone = !!(profile.qualificationRightMemberId || profile.rightQualifiedMemberId || profile.rightQualified);
    if (this.isIndependent(profile)) return false;
    if (normalizedSide === 'left') return rightDone;
    if (normalizedSide === 'right') return leftDone;
    return Number(profile.qualificationCount || profile.qualifiedCount || 0) >= 1;
  },

  preview(payload = {}) {
    return { success: true, data: this.buildPlan(payload) };
  },

  buildTreeQuery(payload = {}) {
    return {
      memberId: payload.memberId || payload.userId || '',
      treeType: payload.treeType || 'placement',
      depth: Math.min(10, Math.max(1, Number(payload.depth || 3))),
      includeBonusSummary: payload.includeBonusSummary !== false,
      includeQualification: true,
      policyType: BONUS_POLICY_TYPE
    };
  }
};

const TenantOrderModule = {
  async createTenantBonusOrder(payload, env) {
    const now = new Date().toISOString();
    const order = {
      orderId: payload.orderId || 'TEN-' + Date.now().toString() + Math.random().toString(36).substring(2, 6).toUpperCase(),
      tenantId: payload.tenantId || payload.userId || '',
      tenantName: payload.tenantName || '',
      networkId: payload.networkId || 'admin',
      productName: payload.productName || '租戶年費',
      fee: Number(payload.fee || payload.price || 6300),
      price: Number(payload.price || payload.fee || 6300),
      bv: Number(payload.bv || 3000),
      taxIncluded: payload.taxIncluded !== false,
      taxRate: Number(payload.taxRate || 5),
      status: payload.status || 'pending_payment',
      paymentProvider: payload.paymentProvider || 'manual',
      paymentNo: payload.paymentNo || '',
      sponsorId: payload.sponsorId || payload.recruiterId || payload.referrerId || '',
      recruiterId: payload.recruiterId || payload.sponsorId || payload.referrerId || '',
      recruiterSponsorId: payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || '',
      placementParentId: payload.placementParentId || payload.placementOwnerId || payload.parentId || '',
      placementSide: BonusPolicyModule.normalizeSide(payload.placementSide || payload.qualificationSide),
      bonusPolicyType: BONUS_POLICY_TYPE,
      createdAt: now,
      updatedAt: now
    };

    const result = await DBModule.forward('createTenantBonusOrder', order, env);
    return result && result.success !== false ? result : { success: true, data: order };
  },

  async markTenantOrderPaid(payload, env) {
    const now = new Date().toISOString();
    const paidPayload = {
      ...payload,
      status: 'paid',
      paidAt: payload.paidAt || now,
      updatedAt: now,
      triggerBonus: true,
      freezeDays: payload.bonusPolicy?.freezeDays || 14
    };
    return await DBModule.forward('markTenantOrderPaid', paidPayload, env);
  },

  async cancelTenantBonusOrder(payload, env) {
    return await DBModule.forward('cancelTenantBonusOrder', {
      ...payload,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    }, env);
  }
};

const MLMModule = {
  normalizeOrder(payload) {
    const now = new Date().toISOString();
    const grossAmount = Number(payload.grossAmount || payload.price || payload.fee || payload.amount || 0);
    const taxRate = Number(payload.taxRate || 5);
    const netAmount = payload.netAmount !== undefined
      ? Number(payload.netAmount)
      : Math.round(grossAmount / (1 + taxRate / 100));

    return {
      orderId: payload.orderId || 'ORD-' + Date.now().toString() + Math.random().toString(36).substring(2, 8).toUpperCase(),
      orderType: payload.orderType || 'tenant_annual_fee',
      buyerId: payload.buyerId || payload.tenantId || payload.userId || '',
      buyerName: payload.buyerName || payload.tenantName || '',
      networkId: payload.networkId || 'admin',
      productCode: payload.productCode || 'TENANT_ANNUAL',
      productName: payload.productName || '租戶年費',
      grossAmount,
      netAmount,
      taxAmount: Math.max(0, grossAmount - netAmount),
      taxRate,
      bv: Number(payload.bv || payload.bonusBV || 3000),
      currency: payload.currency || 'TWD',
      paymentStatus: payload.paymentStatus || payload.status || 'pending_payment',
      paymentProvider: payload.paymentProvider || 'manual',
      paymentNo: payload.paymentNo || payload.tradeNo || '',
      bonusStatus: payload.bonusStatus || 'not_generated',
      bonusPolicyType: payload.bonusPolicyType || payload.bonusPolicy?.type || BONUS_POLICY_TYPE,
      sponsorId: payload.sponsorId || payload.recruiterId || payload.referrerId || '',
      recruiterId: payload.recruiterId || payload.sponsorId || payload.referrerId || '',
      recruiterSponsorId: payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || '',
      placementParentId: payload.placementParentId || payload.placementOwnerId || payload.parentId || '',
      placementSide: BonusPolicyModule.normalizeSide(payload.placementSide || payload.qualificationSide),
      qualificationSide: BonusPolicyModule.normalizeSide(payload.qualificationSide || payload.placementSide),
      recruiterIsIndependent: payload.recruiterIsIndependent ?? payload.isRecruiterIndependent ?? false,
      recruiterIndependentAt: payload.recruiterIndependentAt || '',
      recruiterQualificationCount: Number(payload.recruiterQualificationCount || 0),
      recruiterQualificationLeftMemberId: payload.recruiterQualificationLeftMemberId || '',
      recruiterQualificationRightMemberId: payload.recruiterQualificationRightMemberId || '',
      createdAt: payload.createdAt || now,
      updatedAt: now,
      source: payload.source || 'admin'
    };
  },

  async createOrder(payload, env) {
    const order = this.normalizeOrder(payload);
    if (!order.buyerId) return { success: false, error: 'Missing buyerId' };
    if (order.grossAmount <= 0 || order.bv < 0) return { success: false, error: 'Invalid order amount or BV' };

    const key = `ORDER_LOCK_${order.orderId}`;
    if (env.ACTMASTER_KV) {
      const exists = await env.ACTMASTER_KV.get(key);
      if (exists) return { success: false, error: 'Duplicate orderId' };
      await env.ACTMASTER_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    }

    return await DBModule.forward('mlmCreateOrder', {
      ...order,
      bonusPlanPreview: BonusPolicyModule.buildPlan(order)
    }, env);
  },

  async markOrderPaid(payload, env) {
    const orderId = payload.orderId || '';
    const paymentNo = payload.paymentNo || payload.tradeNo || '';
    if (!orderId) return { success: false, error: 'Missing orderId' };

    if (paymentNo && env.ACTMASTER_KV) {
      const paymentKey = `PAYMENT_LOCK_${payload.paymentProvider || 'manual'}_${paymentNo}`;
      const existing = await env.ACTMASTER_KV.get(paymentKey);
      if (existing) {
        return { success: true, data: { skipped: true, reason: 'duplicate_payment_callback' } };
      }
      await env.ACTMASTER_KV.put(paymentKey, orderId, { expirationTtl: 60 * 60 * 24 * 365 });
    }

    const planInput = {
      ...payload,
      orderId,
      paidAt: payload.paidAt || new Date().toISOString()
    };
    const bonusPlan = BonusPolicyModule.buildPlan(planInput);
    const paidPayload = {
      ...payload,
      paymentStatus: 'paid',
      status: 'paid',
      paidAt: planInput.paidAt,
      triggerBonus: payload.triggerBonus !== false,
      freezeDays: Number(payload.freezeDays || payload.bonusPolicy?.freezeDays || 14),
      bonusPolicy: {
        type: BONUS_POLICY_TYPE,
        directFullBonus: Number(payload.bonusPolicy?.directFullBonus || payload.bonusPolicy?.independentBonus || payload.bv || 3000),
        directSplitBonus: Number(payload.bonusPolicy?.directSplitBonus || payload.bonusPolicy?.splitBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        sponsorSplitBonus: Number(payload.bonusPolicy?.sponsorSplitBonus || Math.ceil(Number(payload.bv || 3000) / 2)),
        renewalReferralBonus: Number(payload.bonusPolicy?.renewalReferralBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        renewalPlacementBonus: Number(payload.bonusPolicy?.renewalPlacementBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        qualificationRequired: 2,
        freezeDays: Number(payload.bonusPolicy?.freezeDays || payload.freezeDays || 14)
      },
      bonusPolicyType: BONUS_POLICY_TYPE,
      bonusPlan,
      bonusStatus: payload.triggerBonus === false ? 'not_generated' : bonusPlan.status,
      updatedAt: new Date().toISOString()
    };

    return await DBModule.forward('mlmMarkOrderPaid', paidPayload, env);
  },

  async cancelOrder(payload, env) {
    if (!payload.orderId) return { success: false, error: 'Missing orderId' };
    return await DBModule.forward('mlmCancelOrder', {
      ...payload,
      paymentStatus: 'cancelled',
      status: 'cancelled',
      bonusStatus: 'cancelled',
      updatedAt: new Date().toISOString()
    }, env);
  },

  async refundOrder(payload, env) {
    if (!payload.orderId) return { success: false, error: 'Missing orderId' };
    return await DBModule.forward('mlmRefundOrder', {
      ...payload,
      paymentStatus: 'refunded',
      status: 'refunded',
      reversalRequired: true,
      updatedAt: new Date().toISOString()
    }, env);
  },

  async listOrders(payload, env) {
    return await DBModule.forward('mlmListOrders', {
      page: Number(payload.page || 1),
      pageSize: Math.min(100, Number(payload.pageSize || 20)),
      status: payload.status || 'all',
      keyword: payload.keyword || '',
      buyerId: payload.buyerId || '',
      networkId: payload.networkId || '',
      orderType: payload.orderType || '',
      bonusPolicyType: payload.bonusPolicyType || ''
    }, env);
  },

  async listBonusTransactions(payload, env) {
    return await DBModule.forward('mlmListBonusTransactions', {
      page: Number(payload.page || 1),
      pageSize: Math.min(100, Number(payload.pageSize || 20)),
      status: payload.status || 'all',
      memberId: payload.memberId || '',
      batchId: payload.batchId || ''
    }, env);
  },

  async createSettlementBatch(payload, env) {
    return await DBModule.forward('mlmCreateSettlementBatch', {
      batchId: payload.batchId || 'BAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      periodStart: payload.periodStart || '',
      periodEnd: payload.periodEnd || '',
      status: 'draft',
      createdBy: payload.operatorId || payload.userId || '',
      createdAt: new Date().toISOString()
    }, env);
  },

  async lockSettlementBatch(payload, env) {
    if (!payload.batchId) return { success: false, error: 'Missing batchId' };
    return await DBModule.forward('mlmLockSettlementBatch', {
      ...payload,
      status: 'locked',
      lockedAt: new Date().toISOString()
    }, env);
  },

  async getMemberTree(payload, env) {
    return await DBModule.forward('mlmGetMemberTree', BonusPolicyModule.buildTreeQuery(payload), env);
  },

  async previewBonusPlan(payload, env) {
    return BonusPolicyModule.preview(payload);
  },

  async getOrganizationTree(payload, env) {
    const query = BonusPolicyModule.buildTreeQuery(payload);
    const result = await DBModule.forward('mlmGetOrganizationTree', query, env);
    if (result && result.success !== false) return result;
    return await DBModule.forward('mlmGetMemberTree', query, env);
  }
};

// ==================== 請求分發器 (Action Dispatcher) ====================
async function dispatchAction(action, payload, request, env) {
  // 1. 資安防護：LIFF Token 驗證 (過渡相容模式)
  if (payload.userId) {
    const token = payload.lineAccessToken || request.headers.get('Authorization')?.replace('Bearer ', '');
    if (token) {
      // 若前端有傳 Token，則嚴格驗證是否被偽造
      const isValid = await SecurityModule.verifyLineAuth(payload.userId, token, env);
      if (!isValid) {
        return { success: false, error: "Access Denied: Invalid or Expired LINE Token" };
      }
    } else {
      // 【過渡期處理】若前端程式還沒更新傳送 Token，暫時放行非高敏感操作，讓舊系統能登入
      const strictActions = ['updateUserRole', 'adminSyncBoundCardUser', 'mlmCreateOrder', 'mlmMarkOrderPaid', 'mlmCancelOrder', 'mlmRefundOrder', 'mlmCreateSettlementBatch', 'mlmLockSettlementBatch'];
      if (strictActions.includes(action)) {
        return { success: false, error: "Access Denied: Missing LINE Token for sensitive action" };
      }
    }
  }

  // 2. 資安防護：OpenAI 限流機制
  const aiActions = ['recognizeCardWithGPT4o', 'matchmakeContacts', 'calculateFateTags', 'reviewCardSafety', 'generateCardCopy'];
  if (aiActions.includes(action) && payload.userId) {
    const allowed = await SecurityModule.checkRateLimit(payload.userId, action, env, payload.role);
    if (!allowed) {
      return { success: false, error: "Daily AI quota exceeded for this action. Please try again tomorrow." };
    }
  }

  // 格式校正沙盒
  const writeActions = ['registerUser', 'updateUserProfile', 'saveCard', 'updateCard'];
  if (writeActions.includes(action)) {
    const data = payload.data || payload;
    ['手機', '手機號碼', '公司電話', '統一編號', '傳真'].forEach(k => {
      if (data[k]) data[k] = Utils.formatPhone(data[k]);
    });
  }

  switch (action) {
    case 'checkUser':              return await AuthModule.check(payload, env);
    case 'getAllUsers':            return await AuthModule.getAllUsersWithBoundCards(payload, env);
    case 'registerUser':           
    case 'updateUserProfile':      
    case 'updateUserRole':         return await AuthModule.updateAndClearCache(action, payload, env);
    case 'adminSyncBoundCardUser': return await AuthModule.adminSyncBoundCardUser(payload, env);
    
    case 'recognizeCardWithGPT4o': return await AIModule.recognize(payload, env);
    case 'matchmakeContacts':      return await AIModule.matchmaking(payload, env);
    case 'calculateFateTags':      return await AIModule.fateTags(payload, env);
    case 'reviewCardSafety':       return await AIModule.reviewCardSafety(payload, env);
    case 'generateCardCopy':       return await AIModule.generateCardCopy(payload, env);
    case 'recordShareCardVisit':   return await TrackingModule.recordShareCardVisit(payload, env);
    case 'createTenantBonusOrder': return await TenantOrderModule.createTenantBonusOrder(payload, env);
    case 'markTenantOrderPaid':    return await TenantOrderModule.markTenantOrderPaid(payload, env);
    case 'cancelTenantBonusOrder': return await TenantOrderModule.cancelTenantBonusOrder(payload, env);
    case 'mlmCreateOrder':         return await MLMModule.createOrder(payload, env);
    case 'mlmMarkOrderPaid':       return await MLMModule.markOrderPaid(payload, env);
    case 'mlmCancelOrder':         return await MLMModule.cancelOrder(payload, env);
    case 'mlmRefundOrder':         return await MLMModule.refundOrder(payload, env);
    case 'mlmListOrders':          return await MLMModule.listOrders(payload, env);
    case 'mlmListBonusTransactions': return await MLMModule.listBonusTransactions(payload, env);
    case 'mlmCreateSettlementBatch': return await MLMModule.createSettlementBatch(payload, env);
    case 'mlmLockSettlementBatch': return await MLMModule.lockSettlementBatch(payload, env);
    case 'mlmGetMemberTree':       return await MLMModule.getMemberTree(payload, env);
    case 'mlmPreviewBonusPlan':     return await MLMModule.previewBonusPlan(payload, env);
    case 'mlmGetOrganizationTree':  return await MLMModule.getOrganizationTree(payload, env);
    case 'buildFlexMessage':       return { success: true, data: MessagingModule.buildFlex(payload) };
    case 'uploadImageToR2':        return { success: true, url: await StorageModule.upload(payload.base64Image, env) };
    default:                       return await DBModule.forward(action, payload, env);
  }
}

// ==================== 主入口 (Worker Entry) ====================
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }
    try {
      if (request.method !== 'POST') return Utils.jsonResponse({ status: "ACTMASTER API v6.0 Running with Edge Security (Compatibility Mode)" });
      const body = await request.json();
      const result = await dispatchAction(body.action, body.payload || {}, request, env);
      return Utils.jsonResponse(result);
    } catch (err) {
      return Utils.jsonResponse({ success: false, error: "Critical Error: " + err.message }, 500);
    }
  }
};
