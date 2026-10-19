import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/model.ts';
import { validate, validDate } from '../src/validation.ts';
import { generateIdentifiers, paymentInputKey } from '../src/identifiers.ts';
test('金额以十进制字符串规范化，拒绝负数、三位小数与超长整数', () => {
  for (const [input, expected] of [['0', '0.00'], ['20', '20.00'], ['28.80', '28.80'], ['000001.2', '1.20'], ['999999999.99', '999999999.99']]) assert.equal(validate({ ...defaults, amount: input }).model?.amountDisplay, expected);
  for (const amount of ['-1', '1.234', '1000000000', '', '1e3', 'NaN']) assert.ok(validate({ ...defaults, amount }).errors.amount);
});
test('校验真实日历与闰日，墙上时间和秒原样保存', () => {
  for (const date of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.ok(validDate(date));
  for (const date of ['2025-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '0000-01-01', '']) assert.ok(!validDate(date));
  const result = validate({ ...defaults, payDate: '2024-02-29', payTime: '23:59:58', clock: '01:02' });
  assert.equal(result.model?.dateDisplay, '2024年2月29日 23:59:58'); assert.equal(result.model?.clock, '01:02');
  for (const payTime of ['12:30', '24:00:00', '12:61:00']) assert.ok(validate({ ...defaults, payTime }).errors.payTime);
});
test('编号为独立字符串，保留前导零且不添加前缀', () => {
  const result = validate({ ...defaults, transaction: '000001', barcode: '000002', orderMode: 'number', order: '000003' });
  assert.equal(result.model?.transactionValue, '000001'); assert.equal(result.model?.barcodeValue, '000002'); assert.equal(result.model?.orderValue, '000003');
  for (const barcode of ['', 'A'.repeat(33), '中文', 'a b', '<script>']) assert.ok(validate({ ...defaults, barcode }).errors.barcode);
  for (const barcode of ['A', 'A'.repeat(32), 'Abc-012345']) assert.ok(validate({ ...defaults, barcode }).model);
  assert.ok(validate({ ...defaults, transaction: '0'.repeat(64), orderMode: 'number', order: '0'.repeat(64) }).model);
  assert.ok(validate({ ...defaults, transaction: '0'.repeat(65) }).errors.transaction);
  assert.ok(validate({ ...defaults, orderMode: 'number', order: '0'.repeat(65) }).errors.order);
});
test('Unicode 码点上限、隐藏字段与枚举校验', () => {
  assert.ok(validate({ ...defaults, merchant: '😀'.repeat(100) }).model);
  assert.ok(validate({ ...defaults, merchant: '😀'.repeat(101) }).errors.merchant);
  assert.ok(validate({ ...defaults, order: '', orderMode: 'hint' }).model);
  for (const battery of ['-1', '101', '1.5', '']) assert.ok(validate({ ...defaults, battery }).errors.battery);
  assert.ok(validate({ ...defaults, status: 'toString' }).errors.status);
  assert.ok(validate({ ...defaults, merchant: '  ' }).errors.merchant);
});
test('自动编号只使用有效输入，保持日期八位与样例结构长度', () => {
  const entropy = '01234567890123456789012345678901';
  for (const payDate of ['0001-01-01', '2024-02-29', '2026-12-31', '2027-01-01']) {
    const ids = generateIdentifiers({ amount: '28.80', payDate, payTime: '00:00:00' }, entropy)!;
    const date = payDate.replaceAll('-', '');
    assert.match(ids.transaction, /^\d{28}$/);
    assert.equal(ids.transaction.slice(10, 18), date);
    assert.match(ids.barcode, /^\d{26}$/);
    assert.equal(ids.barcode.slice(0, 8), date);
    assert.notEqual(ids.barcode, ids.transaction);
  }
  assert.equal(generateIdentifiers({ ...defaults, amount: '-1' }), undefined);
  assert.equal(generateIdentifiers({ ...defaults, payDate: '2025-02-29' }), undefined);
  assert.equal(generateIdentifiers({ ...defaults, payTime: '24:00:00' }), undefined);
});
test('自动生成输入键包含秒和金额，规范等价金额保持稳定，不依赖时区', () => {
  assert.equal(paymentInputKey({ ...defaults, amount: '28.8' }), paymentInputKey({ ...defaults, amount: '28.80' }));
  assert.notEqual(paymentInputKey(defaults), paymentInputKey({ ...defaults, payTime: '12:30:01' }));
  assert.notEqual(paymentInputKey(defaults), paymentInputKey({ ...defaults, amount: '28.81' }));
  assert.equal(paymentInputKey({ amount: '0', payDate: '2024-02-29', payTime: '00:00:00' }), '2024-02-29T00:00:00|0.00');
});
test('可选收单机构说明允许留空，仍校验长度与控制字符', () => {
  assert.ok(validate({ ...defaults, acquirerNote: '' }).model);
  assert.ok(validate({ ...defaults, acquirerNote: '由清算机构提供服务\n说明可以换行' }).model);
  assert.ok(validate({ ...defaults, acquirerNote: '😀'.repeat(100) }).model);
  assert.ok(validate({ ...defaults, acquirerNote: '😀'.repeat(101) }).errors.acquirerNote);
  assert.ok(validate({ ...defaults, acquirerNote: '\u0001' }).errors.acquirerNote);
});
