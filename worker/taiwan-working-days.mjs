// DGPA open data, one bit for every calendar day; 1=working, 0=holiday.
// Source license: Taiwan Open Government Data License, version 1.
// Unknown years deliberately have no weekday-only fallback.
const DAYS = Object.freeze({
  2026: '01001111100111110011111001111100111110011111000000000111100011111001111100111110011111001111000011110011111001111100111100011111001111100111110011111001111100111110011110001111100111110011111001111100111110011111001111100111110011111001111100111110011111001111100111100001111001111000111110011111000111100111110011111001111100111110011111001111100111110011110001111',
  2027: '00011111001111100111110011111001110000000110011111001111100011110011111001111100111110011111000011100111110011111001111000111110011111001111100111110011111001101100111110011111001111100111110011111001111100111110011111001111100111110011111001111100111110011011001111100101110011111000111100111110001111001111100111110011111001111100111110011111001111100111100011110'
});
export const TAIWAN_WORKING_CALENDAR = Object.freeze({
  dataset: 'https://data.gov.tw/dataset/14718',
  checkedAt: '2026-10-26',
  years: Object.freeze({
    2026: Object.freeze({sha256: '0edd80d368626eb73caa05b6c33400ec9d87691b46834d03936efb91e6a0f00d', source: 'https://www.dgpa.gov.tw/FileConversion?filename=dgpa%2Ffiles%2F202506%2Fa52331bd-a189-466b-b0f0-cae3062bbf74.csv&name=115.csv&nfix='}),
    2027: Object.freeze({sha256: 'e30df188649bf5347db3ec43fa989af2cc8d93d793fbe5c9891601e6cce4acf3', source: 'https://www.dgpa.gov.tw/FileConversion?filename=dgpa%2Ffiles%2F202607%2Ff538b1ff-ba60-4c63-9477-10db8e6612d1.csv&name=116.csv&nfix='})
  })
});
const DAY=86400000, TAIPEI=8*3600000;
export function isTaiwanWorkingDay(ymd) {
  if(typeof ymd!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const value=Date.parse(ymd+'T00:00:00.000Z');
  if(!Number.isFinite(value)||new Date(value).toISOString().slice(0,10)!==ymd) return null;
  const year=Number(ymd.slice(0,4)), calendar=DAYS[year];
  if(!calendar) return null;
  return calendar[(value-Date.UTC(year,0,1))/DAY]==='1';
}
// Count from the day AFTER documented completion. Return the final Taipei day's
// end in UTC. A missing published year stops the calculation rather than guessing.
export function addTaiwanWorkingDays(instant,count) {
  if(typeof instant!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)||!Number.isSafeInteger(count)||count<1||count>366) return null;
  const ms=Date.parse(instant);
  const datePart=instant.slice(0,10), dateOnly=Date.parse(datePart+'T00:00:00.000Z');
  if(!Number.isFinite(ms)||!Number.isFinite(dateOnly)||new Date(dateOnly).toISOString().slice(0,10)!==datePart) return null;
  let localDay=Math.floor((ms+TAIPEI)/DAY)*DAY, remaining=count;
  if(isTaiwanWorkingDay(new Date(localDay).toISOString().slice(0,10))===null) return null;
  for(let i=0;i<1100&&remaining>0;i++) {
    localDay+=DAY;
    const workday=isTaiwanWorkingDay(new Date(localDay).toISOString().slice(0,10));
    if(workday===null) return null;
    if(workday) remaining--;
  }
  return remaining?null:new Date(localDay+DAY-TAIPEI-1).toISOString();
}
