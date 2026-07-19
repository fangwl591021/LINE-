(function() {
  const SHOP_DATA_URL = 'data/platform-shop-products.json?v=1';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeProduct(raw) {
    return {
      productId: String(raw.productId || raw.id || '').trim(),
      sku: String(raw.sku || '').trim(),
      title: String(raw.title || '未命名商品').trim(),
      subtitle: String(raw.subtitle || '').trim(),
      description: String(raw.description || '').trim(),
      imageUrl: String(raw.imageUrl || raw.image_url || '').trim(),
      category: String(raw.category || '平台商品').trim(),
      price: Math.max(0, toNumber(raw.price, 0)),
      pointRedeemType: String(raw.pointRedeemType || raw.point_redeem_type || 'none').trim(),
      pointRedeemValue: Math.max(0, toNumber(raw.pointRedeemValue ?? raw.point_redeem_value, 0)),
      pointRedeemCap: Math.max(0, toNumber(raw.pointRedeemCap ?? raw.point_redeem_cap, 0)),
      partnerStoreName: String(raw.partnerStoreName || raw.partner_store_name || '').trim(),
      fulfillmentType: String(raw.fulfillmentType || raw.fulfillment_type || 'platform').trim(),
      status: String(raw.status || 'draft').trim(),
      sortOrder: toNumber(raw.sortOrder ?? raw.sort_order, 9999)
    };
  }

  function formatMoney(value) {
    return `NT$${Math.max(0, Math.round(toNumber(value))).toLocaleString('zh-TW')}`;
  }

  function redemptionLabel(product) {
    const type = product.pointRedeemType;
    if (type === 'fixed') return `可折抵 ${Math.round(product.pointRedeemValue).toLocaleString('zh-TW')} 點`;
    if (type === 'percent') return `最高折抵 ${Math.round(product.pointRedeemValue)}%`;
    if (type === 'full') return '可全額點數折抵';
    return '不開放點數折抵';
  }

  function productImage(product) {
    if (product.imageUrl) {
      return `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" class="w-full h-full object-cover" loading="lazy">`;
    }
    return '<div class="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300"><span class="material-symbols-outlined text-[44px]">inventory_2</span></div>';
  }

  function renderProduct(product) {
    const partner = product.partnerStoreName ? `<span class="text-[11px] font-black text-slate-400">履約：${escapeHtml(product.partnerStoreName)}</span>` : '';
    const subtitle = product.subtitle ? `<p class="text-[13px] font-bold text-slate-500 mt-1">${escapeHtml(product.subtitle)}</p>` : '';
    const description = product.description ? `<p class="text-[12px] font-bold text-slate-400 mt-2 leading-relaxed line-clamp-2">${escapeHtml(product.description)}</p>` : '';

    return `
      <article class="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div class="aspect-[4/3] bg-slate-50">${productImage(product)}</div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="text-[11px] font-black text-emerald-600">${escapeHtml(product.category)}</span>
              <h4 class="text-[17px] font-black text-slate-800 mt-1 leading-tight">${escapeHtml(product.title)}</h4>
              ${subtitle}
            </div>
            <div class="shrink-0 text-right">
              <p class="text-[15px] font-black text-slate-800">${formatMoney(product.price)}</p>
              <p class="text-[11px] font-black text-emerald-600 mt-1">${escapeHtml(redemptionLabel(product))}</p>
            </div>
          </div>
          ${description}
          <div class="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
            ${partner || '<span class="text-[11px] font-black text-slate-300">平台出貨</span>'}
            <button type="button" class="px-4 py-2 rounded-2xl bg-slate-100 text-slate-400 text-[13px] font-black cursor-not-allowed" disabled>即將開放</button>
          </div>
        </div>
      </article>
    `;
  }

  window.loadPlatformShop = async function() {
    const listEl = document.getElementById('platform-shop-list');
    const emptyEl = document.getElementById('platform-shop-empty');
    const countEl = document.getElementById('platform-shop-count');
    const statusEl = document.getElementById('platform-shop-status');
    if (!listEl || !emptyEl || !countEl) return;

    listEl.innerHTML = '';
    emptyEl.classList.add('hidden');
    if (statusEl) statusEl.classList.add('hidden');
    countEl.textContent = '讀取中';

    try {
      const response = await fetch(SHOP_DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const products = Array.isArray(payload.products) ? payload.products.map(normalizeProduct) : [];
      const activeProducts = products
        .filter((product) => product.status === 'active')
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-Hant'));

      countEl.textContent = `${activeProducts.length} 件`;
      if (!activeProducts.length) {
        emptyEl.classList.remove('hidden');
        return;
      }

      listEl.innerHTML = activeProducts.map(renderProduct).join('');
    } catch (error) {
      countEl.textContent = '讀取失敗';
      if (statusEl) {
        statusEl.textContent = '商城商品資料暫時無法讀取，請稍後再試。';
        statusEl.classList.remove('hidden');
      }
      console.warn('[platform-shop] catalog load failed', error);
    }
  };
})();