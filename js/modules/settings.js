/* Settings loader: preserve original settings module and extend card quota fields. */
(function () {
  'use strict';

  function loadSequentially(urls) {
    return urls.reduce(function (promise, url) {
      return promise.then(function () {
        return new Promise(function (resolve, reject) {
          var script = document.createElement('script');
          script.src = url;
          script.onload = resolve;
          script.onerror = function () { reject(new Error('Failed to load ' + url)); };
          document.head.appendChild(script);
        });
      });
    }, Promise.resolve());
  }

  var urls = [
    'js/modules/settings-core.js?v=20260816-cardquota2',
    'js/modules/settings-card-quota.js?v=20260816-cardquota2',
    'js/modules/settings-card-quota-runtime.js?v=20260816-cardquota2'
  ];

  if (document.readyState === 'loading' && document.currentScript) {
    document.write('<script src="' + urls[0] + '"><\/script>');
    document.write('<script src="' + urls[1] + '"><\/script>');
    document.write('<script src="' + urls[2] + '"><\/script>');
  } else {
    loadSequentially(urls).catch(function (error) {
      console.error('[settings-loader]', error);
    });
  }
})();
