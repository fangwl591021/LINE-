// Synthetic localhost acceptance only. Start store-commerce-server with
// TEST_COMMERCE_POINTS=true; never pass a production URL.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8794/')&&!r.url().startsWith('data:'))throw Error('External request forbidden');});
 await page.goto('http://127.0.0.1:8794/');await page.locator('.shop-bottom-nav [data-do=find]').click();await page.locator('[data-do=view]').first().click();await page.locator('[data-do=online-buy]').click();await page.locator('[name=points_used]').waitFor();
 await page.locator('[data-commerce=wallet]').click();await page.waitForFunction(()=>document.querySelector('[data-wallet-status]').textContent.includes('1,000'));
 await page.locator('[name=qty-p-a]').fill('1');await page.locator('[name=points_used]').fill('50');
 for(const [k,v] of Object.entries({buyer_name:'測試購買人',buyer_phone:'0912345678',city:'台北市',district:'中正區',address:'測試路1號'}))await page.locator(`[name=${k}]`).fill(v);
 await page.locator('[data-commerce-form=quote] > button.primary').click();await page.locator('[data-commerce=place]').waitFor();
 let body=await page.locator('body').innerText();if(!body.includes('8,810')||!body.includes('50 點'))throw Error('Net cash/points missing');
 await page.locator('[data-commerce=edit]').click();if(await page.locator('[name=points_used]').inputValue()!=='50')throw Error('Points draft lost');
 await page.locator('[data-commerce-form=quote] > button.primary').click();
 await page.locator('[name=confirm_order]').check();
 await page.locator('[data-commerce=place]').click();await page.getByRole('heading',{name:'訂單已建立，尚未匯款'}).waitFor();
 await page.locator('[data-commerce=orders]').click();await page.locator('.shop-sale-row').waitFor();
 await page.locator('details').evaluate(el=>el.open=true);
 const dir=path.join(require('node:os').tmpdir(),'store-commerce-points-qa-20261019');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'mobile-receipt.png'),fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 page.on('dialog',d=>d.accept());await page.locator('[data-commerce=cancel]').click();await page.waitForFunction(()=>document.body.innerText.includes('已退點'));
 const state=await page.request.get('http://127.0.0.1:8794/test-point-state').then(r=>r.json());if(JSON.stringify(state.writes)!=='[-50,50]'||state.balance!==1000)throw Error('Debit/refund duplicates');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(dir,'desktop-refund.png'),fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Desktop overflow');if(errors.length)throw Error(errors.join('\n'));
 // A second synthetic order exercises the merchant's actual cash-confirmation
 // and return form. No production URLs, points, payment or credentials.
 const cart={shop_id:'shop-a',payment_method:'REMITTANCE',points_used:50,items:[{id:'p-a',quantity:1}],buyer:{name:'測試購買人',phone:'0912345678',email:''},customer:{name:'測試收件人',phone:'0912345678',carrier:'POST',city:'台北市',district:'中正區',address:'測試路1號'}};
 const api=async(route,data)=>{const r=await page.request.post('http://127.0.0.1:8794/v1/store-commerce'+route,{headers:{Authorization:'Bearer b'},data});const json=await r.json();if(!r.ok())throw Error(json.error);return json;};
 const quote=await api('/quote',cart);const placed=await api('/orders',{...cart,quote_hash:quote.quote_hash,request_key:crypto.randomUUID()});
 await api('/orders/action',{order_id:placed.order.id,version:placed.order.version,request_key:crypto.randomUUID(),action:'report_remittance',last5:'12345'});
 await page.evaluate(async()=>{window.testToken='a';await openStoreShop();});await page.locator('.shop-bottom-nav [data-do=find]').click();await page.locator('[data-do=manage]:visible').first().click();
 await page.getByRole('button',{name:'網路訂單／收款設定',exact:true}).click();await page.locator('[data-commerce=orders]').click();
 await page.locator('[data-action=verify_remittance]').waitFor({state:'attached'});await page.locator('details').first().evaluate(el=>el.open=true);
 await page.locator('[name=received]').fill('8810');await page.locator('[data-action=verify_remittance] [name=confirmed]').check();
 await page.locator('[data-action=verify_remittance] button').click();await page.locator('[data-action=refund]').waitFor({state:'attached'});
 await page.locator('details').first().evaluate(el=>el.open=true);await page.locator('[data-action=refund] [name=confirmed]').check();await page.locator('[data-action=refund] button').click();
 await page.waitForFunction(()=>document.querySelector('.shop-sale-row')?.innerText.includes('已退點'));
 const merchantState=await page.request.get('http://127.0.0.1:8794/test-point-state').then(r=>r.json());
 if(JSON.stringify(merchantState.writes)!=='[-50,50,-50,50]'||merchantState.balance!==1000)throw Error('Merchant refund invalid or duplicated');
 await page.screenshot({path:path.join(dir,'merchant-refund.png'),fullPage:true});if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({mobileWidth:390,desktopWidth:1280,netCash:8810,points:50,state,merchantState,merchantCashConfirmation:true,errors,productionWrites:0},null,2));console.log('Browser PASS: debit, buyer cancellation, merchant cash confirmation and refund, 390px/1280px, no production writes.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exit(1)});
