// Discovery only. Never rewrites a member's name, identity, cards or history.
const whitespace = [9, 10, 13, 32, 160, 0x200b, 0x3000, 0xfeff];
const trimCharacters = whitespace.map(code => `char(${code})`).join('||');
export const memberDisplayNameSql = (...columns) =>
  `COALESCE(${columns.map(column => `NULLIF(TRIM(${column},${trimCharacters}),'')`).join(',')},'')`;

export function validMemberNameSql(expression) {
  // Exact placeholders only; normal names, business nicknames and English names stay valid.
  const normalized = whitespace.reduce((sql, code) => `replace(${sql},char(${code}),'')`, `lower(COALESCE(${expression},''))`);
  return `${normalized} NOT IN ('','未命名','未命名會員','未命名用戶','未命名用户','未命名使用者','unnamed','unknown')`;
}
