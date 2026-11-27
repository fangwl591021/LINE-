// Chat status comes from the signed LINE event's sender and current D1 records.
export async function readStoreChatOnboarding(db,uid){
 const members=await db.prepare('SELECT role FROM users WHERE line_id=? LIMIT 2').bind(uid).all();
 if(members.success===false || !Array.isArray(members.results) || members.results.length>1)throw Error('Cannot verify merchant identity');
 if(!members.results.length)return 'register';
 const role=String(members.results[0].role||'').toLowerCase();
 if(['store','店長'].includes(role))return 'store';
 if(['admin','總管'].includes(role))return 'admin';
 const application=await db.prepare(`SELECT COALESCE(r.decision,'pending') AS status
  FROM full_applications a LEFT JOIN full_application_reviews r ON r.application_id=a.id
  WHERE a.owner_uid=? ORDER BY a.signed_at DESC,a.id DESC LIMIT 1`).bind(uid).first();
 return application?.status||'first';
}

export async function storeChatOnboarding(event,env,card,action,link){
 if(event.source?.type!=='user'||!/^U[0-9a-f]{32}$/u.test(event.source?.userId||''))return null;
 const state=await readStoreChatOnboarding(env.ACTMASTER_DB,event.source.userId);
 if(state==='store'||state==='admin'){
  const links=[action('店家資料／商品維護',link(env,'chat-store'))];
  if(state==='store'&&env.STORE_OA_PRODUCT_UPLOAD_FULL_ENABLED==='true'){
   links.push(action('新增商品／繼續草稿',link(env,'chat-products')));
  }
  return card('點數通｜店家工作區',['在 LINE 內建置店面，或查看與維護已建立的商品。'],links);
 }
 const entries={
  register:['點數通｜店家申請','先完成點數通會員註冊，再申請雙向完整版。','註冊並開始申請','chat-apply'],
  first:['點數通｜店家申請','填寫雙向完整版申請。依既有流程審核並完成年費開通後，即可回聊天室輸入 888 管理商品。','申請成為店家','chat-apply'],
  pending:['店家申請審核中','已收到雙向完整版申請，可查看已送出的資料及審核進度。','查看申請進度','chat-application-status'],
  accepted:['店家申請已通過','確認年費及方案開通後，再輸入 888 開始建置店面與商品。','查看申請與開通進度','chat-application-status'],
  rejected:['店家申請｜請查看說明','請查看審核說明並確認需補的資料。','查看審核說明','chat-application-status']
 };
 const entry=Object.hasOwn(entries,state)&&entries[state];
 if(!entry)throw Error('Unknown merchant application state');
 const [title,description,label,section]=entry;
 return card(title,[description],[action(label,link(env,section))]);
}
