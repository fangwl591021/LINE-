// A separate campaign card; never reads or overwrites a member's video_profile.
export const PEOPLE_ISLAND_VIDEO = 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/people-island/video-card-v3.mp4';
export const PEOPLE_ISLAND_POSTER = 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/people-island/video-card-v3.jpg';
const DEFAULT_LIFF = '1660923784-vViMTZ1y';
const label = '加入點數通・探索人脈島';
export const PEOPLE_ISLAND_DEFAULT_TITLE = '人脈島';
export const PEOPLE_ISLAND_DEFAULT_DESC = '探索不同產業，認識新的合作夥伴。\n加入點數通後，先來島上看看。\n建立本人名片，完成註冊與 AI 審核後開啟交流。';

// The same title/desc fields used by the existing video-card editor. Media and
// onboarding actions are fixed campaign assets, never editable contact fields.
export function peopleIslandVideoConfig(copy = {}) {
  const clean = (value, fallback, limit, multiline) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string') throw Error('標題與說明格式不正確');
    const text = value.replace(/\r\n/g, '\n').trim();
    if (!text || text.length > limit || (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(text)) throw Error('標題與說明長度或格式不正確');
    return text;
  };
  return {cardType:'video', cardVersion:'video', layoutStyle:'landscape', imgRatioLandscape:'9:16',
    title:clean(copy.title, PEOPLE_ISLAND_DEFAULT_TITLE, 80, false),
    desc:clean(copy.desc, PEOPLE_ISLAND_DEFAULT_DESC, 800, true),
    videoUrl:PEOPLE_ISLAND_VIDEO, thumbnailUrl:PEOPLE_ISLAND_POSTER, previewUrl:PEOPLE_ISLAND_POSTER};
}

export function peopleIslandCardEntryUrl({liffId = DEFAULT_LIFF, ref = '', net = ''} = {}) {
  if (typeof liffId !== 'string' || !/^\d{6,20}-[A-Za-z0-9]{4,30}$/.test(liffId)) throw Error('影音名片入口設定不正確');
  const url = new URL('https://liff.line.me/' + liffId);
  url.searchParams.set('peopleIslandCard', '1');
  for (const [key, value] of [['ref', ref], ['net', net]]) {
    if (typeof value !== 'string' || value.length > 180 || /[\u0000-\u001f\u007f]/.test(value)) throw Error('分享來源格式不正確');
    if (value.trim()) url.searchParams.set(key, value.trim());
  }
  return url.href;
}

function validEntry(value) {
  try {
    const url = new URL(value || peopleIslandCardEntryUrl());
    if (url.protocol !== 'https:' || url.hostname !== 'liff.line.me' || url.port || url.username || url.password || url.hash
      || !/^\/\d{6,20}-[A-Za-z0-9]{4,30}$/.test(url.pathname) || url.searchParams.get('peopleIslandCard') !== '1'
      || [...url.searchParams].some(([key]) => !['peopleIslandCard', 'ref', 'net'].includes(key))
      || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) throw Error();
    const expected = peopleIslandCardEntryUrl({liffId:url.pathname.slice(1),ref:url.searchParams.get('ref') || '',net:url.searchParams.get('net') || ''});
    return expected;
  } catch { throw Error('請使用人脈島專用加入入口'); }
}

export function buildPeopleIslandVideoFlex({entryUrl, config, card, title, desc} = {}) {
  const uri = validEntry(entryUrl);
  const copy = peopleIslandVideoConfig(config || card || {title, desc});
  const shareUri = new URL(uri);
  shareUri.searchParams.set('islandShare', '1');
  return {
    type:'flex', altText:(copy.title+'｜'+copy.desc.replace(/\n/g,' ')).slice(0,400),
    contents:{
      type:'bubble',size:'mega',
      hero:{type:'video',url:PEOPLE_ISLAND_VIDEO,previewUrl:PEOPLE_ISLAND_POSTER,aspectRatio:'9:16',
        action:{type:'uri',label,uri},
        altContent:{type:'image',url:PEOPLE_ISLAND_POSTER,size:'full',aspectRatio:'9:16',aspectMode:'cover',action:{type:'uri',label,uri}}},
      body:{type:'box',layout:'vertical',spacing:'sm',contents:[
        {type:'text',text:copy.title,weight:'bold',size:'xl',color:'#07594F',wrap:true},
        {type:'text',text:copy.desc,wrap:true,size:'sm',color:'#48635E'}
      ]},
      footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
        {type:'button',style:'primary',color:'#00846B',action:{type:'uri',label,uri}},
        {type:'button',style:'secondary',action:{type:'uri',label:'分享好友',uri:shareUri.href}}
      ]}
    }
  };
}
