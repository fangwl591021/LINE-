import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
for (const file of ['admin.html','admin-v2.html']) {
  test(file+' loads all tenant annual fees with the current LINE login and distinguishes errors from empty orders', async()=>{
    const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
    const api=extract('    async function fetchAPI','\n    }')+'\n    }';
    const list=extract('    function normalizeBonusOrder','    async function createTenantBonusOrder');
    const nodes=Object.fromEntries(['bonus-order-pager','bonus-orders-body','bonus-order-status-filter'].map(id=>[id,{innerHTML:'',textContent:'',value:'all'}]));
    let mode='full',token='fixture';const calls=[];
    const ctx={document:{getElementById:id=>nodes[id]},adminProfile:{userId:'admin-test'},adminRole:'admin',adminNetworkId:'admin',
      liff:{isLoggedIn:()=>!!token,getAccessToken:()=>token},WORKER_URL:'https://fixture.invalid',AbortController,setTimeout,clearTimeout,
      escapeHTML:String,formatDisplayTime:String,formatCurrency:String,BONUS_POLICY_TYPE:1,allBonusOrdersData:[],bonusOrderPage:1,BONUS_ORDER_PAGE_SIZE:20,
      fetch:async(url,options)=>{
        const {action,payload}=JSON.parse(options.body);calls.push(action);assert.equal(action,'mlmListOrders');
        assert.equal(payload.lineAccessToken,'fixture');assert.equal(payload.userId,'admin-test');assert.equal(payload.orderType,'tenant_annual_fee');
        if(mode==='error')return {json:async()=>({success:false,error:'invalid token'})};
        const rows=mode==='empty'?[]:Array.from({length:payload.page===1?100:1},(_,i)=>({orderId:'T'+payload.page+'-'+i,tenantName:'測試租戶',fee:6300,bv:3000,status:'paid'}));
        return {json:async()=>({success:true,data:rows})};
      }};
    vm.runInNewContext(api+'\n'+list,ctx);
    await ctx.loadBonusOrders();assert.equal(ctx.allBonusOrdersData.length,101);assert.match(nodes['bonus-orders-body'].innerHTML,/測試租戶/);
    assert.equal(calls.length,2);mode='error';await ctx.loadBonusOrders();
    assert.match(nodes['bonus-orders-body'].innerHTML,/重新登入/);assert.match(nodes['bonus-orders-body'].innerHTML,/重新讀取/);
    assert.equal(nodes['bonus-order-pager'].textContent,'');assert.equal(ctx.allBonusOrdersData.length,0);
    mode='empty';await ctx.loadBonusOrders();assert.match(nodes['bonus-orders-body'].innerHTML,/目前沒有租戶年費訂單/);
    assert.match(nodes['bonus-order-pager'].innerHTML,/0 筆/);token='';const count=calls.length;
    await ctx.loadBonusOrders();assert.equal(calls.length,count);assert.match(nodes['bonus-orders-body'].innerHTML,/重新登入/);
  });
}
