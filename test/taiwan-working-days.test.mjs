import test from 'node:test';
import assert from 'node:assert/strict';
import {isTaiwanWorkingDay,addTaiwanWorkingDays,TAIWAN_WORKING_CALENDAR} from '../worker/taiwan-working-days.mjs';

test('official work calendar includes national holidays and ordinary workdays',()=>{
  for(const date of ['2026-01-01','2026-02-16','2026-02-20','2026-09-28','2026-10-09','2026-10-26','2026-12-25','2027-01-01']) assert.equal(isTaiwanWorkingDay(date),false,date);
  for(const date of ['2026-01-02','2026-10-27','2026-12-28','2027-01-04']) assert.equal(isTaiwanWorkingDay(date),true,date);
  assert.equal(TAIWAN_WORKING_CALENDAR.years[2026].sha256.length,64);
});
test('ten working days skips holidays, weekends and year boundary in Taipei',()=>{
  assert.equal(addTaiwanWorkingDays('2026-10-23T10:00:00.000Z',10),'2026-11-09T15:59:59.999Z');
  assert.equal(addTaiwanWorkingDays('2026-12-24T01:00:00.000Z',10),'2027-01-11T15:59:59.999Z');
  assert.equal(addTaiwanWorkingDays('2026-12-31T16:01:00.000Z',1),'2027-01-04T15:59:59.999Z');
});
test('unpublished calendar and invalid inputs are held rather than guessed',()=>{
  assert.equal(isTaiwanWorkingDay('2028-01-03'),null);
  assert.equal(isTaiwanWorkingDay('2026-02-30'),null);
  assert.equal(addTaiwanWorkingDays('2027-12-30T01:00:00Z',10),null);
  assert.equal(addTaiwanWorkingDays('2026-01-01',10),null);
  assert.equal(addTaiwanWorkingDays('2026-02-30T00:00:00Z',10),null);
  assert.equal(addTaiwanWorkingDays('2026-01-01T00:00:00Z',-1),null);
});
