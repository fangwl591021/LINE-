// Offline, reviewed catalog import. Does not connect to production or create accounts.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {reviewedIndustries} from './aiwe-partner-industries.mjs';
const quoted=value=>"'"+String(value||'').replaceAll("'","''")+"'";
const normalized=value=>String(value||'').replace(/[\s()\-]/g,'').toLowerCase();
export const partnerHandle=id=>'partner_'+createHash('sha256').update('aiwe.cc/linecard_13/'+id).digest('hex').slice(0,32);
// Manual review: company already listed; leave identity/ownership unmodified.
const reviewHolds={'898':'介紹指向已上架的米樂數位行銷，待確認是否需獨立店面'};
export function prepareImport(candidates,existing){
  const approved=[],skipped=[];const seen=[...existing];
  for(const row of candidates){
    const reasons=[...(row.reasons||[])];
    if(!/^\d+$/.test(row.source_id)||row.source_url!==`https://aiwe.cc/index.php/linecard_13/${row.source_id}/?share=1`)reasons.push('來源識別無效');
    if(reviewHolds[row.source_id])reasons.push(reviewHolds[row.source_id]);
    const handle=partnerHandle(row.source_id);
    const duplicate=seen.find(other=>other.partner_handle===handle||normalized(other.name)===normalized(row.name)||(row.phone&&normalized(other.phone)===normalized(row.phone)));
    if(duplicate)reasons.push('已存在相同來源／名稱／電話：'+duplicate.name);
    if(!row.name||!row.description||!/^https:\/\//.test(row.image_url||'')||(!row.phone&&!row.line_url&&!row.website_url))reasons.push('必要資料不足');
    if(reasons.length){skipped.push({source_id:row.source_id,name:row.name,reasons});continue;}
    approved.push({...row,category:reviewedIndustries[row.source_id]?.[0]||'',partner_handle:handle});seen.push({...row,partner_handle:handle});
  }
  const statements=[];
  for(const row of approved){
    // No policy rows: missing policy is disabled by the existing directory contract.
    statements.push(`INSERT INTO point_redemption_partners (partner_handle,name,category,summary,description,cover_image_url,phone,line_url,website_url,status) SELECT ${[row.partner_handle,row.name,row.category,row.description.slice(0,200),row.description,row.image_url,row.phone,row.line_url,row.website_url,'active'].map(quoted).join(',')} WHERE NOT EXISTS (SELECT 1 FROM point_redemption_partners WHERE partner_handle=${quoted(row.partner_handle)} OR name=${quoted(row.name)}) AND NOT EXISTS (SELECT 1 FROM store_shop_stores WHERE name=${quoted(row.name)}) ON CONFLICT(partner_handle) DO NOTHING;`);
    statements.push(`INSERT INTO point_redemption_partner_locations (partner_id,location_handle,branch_name,city,address,maps_url,phone,business_hours,status) SELECT partner_id,${['location_'+row.partner_handle.slice(8),'',row.region,row.address,row.maps_url,row.phone,row.hours,'active'].map(quoted).join(',')} FROM point_redemption_partners WHERE partner_handle=${quoted(row.partner_handle)} ON CONFLICT(location_handle) DO NOTHING;`);
  }
  return {approved,skipped,sql:statements.join('\n')+'\n'};
}
async function main(){
  const folder=path.resolve('.wrangler/partner-import-20260919');
  const {candidates}=JSON.parse(await readFile(path.join(folder,'candidates.json'),'utf8'));
  // Snapshot is supplied from the immediately preceding read-only production check.
  const existing=JSON.parse(await readFile(path.join(folder,'existing.json'),'utf8'));
  const report=prepareImport(candidates,existing);await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'import.sql'),report.sql);
  await writeFile(path.join(folder,'reviewed.json'),JSON.stringify({approved:report.approved,skipped:report.skipped},null,2));
  await writeFile(path.join(folder,'rollback.sql'),`UPDATE point_redemption_partners SET status='hidden',updated_at=CURRENT_TIMESTAMP WHERE partner_handle IN (${report.approved.map(row=>quoted(row.partner_handle)).join(',')});\n`);
  console.log(JSON.stringify({approved:report.approved.length,skipped:report.skipped,folder},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
