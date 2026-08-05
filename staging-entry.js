import backend from './workerbackup.js';

const BACKEND_GET_PATHS = new Set([
  '/hub-test',
  '/monitor',
  '/lineoa-monitor.html',
  '/crm',
  '/lineoa-crm.html'
]);

export default {
  async scheduled(controller, env, ctx) {
    return await backend.scheduled(controller, env, ctx);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isBackendGet =
      BACKEND_GET_PATHS.has(url.pathname) ||
      url.pathname === '/api' ||
      url.pathname.startsWith('/api/');

    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      !isBackendGet &&
      env.ASSETS &&
      typeof env.ASSETS.fetch === 'function'
    ) {
      return await env.ASSETS.fetch(request);
    }

    return await backend.fetch(request, env, ctx);
  }
};
