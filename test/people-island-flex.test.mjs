import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPeopleIslandVideoFlex,peopleIslandCardEntryUrl,PEOPLE_ISLAND_VIDEO,PEOPLE_ISLAND_POSTER} from '../js/modules/people-island-flex.mjs';

test('campaign is one MEGA native 9:16 video bubble with matching poster and an equivalent fallback',()=>{
  const card=buildPeopleIslandVideoFlex();
  assert.equal(card.type,'flex');assert.equal(card.contents.type,'bubble');assert.equal(card.contents.size,'mega');
  const hero=card.contents.hero;
  assert.match(PEOPLE_ISLAND_VIDEO,/\/people-island\/video-card-v3\.mp4$/);
  assert.match(PEOPLE_ISLAND_POSTER,/\/people-island\/video-card-v3\.jpg$/);
  assert.equal(hero.type,'video');assert.equal(hero.aspectRatio,'9:16');assert.equal(hero.url,PEOPLE_ISLAND_VIDEO);assert.equal(hero.previewUrl,PEOPLE_ISLAND_POSTER);
  assert.equal(hero.altContent.aspectRatio,'9:16');assert.equal(hero.altContent.url,hero.previewUrl);
  assert.deepEqual(hero.action,hero.altContent.action);assert.deepEqual(card.contents.footer.contents[0].action,hero.action);
  assert.equal(card.contents.footer.contents.length,2);
  assert.equal(card.contents.footer.contents[1].action.label,'分享好友');
  const share=new URL(card.contents.footer.contents[1].action.uri);
  assert.equal(share.searchParams.get('islandShare'),'1');
  share.searchParams.delete('islandShare');assert.equal(share.href,hero.action.uri);
  assert.ok(JSON.stringify(card).length<30000);assert.doesNotMatch(JSON.stringify(card),/carousel|postback|clipboard|access_token|video_profile/);
});
test('all actions enter the existing LIFF with campaign intent and original referral/network context',()=>{
  const entryUrl=peopleIslandCardEntryUrl({ref:'original+ref',net:'tenant-1'}),card=buildPeopleIslandVideoFlex({entryUrl});
  const url=new URL(card.contents.hero.action.uri);
  assert.equal(url.origin,'https://liff.line.me');assert.equal(url.pathname,'/1660923784-vViMTZ1y');
  assert.equal(url.searchParams.get('peopleIslandCard'),'1');assert.equal(url.searchParams.get('ref'),'original+ref');assert.equal(url.searchParams.get('net'),'tenant-1');
  assert.equal(url.searchParams.has('userId'),false);
  const share=new URL(card.contents.footer.contents[1].action.uri);
  assert.equal(share.searchParams.get('ref'),'original+ref');assert.equal(share.searchParams.get('net'),'tenant-1');
  assert.equal(share.searchParams.get('islandShare'),'1');assert.equal(url.searchParams.has('islandShare'),false);
});
test('URLs cannot change the campaign into direct chat, external redirects, or an unverified-join marker',()=>{
  for(const entryUrl of ['javascript:alert(1)','http://liff.line.me/1660923784-vViMTZ1y?peopleIslandCard=1','https://evil.test/?peopleIslandCard=1',
    'https://liff.line.me.evil.test/1660923784-vViMTZ1y?peopleIslandCard=1','https://user:pass@liff.line.me/1660923784-vViMTZ1y?peopleIslandCard=1',
    peopleIslandCardEntryUrl()+'&point_friend=1',peopleIslandCardEntryUrl()+'&redirect=https://evil.test',peopleIslandCardEntryUrl()+'&peopleIslandCard=0',peopleIslandCardEntryUrl()+'#token']){
    assert.throws(()=>buildPeopleIslandVideoFlex({entryUrl}));
  }
  assert.throws(()=>peopleIslandCardEntryUrl({liffId:'https://evil.test'}));
  assert.throws(()=>peopleIslandCardEntryUrl({ref:'x'.repeat(181)}));assert.throws(()=>peopleIslandCardEntryUrl({net:'bad\nvalue'}));
});
