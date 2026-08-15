(() => {
  const queue = [];
  let active = false;

  const classify = (message, requested = '') => {
    if (requested) return requested;
    const text = String(message || '');
    if (/成功|完成|已儲存|已收藏|已贈送|已送出|已更新|已建立|已刪除|已停止/.test(text)) return 'success';
    if (/失敗|錯誤|無法|不能|不可|逾時|不存在|不足|異常/.test(text)) return 'error';
    if (/請|注意|提醒|確認|刪除|停止|取消/.test(text)) return 'warning';
    return 'info';
  };

  function ensureStyle() {
    if (document.getElementById('app-notify-style')) return;
    const style = document.createElement('style');
    style.id = 'app-notify-style';
    style.textContent = `
      .app-notify-layer{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.38);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
      .app-notify-card{width:min(328px,calc(100vw - 48px));overflow:hidden;border-radius:20px;background:#fff;box-shadow:0 18px 55px rgba(0,0,0,.22);font-family:system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif;text-align:center}
      .app-notify-body{padding:28px 24px 22px}
      .app-notify-icon{display:grid;place-items:center;width:54px;height:54px;margin:0 auto 16px;border-radius:50%;font-size:30px;font-weight:800}
      .app-notify-success .app-notify-icon{background:#07c160;color:#fff}
      .app-notify-error .app-notify-icon{background:#fa5151;color:#fff}
      .app-notify-warning .app-notify-icon{background:#ffc300;color:#fff}
      .app-notify-info .app-notify-icon{background:#f2f2f2;color:#576b95}
      .app-notify-title{margin:0;color:#111;font-size:20px;font-weight:700}
      .app-notify-message{margin:10px 0 0;color:#888;font-size:15px;line-height:1.65;white-space:pre-line;overflow-wrap:anywhere}
      .app-notify-input{box-sizing:border-box;width:100%;margin-top:16px;padding:12px 14px;border:1px solid #d9d9d9;border-radius:10px;background:#f7f7f7;font-size:16px;color:#111;outline:none}
      .app-notify-input:focus{border-color:#07c160;background:#fff;box-shadow:0 0 0 3px rgba(7,193,96,.10)}
      .app-notify-actions{display:flex;border-top:1px solid #ededed}
      .app-notify-button{flex:1;min-height:54px;border:0;background:#fff;color:#07c160;font-size:17px;font-weight:600;cursor:pointer}
      .app-notify-button+.app-notify-button{border-left:1px solid #ededed}
      .app-notify-button.secondary{color:#576b95}
      .app-notify-button.danger{color:#fa5151}
    `;
    document.head.append(style);
  }

  function iconFor(type) {
    if (type === 'success') return '✓';
    if (type === 'error' || type === 'warning') return '!';
    return 'i';
  }

  function enqueue(item) {
    return new Promise(resolve => {
      queue.push({ ...item, resolve });
      renderNext();
    });
  }

  function renderNext() {
    if (active || !queue.length) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', renderNext, { once: true });
      return;
    }

    active = true;
    ensureStyle();
    const item = queue.shift();
    const type = classify(item.message, item.type);

    const layer = document.createElement('div');
    layer.className = `app-notify-layer app-notify-${type}`;
    layer.setAttribute('role', 'presentation');

    const card = document.createElement('section');
    card.className = 'app-notify-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    const body = document.createElement('div');
    body.className = 'app-notify-body';

    const icon = document.createElement('div');
    icon.className = 'app-notify-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconFor(type);

    const title = document.createElement('h2');
    title.className = 'app-notify-title';
    title.textContent = item.title || ({ success:'操作完成', error:'操作未完成', warning:'請確認', info:'系統通知' }[type]);

    const message = document.createElement('p');
    message.className = 'app-notify-message';
    message.textContent = String(item.message ?? '');

    const actions = document.createElement('div');
    actions.className = 'app-notify-actions';
    let input = null;

    if (item.kind === 'prompt') {
      input = document.createElement('input');
      input.className = 'app-notify-input';
      input.value = String(item.defaultValue ?? '');
      input.placeholder = item.placeholder || '';
      input.autocomplete = item.autocomplete || 'off';
    }

    const finish = value => {
      document.removeEventListener('keydown', onKeyDown, true);
      layer.remove();
      active = false;
      item.resolve(value);
      queueMicrotask(renderNext);
    };

    const onKeyDown = event => {
      if (event.key === 'Escape' && (item.kind === 'confirm' || item.kind === 'prompt')) {
        event.preventDefault();
        finish(item.kind === 'prompt' ? null : false);
      }
      if (event.key === 'Enter' && item.kind === 'prompt' && document.activeElement === input) {
        event.preventDefault();
        finish(input?.value ?? '');
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    if (item.kind === 'confirm' || item.kind === 'prompt') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'app-notify-button secondary';
      cancel.textContent = item.cancelText || '取消';
      cancel.onclick = () => finish(item.kind === 'prompt' ? null : false);
      actions.append(cancel);
    }

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = `app-notify-button${item.danger ? ' danger' : ''}`;
    ok.textContent = item.okText || '確定';
    ok.onclick = () => finish(item.kind === 'prompt' ? (input?.value ?? '') : true);
    actions.append(ok);

    body.append(icon, title, message);
    if (input) body.append(input);
    card.append(body, actions);
    layer.append(card);
    document.body.append(layer);

    requestAnimationFrame(() => {
      if (input) input.focus();
      else ok.focus();
    });
  }

  window.appNotice = (message, options = {}) => enqueue({ kind:'alert', message, ...options });
  window.appConfirm = (message, options = {}) => enqueue({ kind:'confirm', message, ...options });
  window.appPrompt = (message, defaultValue = '', options = {}) => enqueue({ kind:'prompt', message, defaultValue, ...options });

  // 舊 alert 全域轉入 App 內通知；confirm / prompt 不覆寫，呼叫點必須逐一 async 移植。
  window.alert = message => { void window.appNotice(message); };
})();
