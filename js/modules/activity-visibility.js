(function () {
  'use strict';
  let pending = null;
  // Explicit yes/no/cancel. Closing never means "private" and never writes an activity.
  window.chooseActivityVisibility = function ({ current, signal, isCurrent = () => true } = {}) {
    const valid = () => { try { return isCurrent(); } catch (_) { return false; } };
    if (pending || signal?.aborted || !valid()) return Promise.resolve(null);
    return new Promise(resolve => {
      const opener = document.activeElement;
      const dialog = document.createElement('dialog');
      dialog.className = 'activity-visibility-dialog';
      dialog.setAttribute('aria-labelledby', 'activity-visibility-title');
      dialog.innerHTML = '<header><h2 id="activity-visibility-title">是否公開這個活動？</h2><button type="button" data-cancel aria-label="關閉公開範圍選擇">×</button></header>' +
        '<p>請選擇活動發布後的可見範圍。</p><p data-current class="av-current"></p>' +
        '<button type="button" data-scope="platform" class="av-public"><strong>是，公開到全平台</strong><span>所有登入的平台會員都能查看、報名</span></button>' +
        '<button type="button" data-scope="network" class="av-network"><strong>否，僅歸屬可見</strong><span>僅同歸屬網的會員可以查看、報名</span></button>' +
        '<p class="av-note">只調整活動可見範圍，不改變會員歸屬或主辦人的管理權限。</p>' +
        '<button type="button" data-cancel class="av-cancel">取消，返回修改</button>';
      dialog.querySelector('[data-current]').textContent = current === 'platform' ? '目前：全平台公開' : current === 'network' ? '目前：僅歸屬可見' : '';
      let finished = false;
      const finish = value => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', cancel);
        window.removeEventListener('pagehide', cancel);
        document.removeEventListener('visibilitychange', hidden);
        const result = value && valid() ? value : null;
        dialog.close(); dialog.remove(); pending = null;
        if (opener?.isConnected) opener.focus({preventScroll:true});
        resolve(result);
      };
      const cancel = () => finish(null);
      const hidden = () => { if (document.hidden) cancel(); };
      pending = dialog;
      dialog.querySelectorAll('[data-scope]').forEach(button => { button.onclick = () => finish(button.dataset.scope); });
      dialog.querySelectorAll('[data-cancel]').forEach(button => { button.onclick = cancel; });
      dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
      dialog.addEventListener('close', cancel);
      signal?.addEventListener('abort', cancel, {once:true});
      window.addEventListener('pagehide', cancel, {once:true});
      document.addEventListener('visibilitychange', hidden);
      document.body.append(dialog); dialog.showModal();
    });
  };
})();
