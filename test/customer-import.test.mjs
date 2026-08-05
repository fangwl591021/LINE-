import assert from 'node:assert/strict';
import { normalizeCustomer, normalizeEmail, normalizePhone, resolveImportResolution, safeSpreadsheetText, validateCustomer } from '../worker/customer-import.mjs';

assert.equal(normalizePhone('+886 912-345-678'), '0912345678');
assert.equal(normalizePhone('0912-345-678'), '0912345678');
assert.equal(normalizeEmail(' Tony@Example.COM '), 'tony@example.com');
assert.equal(normalizeEmail('not-an-email'), '');
assert.equal(safeSpreadsheetText('=HYPERLINK("https://bad")'), "'=HYPERLINK(\"https://bad\")");
assert.equal(safeSpreadsheetText('+886912345678'), '+886912345678');
assert.equal(resolveImportResolution('create', 'skip'), 'create');
assert.equal(resolveImportResolution('duplicate', 'fill_blanks'), 'fill_blanks');
assert.equal(resolveImportResolution('duplicate', 'create'), 'skip');
assert.equal(resolveImportResolution('error', 'create'), 'skip');

const customer = normalizeCustomer({
  '姓名': ' 王小明 ',
  '手機號碼': '+886 912-345-678',
  Email: 'USER@EXAMPLE.COM',
  '公司名稱': '範例公司',
  '客戶狀態': 'qualified'
});
assert.deepEqual(customer.name, '王小明');
assert.equal(customer.normalizedMobile, '0912345678');
assert.equal(customer.normalizedEmail, 'user@example.com');
assert.equal(customer.status, 'qualified');
assert.deepEqual(validateCustomer(customer), []);
assert.deepEqual(validateCustomer(normalizeCustomer({ name: '', email: 'bad' })), ['NAME_REQUIRED', 'EMAIL_INVALID']);

console.log('Customer import normalization tests passed.');
