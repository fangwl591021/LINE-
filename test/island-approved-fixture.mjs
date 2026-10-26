// Existing exchange tests model an approved publisher; new qualification reads are isolated
// from their publication/point-operation call assertions. Real SQL gate tests live separately.
export function approvedInteractionDb(db) {
  return { ...db, prepare(query) {
    const identity = query.includes("FROM user_identity_links WHERE status='active'");
    const users = query.startsWith('SELECT row_id,line_id,name,role FROM users WHERE');
    const card = query.includes('SELECT c.row_id,c.ai_review_status FROM card_contacts');
    if (!identity && !users && !card) return db.prepare(query);
    let args = [];
    return {
      bind(...value) { args = value; return this; },
      async all() { return { success: true, results: identity ? [] : [{ row_id: 'approved-owner', line_id: JSON.parse(args[0])[0], name: '合成會員', role: 'user' }] }; },
      async first() { return { row_id: 'approved-card', ai_review_status: 'passed' }; }
    };
  } };
}
