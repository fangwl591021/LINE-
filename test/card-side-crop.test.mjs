import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {replaceCollectionImage} from '../js/modules/card-collection-sides.mjs';

test('image repair preserves other faces, layouts, ownership and version fields',()=>{
  const cfg={collectionImages:{front:'https://e.test/f',back:'https://e.test/b'},imgUrl:'https://e.test/f',imgUrlLandscape:'https://e.test/custom',video:{coverUrl:'https://e.test/v'},_cardLinksRevision:7,buttons:[{l:'go'}]};
  const card={customConfig:cfg,'名片圖檔':'https://e.test/f',姓名:'unchanged',creatorId:'OWNER'};
  const data=replaceCollectionImage(card,'front','https://e.test/new'),saved=JSON.parse(data['自訂名片設定']);
  assert.equal(data['名片圖檔'],'https://e.test/new');assert.equal(saved.imgUrl,'https://e.test/new');
  assert.equal(saved.imgUrlLandscape,cfg.imgUrlLandscape);assert.deepEqual(saved.video,cfg.video);assert.deepEqual(saved.buttons,cfg.buttons);assert.equal(saved._cardLinksRevision,7);
  assert.equal(saved.collectionImages.back,cfg.collectionImages.back);assert.equal(cfg.imgUrl,'https://e.test/f');
  assert.deepEqual(Object.keys(replaceCollectionImage(card,'back','https://e.test/b2')),['自訂名片設定']);
  assert.throws(()=>replaceCollectionImage(card,'front','javascript:alert(1)'));
});

const source=readFileSync(new URL('../js/modules/a-kaffit-vision-v3-crop.js',import.meta.url),'utf8');
function runtime(){
  let warps=0,closed=0;
  const ctx=vm.createContext({File:class {},createImageBitmap:async()=>({width:1200,height:1600,close(){closed++;}}),
    orderQuad:p=>p,warpPerspective(){warps++;return {toBlob:cb=>cb({})};},document:{createElement:()=>({getContext:()=>({drawImage(){}})})}});
  vm.runInContext(source.replace(/^import[^\n]*\n/gm,'').replace(/export /g,''),ctx);
  return {ctx,warps:()=>warps,closed:()=>closed};
}
const good={detected:true,incomplete:false,cropConfidence:.95,boundingBox:{x:.05,y:.35,width:.85,height:.4},corners:[{x:.05,y:.35},{x:.9,y:.35},{x:.9,y:.75},{x:.05,y:.75}]};
test('matching corners crop a portrait source; inconsistent bbox never silently crops tabletop',async()=>{
  const h=runtime();assert.ok(await h.ctx.cropByVisionLocalization({},good));assert.equal(h.warps(),1);
  const mismatched={...good,boundingBox:{x:.05,y:.53,width:.85,height:.45}};
  assert.equal(await h.ctx.cropByVisionLocalization({},mismatched),null);assert.equal(h.warps(),1);assert.equal(h.closed(),2);
});
test('missing corners, low confidence and incomplete photos require manual review',async()=>{
  const h=runtime();
  for(const loc of [{...good,corners:[]},{...good,cropConfidence:.5},{...good,incomplete:true}])assert.equal(await h.ctx.cropByVisionLocalization({},loc),null);
  assert.equal(h.warps(),0);
});
