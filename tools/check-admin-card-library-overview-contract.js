const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function expect(condition, message) {
  if (!condition) {
    console.error(`Admin card library overview contract failed: ${message}`);
    process.exit(1);
  }
}

expect(worker.includes("getAdminCardLibraryOverview: { access: 'admin' }"), 'overview action must be admin-only');
expect(worker.includes("case 'getAdminCardLibraryOverview':"), 'overview action must be routed');
expect(worker.includes('COUNT(DISTINCT ${uploaderExpr}) AS uploader_count'), 'overview must count distinct uploaders');
expect(worker.includes("date(COALESCE(created_at, updated_at)) >= date(?)"), 'server-side start date filter must exist');
expect(worker.includes("sort).toLowerCase() === 'oldest'"), 'oldest-first sorting must be allowlisted');
expect(admin.includes('id="card-library-trend"'), '30-day chart must exist');
expect(admin.includes('id="card-library-uploaders"'), 'uploader KPI must exist');
expect(admin.includes('id="card-date-from"') && admin.includes('id="card-date-to"'), 'date range controls must exist');
expect(admin.includes('<option value="oldest">最早上傳優先</option>'), 'oldest uploader ordering must be available');
expect(admin.includes("fetchAPI('getAdminCardLibraryOverview'"), 'admin UI must use server-side overview');

console.log('Admin card library overview contract passed.');
