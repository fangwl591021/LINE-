// Shared by OCR and researched copy; never applied to saved/manual descriptions.
export const CARD_COPY_STYLE = `名片介紹請寫成4到5行繁體中文短句，使用真正的換行分隔，每行一個重點，合計約60到120字、最多140字。第一行點出實際產品／服務，接著寫有依據的用途、服務特色或適合洽詢的需求，最後可用一句與該業務相關的自然邀請。可以美化語氣、使用生活情境與有溫度的表達，不要只是資料重述，也不要堆砌形容詞或把同一件事換句話說湊行數。保留完整產品名稱，不按固定字數硬切。不要重述姓名職稱，不要用電話、Email或「歡迎透過名片聯絡」湊文案。不得新增來源沒有的服務、客戶群、年資、證照、成就、優惠、成效或療效；邀請交流不等於承諾提供未確認的服務。
風格示例（僅示範，禁止挪用示例業務）：已知業務「法式冰淇淋、手工香腸」，可寫「法式冰淇淋與手工香腸，\n為日常餐桌帶來不同的味覺選擇。\n從想吃點甜的時刻，到準備一餐的靈感，\n歡迎聊聊你想了解的品項。」`;

export function isIdentityOnlyCopy(value) {
  const parts=String(value || '').trim().split(/[\n。！？]+/).filter(Boolean);
  return parts.length>0&&parts.every(part=>/任職於|職務為|^(?:姓名|公司|職稱)[：:]/.test(part));
}

export function formatCardCopy(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!text || text.length > 160 || isIdentityOnlyCopy(text)) return '';
  let lines = text.split('\n').map(line => line.replace(/^[\s•●・\-*]+/, '').replace(/^\d+[.)、]\s*/, '').trim()).filter(Boolean);
  if (lines.length < 4) lines = lines.flatMap(line => line.match(/[^。！？；]+[。！？；]?/gu) || []);
  // Recover missing line breaks at existing clause boundaries only, never
  // invent text, split a product name, or silently truncate a long paragraph.
  while (lines.length < 4) {
    const index = lines.reduce((best, line, i) => /[，：].+/.test(line) && (best < 0 || line.length > lines[best].length) ? i : best, -1);
    if (index < 0) break;
    const line = lines[index], split = line.search(/[，：]/) + 1;
    lines.splice(index, 1, line.slice(0, split), line.slice(split));
  }
  lines = lines.map(line => line.trim()).filter(Boolean);
  if (lines.length < 4 || lines.length > 5 || lines.join('').length > 140) return '';
  return lines.join('\n');
}
