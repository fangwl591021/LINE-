import { authorizeStoreAdmin, DirectoryError } from './store-admin.mjs';
import { readAdminOverviewCounts } from './admin-overview-counts.mjs';

// Administrative counts only; the existing finance/bonus and member records
// are never written or exported by this endpoint.
const PATH = '/v1/admin/overview-stats';
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const respond = (body, status = 200) => Response.json(body, {status, headers:HEADERS});

export async function handleAdminOverviewStats(request, env, profileMapper, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:HEADERS});
  if (request.method !== 'GET') return respond({success:false,error:'不支援此操作'}, 405);
  if (url.search) return respond({success:false,error:'不支援查詢參數'}, 400);
  try {
    // This pathname has no conflicting-identity exception in store-admin.
    const {db} = await authorizeStoreAdmin(request, env, profileMapper, fetcher);
    const data = await readAdminOverviewCounts(db);
    return respond({success:true,data});
  } catch (error) {
    if (error instanceof DirectoryError) return respond({success:false,error:error.code === 'ADMIN_REQUIRED' ? '僅限管理員查閱' : error.message}, error.status || 403);
    console.error('admin_overview_stats_unavailable');
    return respond({success:false,error:'統計資料暫時無法讀取，請稍後再試'}, 503);
  }
}
