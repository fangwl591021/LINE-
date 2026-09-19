// Offline CAS plan only. A separate explicit release step executes the reviewed SQL.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {reviewedIndustries} from './aiwe-partner-industries.mjs';
import {partnerHandle} from './prepare-aiwe-import.mjs';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export function industryCorrection(rows){
  const update=[],rollback=[],counts={};
  if(rows.length!==42||new Set(rows.map(r=>r.source_id)).size!==42)throw Error('Expected the original 42 reviewed listings');
  for(const row of rows){
    const category=reviewedIndustries[row.source_id]?.[0];
    if(!category||row.partner_handle!==partnerHandle(row.source_id))throw Error('Unreviewed source');
    const target=`partner_handle=${quote(row.partner_handle)} AND name=${quote(row.name)} AND description=${quote(row.description)}`;
    update.push(`UPDATE point_redemption_partners SET category=${quote(category)},updated_at=CURRENT_TIMESTAMP WHERE ${target} AND COALESCE(category,'')='';`);
    rollback.push(`UPDATE point_redemption_partners SET category='',updated_at=CURRENT_TIMESTAMP WHERE ${target} AND category=${quote(category)};`);
    counts[category]=(counts[category]||0)+1;
  }
  return {sql:update.join('\n'),rollback:rollback.join('\n'),counts};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const folder=path.resolve('.wrangler/partner-import-20260919');
  const plan=industryCorrection(JSON.parse(await readFile(path.join(folder,'reviewed.json'),'utf8')).approved);
  await writeFile(path.join(folder,'industry-correction.sql'),plan.sql+'\n');
  await writeFile(path.join(folder,'industry-rollback.sql'),plan.rollback+'\n');
  console.log(JSON.stringify({counts:plan.counts,folder}));
}
