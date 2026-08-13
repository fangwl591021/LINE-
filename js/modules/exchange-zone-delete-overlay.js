(function() {
  let currentPostHandle = '';
  let busy = false;
  const originalOpen = window.openExchangeZonePost;
  if (typeof originalOpen === 'function') {
    window.openExchangeZonePost = function(postHandle, trigger) {
      currentPostHandle = String(postHandle || '').trim();
      return originalOpen.call(this, postHandle, trigger);
    };
  }

  function safeHttpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function cleanDetectedUrl(value) {
    return String(value || '').replace(/[)\]}>，。！？、；;:,.!?]+$/g, '');
  }

  function firstHttpsUrl(value) {
    const match = String(value || '').match(/https:\/\/[^\s<>"']+/i);
    return safeHttpsUrl(cleanDetectedUrl(match?.[0] || ''));
  }

  function youtubeVideoId(value) {
    const href = safeHttpsUrl(value);
    if (!href) return '';
    try {
      const url = new URL(href);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      let candidate = '';
      if (host === 'youtu.be') {
        candidate = url.pathname.split('/').filter(Boolean)[0] || '';
      } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        if (url.pathname === '/watch') candidate = url.searchParams.get('v') || '';
        else {
          const parts = url.pathname.split('/').filter(Boolean);
          if (['shorts', 'embed', 'live'].includes(parts[0])) candidate = parts[1] || '';
        }
      }
      return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : '';
    } catch (error) {
      return '';
    }
  }

  function linkifyArticle(article) {
    if (!article || article.dataset.exchangeLinksEnhanced === '1') return;
    article.dataset.exchangeLinksEnhanced = '1';
    const source = article.textContent || '';
    const matcher = /https:\/\/[^\s<>"']+/gi;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    let match;
    while ((match = matcher.exec(source))) {
      if (match.index > offset) fragment.append(document.createTextNode(source.slice(offset, match.index)));
      const raw = match[0];
      const clean = cleanDetectedUrl(raw);
      const href = safeHttpsUrl(clean);
      if (href) {
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.className = 'font-black text-blue-700 underline decoration-blue-300 underline-offset-2 break-all';
        anchor.textContent = clean;
        fragment.append(anchor);
        if (raw.length > clean.length) fragment.append(document.createTextNode(raw.slice(clean.length)));
      } else {
        fragment.append(document.createTextNode(raw));
      }
      offset = match.index + raw.length;
    }
    if (offset < source.length) fragment.append(document.createTextNode(source.slice(offset)));
    article.replaceChildren(fragment);
  }

  function renderYouTubeEmbed(article, href, videoId) {
    if (!article || !videoId || article.parentElement?.querySelector('[data-exchange-youtube]')) return false;
    const section = document.createElement('section');
    section.dataset.exchangeYoutube = '1';
    section.className = 'mt-3 overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm';
    const frameWrap = document.createElement('div');
    frameWrap.className = 'relative w-full overflow-hidden bg-black';
    frameWrap.style.aspectRatio = '16 / 9';
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`;
    iframe.title = 'YouTube 影片';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.className = 'absolute inset-0 h-full w-full border-0';
    frameWrap.append(iframe);
    section.append(frameWrap);
    const footer = document.createElement('div');
    footer.className = 'flex items-center justify-between gap-3 px-4 py-3';
    const label = document.createElement('div');
    label.className = 'min-w-0';
    const title = document.createElement('p');
    title.className = 'text-[13px] font-black text-slate-800';
    title.textContent = 'YouTube 影片';
    const hint = document.createElement('p');
    hint.className = 'mt-0.5 text-[11px] font-bold text-slate-400';
    hint.textContent = '可直接在貼文內播放';
    label.append(title, hint);
    const open = document.createElement('a');
    open.href = href;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.className = 'shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-black text-red-600';
    open.textContent = '開啟 YouTube';
    footer.append(label, open);
    section.append(footer);
    article.insertAdjacentElement('afterend', section);
    return true;
  }

  function renderPreviewCard(article, preview) {
    if (!article || !preview || article.parentElement?.querySelector('[data-exchange-link-preview]')) return;
    const href = safeHttpsUrl(preview.url);
    if (!href) return;
    const card = document.createElement('a');
    card.href = href;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.dataset.exchangeLinkPreview = '1';
    card.className = 'mt-3 block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm active:scale-[0.995]';
    const imageUrl = safeHttpsUrl(preview.imageUrl);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.className = 'block h-40 w-full bg-slate-100 object-cover';
      image.addEventListener('error', () => image.remove(), { once: true });
      card.append(image);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'flex h-28 w-full items-center justify-center bg-slate-100 text-slate-400';
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined text-[38px]';
      icon.textContent = 'language';
      fallback.append(icon);
      card.append(fallback);
    }
    const body = document.createElement('div');
    body.className = 'p-4';
    const title = document.createElement('p');
    title.className = 'text-[15px] font-black leading-5 text-slate-800 line-clamp-2';
    title.textContent = String(preview.title || preview.siteName || preview.host || '開啟連結');
    body.append(title);
    if (preview.description) {
      const description = document.createElement('p');
      description.className = 'mt-1.5 text-[12px] font-bold leading-5 text-slate-500 line-clamp-2';
      description.textContent = String(preview.description);
      body.append(description);
    }
    const host = document.createElement('p');
    host.className = 'mt-2 text-[11px] font-black text-slate-400';
    host.textContent = String(preview.siteName || preview.host || new URL(href).hostname);
    body.append(host);
    card.append(body);
    article.insertAdjacentElement('afterend', card);
  }

  async function requestPreview(article) {
    if (!article || article.dataset.exchangePreviewRequested === '1') return;
    const url = firstHttpsUrl(article.textContent || '');
    if (!url) return;
    article.dataset.exchangePreviewRequested = '1';
    const videoId = youtubeVideoId(url);
    if (videoId && renderYouTubeEmbed(article, url, videoId)) return;
    try {
      const result = await window.fetchAPI('updateExchangeZonePost', { toggleLike: true, previewUrl: url }, true);
      if (result?.success !== true || !result?.preview) return;
      renderPreviewCard(article, result.preview);
    } catch (error) {
      console.warn('Exchange link preview skipped:', error?.message || error);
    }
  }

  function enhancePostLinks() {
    const content = document.getElementById('exchange-zone-drawer-content');
    if (!content || content.querySelector('#exchange-zone-compose-form')) return;
    const article = content.querySelector('article.whitespace-pre-wrap');
    if (!article) return;
    linkifyArticle(article);
    requestPreview(article);
  }

  function mountOwnerActions() {
    const edit = document.getElementById('exchange-zone-edit-button');
    if (!edit) return;
    let row = document.getElementById('exchange-zone-owner-actions');
    if (!row) {
      row = document.createElement('div');
      row.id = 'exchange-zone-owner-actions';
      row.className = 'mt-6 grid grid-cols-2 gap-3';
      edit.insertAdjacentElement('beforebegin', row);
      row.append(edit);
    }
    edit.className = 'min-h-14 rounded-2xl border border-blue-200 bg-blue-50 px-3 text-[16px] font-black text-blue-700 flex items-center justify-center gap-2 active:scale-[0.98]';
    if (document.getElementById('exchange-zone-archive-button')) return;
    const button = document.createElement('button');
    button.id = 'exchange-zone-archive-button';
    button.type = 'button';
    button.className = 'min-h-14 rounded-2xl border border-red-600 bg-red-600 px-3 text-[16px] font-black text-white flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50';
    button.innerHTML = '<span class="material-symbols-outlined text-[22px]">delete</span>刪除貼文';
    button.addEventListener('click', async () => {
      if (!currentPostHandle || busy) return;
      if (!window.confirm('確定要刪除這則貼文嗎？刪除後不再顯示，已扣點數不退回。')) return;
      busy = true;
      button.disabled = true;
      try {
        const result = await window.fetchAPI('updateExchangeZonePost', { postHandle: currentPostHandle, toggleLike: true, archivePost: true }, true);
        if (result?.success === false) throw new Error(result.error || '刪除失敗');
        window.showToast?.('貼文已刪除');
        window.closeExchangeZoneDrawer?.();
        await window.loadExchangeZone?.();
      } catch (error) {
        window.showToast?.(error?.message || '刪除失敗，請稍後再試', true);
      } finally {
        busy = false;
        button.disabled = false;
      }
    });
    row.append(button);
  }

  function mount() {
    mountOwnerActions();
    enhancePostLinks();
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
