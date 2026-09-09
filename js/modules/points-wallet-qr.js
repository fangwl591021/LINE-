/* Display only. QR identity comes from the successful wallet query, never a token. */
(() => {
  let revision = 0;
  const button = () => document.getElementById('points-wallet-qr-button');
  const dialog = () => document.getElementById('points-wallet-qr-dialog');
  window.renderPointsWalletQr = async function(data, owner) {
    const ticket = ++revision;
    const control = button();
    if (!control) return;
    control.disabled = true;
    control.replaceChildren();
    control.textContent = data ? '產生 QR 碼中…' : '點數載入後顯示 QR 碼';
    dialog()?.close();
    document.getElementById('points-wallet-qr-large')?.replaceChildren();
    const uid = String(data?.queriedLineUserId || '').trim();
    if (!owner || data?.walletDisplayOwner !== owner || owner !== window.currentUserProfile?.userId || !/^U[0-9a-fA-F]{20,64}$/.test(uid)) {
      if (data) control.textContent = '暫無可用的會員 QR 碼';
      return;
    }
    try {
      const { default: qrcode } = await import('../vendor/qrcode-generator-2.0.4.mjs');
      if (ticket !== revision || owner !== window.currentUserProfile?.userId) return;
      const qr = qrcode(0, 'M');
      qr.addData(uid, 'Byte');
      qr.make();
      // Four-module white quiet zone. Only generated geometry enters HTML.
      const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
      control.innerHTML = svg;
      const label = document.createElement('span');
      label.textContent = '點數 QR・點擊放大';
      control.append(label);
      control.disabled = false;
      control.onclick = () => {
        if (ticket !== revision || owner !== window.currentUserProfile?.userId) {
          window.renderPointsWalletQr(null);
          return;
        }
        document.getElementById('points-wallet-qr-large').innerHTML = svg;
        dialog().showModal();
      };
    } catch (error) {
      if (ticket !== revision) return;
      control.textContent = 'QR 載入失敗，點此重試';
      control.disabled = false;
      control.onclick = () => window.renderPointsWalletQr(data, owner);
    }
  };
})();
