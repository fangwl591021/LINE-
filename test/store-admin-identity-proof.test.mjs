import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {exactHardAdminWriteGate} from '../worker/store-admin-identity-proof.mjs';

const A='U'+'a'.repeat(32), B='U'+'b'.repeat(32), X='U'+'c'.repeat(32), Y='U'+'d'.repeat(32);
function fixture(t) {
  const db=new DatabaseSync(':memory:'); t.after(()=>db.close());
  db.exec("CREATE TABLE users(line_id TEXT, legacy_line_id TEXT, point_line_id TEXT, role TEXT); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT)");
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(B,A,B,'admin');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(X,Y,B,'user');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(Y,'','','user');
  db.prepare('INSERT INTO user_identity_links VALUES(?,?,?)').run(A,B,'active');
  db.prepare('INSERT INTO user_identity_links VALUES(?,?,?)').run(Y,X,'active');
  const proof={mode:'exact_hard_admin',account_ids:[A,B],ids:[A,B],links:[{old_line_id:A,new_line_id:B}]};
  const actor={line_id:B,legacy_line_id:A,role:'admin'};
  function allowed(p=proof, uid=B, a=actor) {
    const gate=exactHardAdminWriteGate(p,uid,a);
    return db.prepare(`SELECT 1 AS allowed WHERE ${gate.sql}`).get(...gate.args)?.allowed === 1;
  }
  return {db,proof,actor,allowed};
}

test('two verified admin IDs share only their direct active proof; foreign shared wallet does not grant access',t=>{
  const f=fixture(t);
  assert.equal(f.allowed(f.proof,A),true);
  assert.equal(f.allowed(f.proof,B),true);
  assert.throws(()=>f.allowed(f.proof,X));
  assert.throws(()=>f.allowed(f.proof,Y));
  assert.throws(()=>f.allowed(f.proof,B,{...f.actor,role:'user'}));
  assert.throws(()=>f.allowed(f.proof,B,{...f.actor,legacy_line_id:Y}));
});

test('new direct user row, changed link, or a new active link fail the atomic guard',t=>{
  for(const scenario of ['duplicate','disabled','extra-link']) {
    const f=fixture(t);
    if(scenario==='duplicate')f.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(A,'','','user');
    if(scenario==='disabled')f.db.prepare("UPDATE user_identity_links SET status='inactive' WHERE old_line_id=?").run(A);
    if(scenario==='extra-link')f.db.prepare('INSERT INTO user_identity_links VALUES(?,?,?)').run(B,X,'active');
    assert.equal(f.allowed(),false,scenario);
  }
});

test('single UID proof requires the same actor, empty legacy and no active links',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE users(line_id TEXT, legacy_line_id TEXT, point_line_id TEXT, role TEXT); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT)');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(B,'',B,'admin');
  const p={mode:'exact_hard_admin',account_ids:[A,B],ids:[B],links:[]},actor={line_id:B,legacy_line_id:'',role:'admin'};
  const gate=exactHardAdminWriteGate(p,B,actor);
  assert.equal(db.prepare(`SELECT 1 AS allowed WHERE ${gate.sql}`).get(...gate.args).allowed,1);
  assert.throws(()=>exactHardAdminWriteGate(p,A,actor));
  assert.throws(()=>exactHardAdminWriteGate(p,B,{...actor,legacy_line_id:A}));
  db.prepare('INSERT INTO user_identity_links VALUES(?,?,?)').run(A,B,'active');
  assert.equal(db.prepare(`SELECT 1 AS allowed WHERE ${gate.sql}`).get(...gate.args),undefined);
  db.exec('DELETE FROM user_identity_links');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(A,'','','user');
  assert.equal(db.prepare(`SELECT 1 AS allowed WHERE ${gate.sql}`).get(...gate.args),undefined);
});
