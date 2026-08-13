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

  function mount() {
    const edit = document.getElementById('exchange-zone-edit-button');
    if (!edit || document.getElementById('exchange-zone-archive-button')) return;
    const button = document.createElement('button');
    button.id = 'exchange-zone-archive-button';
    button.type = 'button';
    button.className = 'mt-3 w-full min-h-13 rounded-2xl border border-red-200 bg-red-500 px-4 text-[15px] font-black text-white flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50';
    button.innerHTML = '<span class="material-symbols-outlined text-[20px]">delete</span>刪除貼文';
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
    edit.insertAdjacentElement('afterend', button);
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
