// Dependency-free readable PDF export. Authoritative evidence remains the private server snapshot.
export const fieldLabels={unit_name:'申請單位',applicant_name:'負責人／申請人',phone:'行動電話',line_contact:'LINE ID（選填）',unit_types:'單位類型',unit_types_other:'單位類型補充',recipients:'預計發送對象',recipients_other:'發送對象補充',scenarios:'預計使用情境',scenarios_other:'使用情境補充'};
export const discountFieldLabels={unit_name:'店家／品牌／單位名稱',services:'主要商品／服務',business_types:'經營類型',business_types_other:'經營類型補充',applicant_name:'負責人／申請人',phone:'行動電話',line_contact:'LINE ID（選填）',assisted_partner:'協助申請之共好夥伴（申報資訊，非 CRM 歸屬）'};
export const partnerFieldLabels={unit_name:'乙方姓名／公司名稱',party_type:'簽約身分',representative_name:'代表人（公司／法人）',applicant_name:'簽署人姓名',phone:'行動電話',address:'聯絡地址',performance_owner_name:'本次業績歸屬人姓名',performance_owner_member_number:'本次業績歸屬人會員編號',referrer_name:'CRM 推薦人姓名',referrer_member_number:'CRM 推薦人會員編號',bank_name:'銀行名稱',bank_code:'銀行代碼',bank_branch:'分行名稱',bank_account_holder:'獎金收款戶名',bank_account:'獎金收款帳號'};
export const fullFieldLabels={unit_name:'公司／店家名稱',applicant_name:'負責人／申請人',address:'地址',services:'主要商品／服務',phone:'行動電話',line_contact:'LINE ID（選填）',assisted_partner:'協助申請之共好夥伴（申報資訊）'};
const fallbackLabels={reward:fieldLabels,discount:discountFieldLabels,partner:partnerFieldLabels,full:fullFieldLabels};
export function labelsFor(s){
 const supplied=s?.field_labels;
 const fallback=fallbackLabels[s?.form_kind]||fieldLabels;
 return supplied&&typeof supplied==='object'&&!Array.isArray(supplied)?{...fallback,...Object.fromEntries(Object.entries(supplied).filter(([key,label])=>Object.hasOwn(s.fields||{},key)&&typeof label==='string'&&label.trim()&&label.length<=160))}:fallback;
}
export const displayFieldValue=(key,value)=>key==='party_type'?({natural_person:'自然人',company:'公司／行號／法人團體'}[value]||value):Array.isArray(value)?value.join('、'):value;
export const sourceHashFor=s=>s?.template?.source_sha256||s?.terms?.source_sha256||s?.terms?.sourceSha256||s?.source_sha256||'';
export const policyNotesFor=s=>Array.isArray(s?.terms?.clarifications)?s.terms.clarifications:Array.isArray(s?.terms?.policy_annotations)?s.terms.policy_annotations:Array.isArray(s?.policy_annotations)?s.policy_annotations:[];
export function drawSignature(ctx,strokes,x=0,y=0,w=1000,h=400){
 ctx.save();ctx.translate(x,y);ctx.scale(w/1000,h/400);ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#122b35';
 for(const stroke of strokes){ctx.beginPath();stroke.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.stroke();}ctx.restore();
}
export function jpegPagesPdf(pages){
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let size=0;
 const push=v=>{const bytes=typeof v==='string'?encoder.encode(v):v;chunks.push(bytes);size+=bytes.length;};
 const obj=(id,content,binary)=>{offsets[id]=size;push(id+' 0 obj\n'+content);if(binary){push('\nstream\n');push(binary);push('\nendstream');}push('\nendobj\n');};
 push('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')}] >>`);
 pages.forEach((page,i)=>{const id=3+i*3,command=encoder.encode('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q');
  obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
  obj(id+1,`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`,page.bytes);
  obj(id+2,`<< /Length ${command.length} >>`,command);
 });
 const start=size;push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const off of offsets.slice(1))push(String(off).padStart(10,'0')+' 00000 n \n');push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
 return new Blob(chunks,{type:'application/pdf'});
}
export async function applicationPdf(record){
 const pages=[],width=1240,height=1754,margin=90,bottom=height-120;let canvas,ctx,y;
 const newPage=()=>{canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');if(!ctx)throw Error('裝置無法產生 PDF');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#17343e';ctx.font='25px "Microsoft JhengHei", "Noto Sans TC", sans-serif';y=100;pages.push(canvas);};
 const line=text=>{if(y>bottom)newPage();ctx.fillText(text,margin,y);y+=40;};
 const paragraph=text=>{let current='';for(const c of String(text)){if(c==='\n'||ctx.measureText(current+c).width>width-2*margin){line(current);current=c==='\n'?'':c;}else current+=c;}if(current)line(current);y+=12;};
 await document.fonts?.ready;newPage();const s=record.snapshot;
 paragraph(s.terms.title);paragraph('簽署申請編號：'+record.id);
 for(const [key,label]of Object.entries(labelsFor(s))){const value=s.fields[key];if(value?.length)paragraph(label+'：'+displayFieldValue(key,value));}
 if(policyNotesFor(s).length){paragraph('本次簽署的制度確認');for(const text of policyNotesFor(s))paragraph(text);}
 paragraph('合作條款（版本 '+s.terms.version+'）');for(const text of s.terms.paragraphs)paragraph(text);
 if(sourceHashFor(s))paragraph('原始範本 SHA-256：'+sourceHashFor(s));
 if(s.template?.content_sha256)paragraph('本次條款內容 SHA-256：'+s.template.content_sha256);
 paragraph('本次電子簽署確認');for(const text of Object.values(s.confirmations))paragraph('已確認：'+text);
 if(y+300>bottom)newPage();paragraph('申請人手寫簽名：'+s.fields.applicant_name);drawSignature(ctx,s.signing.strokes,margin,y,700,280);y+=300;
 paragraph('簽署時間（台灣）：'+new Date(record.signed_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));
 paragraph('驗證方式：'+s.assurance);paragraph('簽署 LINE 帳號：'+s.signer_uid);
 paragraph('申請當時 CRM 推薦來源：'+(s.referrer_uid||'未記錄'));
 paragraph('申請內容 SHA-256：'+record.content_sha256);
 paragraph('本副本由已保存的申請內容產生，非憑證式數位簽章 PDF。簽署不等於審核或開通；請至平台查詢最新審核狀態。');
 const images=[];for(let i=0;i<pages.length;i++){
  const c=pages[i],context=c.getContext('2d');context.font='20px "Microsoft JhengHei", sans-serif';context.fillStyle='#52646a';context.fillText(`私人申請副本 · ${i+1} / ${pages.length}`,margin,height-55);
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.92));if(!blob)throw Error('PDF 圖片產生失敗');images.push({width,height,bytes:new Uint8Array(await blob.arrayBuffer())});
 }
 return jpegPagesPdf(images);
}
