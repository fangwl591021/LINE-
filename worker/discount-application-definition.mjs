import {ShopError} from './store-shop.mjs';

// Terms transcribed from the user-supplied application; no catalog or cashier settings are changed.
export const discountTerms=Object.freeze({version:'discount-store-2026-10-23-v1',title:'點數通｜特約折抵店家申請書',paragraphs:[
 '免費加入・有客戶消費，再提供購物金折抵',
 '加入點數通特約折抵店家，接受消費者使用購物金折抵，串聯企業、福委會、社區、商會、協會、社團、學院等贈點單位所帶來的消費機會。',
 '不限實體店面，品牌商品、線上商店、專業服務等皆可申請。',
 '二、購物金折抵方式',
 '特約折抵店家至少提供 10% 購物金折抵，折抵範圍 10%～50%，特殊活動自行訂定。',
 '折抵舉例：消費金額 1,000 元，購物金折抵 100 元，消費者實際支付 900 元。以上以 10% 折抵為例。',
 '三、合作方式',
 '加入特約折抵店家目前為 0 元免費申請。',
 '特約折抵店家同意提供至少 10% 購物金折抵優惠。',
 '消費者實際消費時才提供購物金折抵，不需預先支付廣告費。',
 '店家同意基本資料、商品／服務類型及必要公開資訊，得於點數通平台作為特約折抵店家導客使用。',
 '實際商品、服務內容、售價、交易、退換貨及售後服務，由店家依自身交易規範及相關法令負責。',
 '如欲停止特約合作，請通知智點通股份有限公司辦理。',
 '四、申請確認',
 '本人／本單位確認上述資料及折抵方式，並同意依上述合作方式申請成為點數通特約折抵店家。',
 '智點通股份有限公司｜服務電話：02-6637-4988｜地址：新北市板橋區文化路二段486號3樓之2'
]});
export const discountOptions=Object.freeze({business_types:['實體店面','線上商店／電商','品牌商品','專業服務','課程／顧問','其他']});
export const discountConfirmations=Object.freeze({
 electronic:'我同意以電子方式提出本申請，確認下方手寫簽名用於本次完整申請文件，並可於我的申請下載副本。',
 terms:'我已閱讀本次申請的全部資料與合作條款，確認內容正確。',
 authority:'我是申請人本人，且有權代表本店家／單位提出申請。我了解目前僅驗證 LINE 帳號，尚須平台審核。',
 discount:'我同意至少提供 10% 購物金折抵，一般折抵範圍為 10%～50%，特殊活動自行訂定。',
 publication:'我同意基本資料、商品／服務類型及必要公開資訊，得於點數通平台作為特約折抵店家導客使用；簽名與申請紀錄不公開。'
});
const limits={unit_name:120,services:600,applicant_name:80,phone:30,line_contact:80,business_types_other:100,assisted_partner:100};
export function normalizeDiscountApplication(value){
 const fail=message=>{throw new ShopError(message,400);};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>![...Object.keys(limits),'business_types'].includes(k)))fail('特約折抵申請資料格式不正確');
 const out={};
 for(const [key,max]of Object.entries(limits)){const v=value[key]??'';if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v))fail('欄位格式或長度不正確');out[key]=v.trim();}
 if(!out.unit_name||!out.services||!out.applicant_name||!out.phone)fail('請填寫店家名稱、主要商品／服務、申請人與行動電話');
 if(!/^(?:09\d{8}|\+8869\d{8})$/.test(out.phone.replace(/[ -]/g,'')))fail('請填寫正確的台灣行動電話');
 const types=value.business_types,options=discountOptions.business_types;
 if(!Array.isArray(types)||!types.length||types.length>options.length||new Set(types).size!==types.length||types.some(v=>!options.includes(v)))fail('請選擇有效的經營類型');
 out.business_types=options.filter(v=>types.includes(v));
 if(types.includes('其他')&&!out.business_types_other)fail('勾選其他經營類型時請補充說明');
 return out;
}
