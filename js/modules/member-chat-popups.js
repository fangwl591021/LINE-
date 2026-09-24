const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { normalizeLineContact } from './member-chat-line-contact.js?v=1';
const date = value => {
  if (!value) return '未設定';
  const stamp = new Date(value);
  return Number.isFinite(stamp.getTime()) ? stamp.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '請洽發券者';
};
const safeLink = value => {
  const raw = String(value || '');
  if (/^tel:\+?[0-9#*(),. -]{5,40}$/i.test(raw) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw)) return raw;
  try { const url = new URL(raw); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};

export function createChatPopups({ client, getGuard }) {
  const opened = new Set();
  function open(title) {
    const guard = getGuard(), opener = document.activeElement, modal = document.createElement('dialog');
    modal.className = 'member-chat mc-popup';
    modal.setAttribute('aria-label', title);
    modal.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" aria-label="關閉彈窗">關閉 ×</button></header><div class="mc-popup-body">讀取中…</div>`;
    const close = () => { opened.delete(close); modal.close(); modal.remove(); opener?.focus?.(); };
    opened.add(close);
    modal.querySelector('header button').onclick = close;
    modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
    modal.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    document.body.append(modal); modal.showModal();
    return { body: modal.querySelector('.mc-popup-body'), close, valid: () => modal.open && client.current() && guard() };
  }
  return {
    close() { for (const close of [...opened]) close(); },
    async editLineContact(saved) {
      const popup = open('我的 LINE 加好友設定');
      async function load() {
        popup.body.textContent = '讀取中…';
        try {
          const result = await client.request('/line-contact'); if (!popup.valid()) return;
          popup.body.innerHTML = `<form class="mc-line-form"><label for="mc-line-contact">私人 LINE ID 或 LINE 加好友網址</label><input id="mc-line-contact" type="text" maxlength="500" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="例如 my_line_id 或 https://line.me/ti/p/…" value="${esc(result.lineContact)}"><p>儲存後，聊天對方可點「加 LINE 好友」。建議貼上 LINE「我的 QR 碼」分享的連結；使用 ID 時，請開啟允許利用 ID 加入好友。留白儲存可移除。</p><p>這是加好友資料，不是通知收件設定。手機提醒請另外勾選「LINE通知」。</p><p role="status" aria-live="polite"></p><div><button type="button" data-cancel>取消</button><button type="submit">儲存</button></div></form>`;
          const form = popup.body.querySelector('form'), input = form.querySelector('input'), status = form.querySelector('[role=status]'), button = form.querySelector('[type=submit]');
          form.querySelector('[data-cancel]').onclick = popup.close;
          form.onsubmit = async event => {
            event.preventDefault(); if (!popup.valid() || button.disabled) return;
            if (normalizeLineContact(input.value) === null) { status.textContent = '請填寫私人 LINE ID 或有效的 LINE 加好友網址（line.me／lin.ee）'; return; }
            button.disabled = true; status.textContent = '儲存中…';
            try {
              const data = await client.request('/line-contact', { lineContact: input.value });
              if (popup.valid()) { saved?.(data.lineContact); popup.close(); }
            } catch (error) { if (popup.valid()) { status.textContent = error.message; button.disabled = false; } }
          };
          input.focus();
        } catch (error) {
          if (!popup.valid()) return;
          popup.body.textContent = error.message;
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新讀取'; retry.onclick = load; popup.body.append(retry);
        }
      }
      await load();
    },
    async lineContact(room) {
      const popup = open('加 LINE 好友');
      try {
        const result = await client.request(`/threads/${room}/line-contact`); if (!popup.valid()) return;
        const link = normalizeLineContact(result.lineContact);
        popup.body.innerHTML = link ? `<p>以下是對方自行提供的 LINE 加好友連結。請確認 LINE 顯示的身分，再加入好友。</p><div class="mc-card-links"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">前往 LINE 加好友</a></div>` : '<p>對方尚未新增 LINE 加好友資料，您仍可在這裡傳送私訊。</p>';
      } catch (error) { if (popup.valid()) popup.body.textContent = error.message; }
    },
    async chooseCoupon(select) {
      const popup = open('附加內容・我的優惠券');
      let after = '', busy = false;
      popup.body.innerHTML = '<p>選擇自己刊登的有效優惠券，按「傳送」才會送出。</p><div data-options></div><p role="status"></p><button type="button" data-more>讀取優惠券</button>';
      const options = popup.body.querySelector('[data-options]'), status = popup.body.querySelector('[role=status]'), more = popup.body.querySelector('[data-more]');
      async function load() {
        if (busy || !popup.valid()) return;
        busy = true; more.disabled = true; status.textContent = '讀取中…';
        try {
          const result = await client.request('/coupons?after=' + encodeURIComponent(after)); if (!popup.valid()) return;
          for (const row of result.items) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'mc-coupon-option';
            button.innerHTML = `<strong>${esc(row.title)}</strong><small>優惠券期限：${esc(date(row.expiresAt))}</small>`;
            button.onclick = () => { if (popup.valid()) { select(row); popup.close(); } }; options.append(button);
          }
          after = result.next; more.hidden = !after; more.textContent = '載入更多';
          status.textContent = options.children.length ? '' : '目前沒有可附加的優惠券，請先在交流內容附加優惠券並刊登。';
        } catch (error) { if (popup.valid()) { status.textContent = error.message; more.textContent = '重新讀取'; } }
        finally { busy = false; if (popup.valid()) more.disabled = false; }
      }
      more.onclick = load; await load();
    },
    async card(room) {
      const popup = open('對方名片');
      try {
        const { card } = await client.request(`/threads/${room}/card`); if (!popup.valid()) return;
        const image = safeLink(card.imageUrl);
        popup.body.innerHTML = `${image.startsWith('https:') ? `<img class="mc-card-image" src="${esc(image)}" alt="對方名片" referrerpolicy="no-referrer">` : ''}<h3>${esc(card.name)}</h3><p>${esc([card.companyName, card.department, card.title].filter(Boolean).join(' · '))}</p><p class="mc-prewrap">${esc(card.description || card.services)}</p><div class="mc-card-links">${(card.buttons || []).map(button => {
          const href = safeLink(button.url); return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(button.label)}</a>` : '';
        }).join('')}</div>`;
      } catch (error) { if (popup.valid()) popup.body.textContent = error.message; }
    },
    async coupon(room, seq) {
      const popup = open('優惠券');
      const path = `/threads/${room}/coupon?seq=${encodeURIComponent(seq)}`;
      function render(coupon, message = '') {
        popup.body.innerHTML = `<h3>${esc(coupon.title)}</h3><p class="mc-prewrap">${esc(coupon.description)}</p><p class="mc-prewrap">${esc(coupon.terms)}</p><p>優惠券期限：${esc(date(coupon.expiresAt))}</p><p role="status">${esc(message || (coupon.isOwner ? '您是發券者，不能核銷自己的優惠券。' : coupon.viewerRedeemed ? '已核銷，不能重複使用。' : coupon.status === 'expired' ? '優惠券已過期。' : '每位會員只能核銷一次，請至現場由業者確認後使用。'))}</p>${coupon.canRedeem ? '<button type="button" data-redeem>現場使用優惠券</button><div data-confirm hidden><p>請先向業者出示，確認核銷後無法復原。</p><button type="button" data-confirm-redeem>確認核銷</button><button type="button" data-cancel>取消</button></div>' : ''}`;
        if (!coupon.canRedeem) return;
        const start = popup.body.querySelector('[data-redeem]'), confirm = popup.body.querySelector('[data-confirm]'), button = popup.body.querySelector('[data-confirm-redeem]');
        start.onclick = () => { start.hidden = true; confirm.hidden = false; };
        popup.body.querySelector('[data-cancel]').onclick = () => { start.hidden = false; confirm.hidden = true; };
        button.onclick = async () => {
          if (!popup.valid() || button.disabled) return;
          button.disabled = true;
          try {
            const result = await client.request(path, {}); if (popup.valid()) render(result.coupon, result.duplicate ? '已確認：此券先前已核銷。' : '核銷成功。');
          } catch (error) { if (popup.valid()) { popup.body.querySelector('[role=status]').textContent = error.message; button.textContent = '重新確認核銷'; button.disabled = false; } }
        };
      }
      try { const result = await client.request(path); if (popup.valid()) render(result.coupon); }
      catch (error) { if (popup.valid()) popup.body.textContent = error.message; }
    }
  };
}
