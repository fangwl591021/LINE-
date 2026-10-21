const text = value => String(value ?? '').trim();
export const isMemberNumber = value => /^\d{8}\d{3,}$/.test(text(value));

export function memberNumberView(row) {
  return {
    memberNumber: text(row?.member_number),
    memberJoinedAt: text(row?.member_joined_at),
    memberDateSource: text(row?.member_date_source)
  };
}

// Read-only and narrow. Never resolve by name/phone or create identity links.
export async function findMemberReferrer(db, input) {
  const value = text(input);
  if (!value || value.length > 120) throw new Error('請輸入推薦人的個人編號或 LINE UID');
  const numeric = isMemberNumber(value);
  const query = numeric
    ? `SELECT DISTINCT u.row_id,u.line_id,u.name,u.member_number,u.member_joined_at,u.member_date_source
       FROM member_number_registry n JOIN users u ON
         u.member_number=n.member_number OR u.row_id=n.user_row_id OR u.line_id=n.line_id
         OR EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND l.old_line_id=n.line_id AND l.new_line_id=u.line_id)
       WHERE n.member_number=?
         AND NOT EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND l.old_line_id=u.line_id AND l.new_line_id<>u.line_id)
       LIMIT 3`
    : `SELECT row_id,line_id,name,member_number,member_joined_at,member_date_source FROM users
       WHERE line_id=? OR row_id=? LIMIT 3`;
  const result = await db.prepare(query).bind(...(numeric ? [value] : [value,value])).all();
  if (result.success === false || !Array.isArray(result.results)) throw new Error('暫時無法核對推薦人，請稍後重試');
  if (result.results.length !== 1) throw new Error(result.results.length ? '推薦人身分對應不唯一，請由管理員確認' : '找不到此推薦人，請確認個人編號');
  const row = result.results[0];
  return { userId:text(row.line_id || row.row_id),name:text(row.name),...memberNumberView(row) };
}
