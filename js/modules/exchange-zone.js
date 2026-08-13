(function() {
  const current = document.currentScript?.src || location.href;
  const base = new URL('exchange-zone-core.js?v=20260814-delete', current).href;
  const overlay = new URL('exchange-zone-delete-overlay.js?v=20260814-delete', current).href;

  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Exchange Zone script load failed: ${src}`));
      document.head.appendChild(script);
    });
  }

  load(base)
    .then(() => load(overlay))
    .catch((error) => console.error(error));
})();
