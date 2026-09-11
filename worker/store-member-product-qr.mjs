const uid=v=>/^U[0-9a-fA-F]{20,64}$/.test(v||'');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v||'');
const fail=error=>({success:false,error});
export const qrTokenValid=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
export async function qrTokenHash(token) {
 if(!qrTokenValid(token))throw Error('商品會員 QR 格式不正確');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function issueMemberProductQr(p,env,resolveCustomer) {
 const issuer=p.authenticatedUserId;
 if(!uid(issuer)||!uuid(p.productId))return fail('請先登入並選擇有效商品');
 const product=await env.ACTMASTER_DB.prepare(`SELECT p.id FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id JOIN users u ON u.line_id=s.owner_uid
 WHERE p.id=? AND p.status='active' AND s.status='active' AND lower(u.role) IN ('store','admin','店長','總管')`).bind(p.productId).first();
 if(!product)return fail('商品或店面尚未開放');
 const customer=await resolveCustomer(issuer);
 if(customer?.error||customer?.needsBinding||!uid(customer?.customerPointUserId))return fail('無法確認本人點數帳戶，請先完成會員綁定');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 const expiresAt=Date.now()+300000;
 await env.ACTMASTER_DB.prepare(`INSERT INTO store_member_product_qr(token_hash,issuer_id,customer_id,product_id,expires_at) VALUES(?,?,?,?,?)
 ON CONFLICT(issuer_id,product_id) DO UPDATE SET token_hash=excluded.token_hash,customer_id=excluded.customer_id,expires_at=excluded.expires_at,used_request=NULL`).bind(await qrTokenHash(token),issuer,customer.customerPointUserId,p.productId,expiresAt).run();
 return {success:true,data:{qrToken:token,productId:p.productId,expiresAt}};
}
export async function readMemberProductQr(token,env) {
 const row=await env.ACTMASTER_DB.prepare('SELECT * FROM store_member_product_qr WHERE token_hash=?').bind(await qrTokenHash(token)).first();
 if(!row||row.expires_at<=Date.now()||row.used_request)throw Error('商品會員 QR 已過期、已更新或已使用，請會員重新產生');
 return row;
}
export async function claimMemberProductQr(row,requestId,env) {
 const r=await env.ACTMASTER_DB.prepare('UPDATE store_member_product_qr SET used_request=? WHERE token_hash=? AND used_request IS NULL AND expires_at>?').bind(requestId,row.token_hash,Date.now()).run();
 if(r.meta.changes!==1)throw Error('商品會員 QR 已失效，尚未扣點，請重新產生');
}
