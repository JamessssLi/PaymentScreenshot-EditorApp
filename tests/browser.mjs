import { chromium } from 'playwright';
import { mkdir, copyFile, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = path.join(root, 'verification'); await mkdir(evidence, { recursive: true });
const isolated = await import('node:fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'receipt-editor-isolated-')));
await copyFile(path.join(root, 'dist/receipt-editor.html'), path.join(isolated, 'receipt-editor.html'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York', acceptDownloads: true });
const page = await context.newPage(); const external = []; const pageErrors = [];
page.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto(pathToFileURL(path.join(isolated, 'receipt-editor.html')).href);
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor();
assert.doesNotMatch(await page.locator('body').innerText(), /DEMO|模拟|演示|测试/i, '界面不添加前缀或标识');
const defaultSize = await page.locator('#preview').evaluate(canvas => [canvas.width, canvas.height]);
assert.equal(defaultSize[0], 1279);
assert.ok(defaultSize[1] > 2000 && defaultSize[1] < 2781, '短内容跟随排版，不保留固定条码纵坐标');
assert.deepEqual(await readdir(isolated), ['receipt-editor.html'], '隔离目录只包含一个 HTML');
assert.equal(await page.locator('#more').getAttribute('open'), null);
for (const [width, height] of [[1440, 1000], [1366, 768], [1280, 800]]) {
  await page.setViewportSize({ width, height });
  const buttonBox = await page.locator('#export').boundingBox();
  assert.ok(buttonBox.y + buttonBox.height <= height, `${width} × ${height} 首屏有导出按钮`);
}
await page.setViewportSize({ width: 1440, height: 1000 });
const expectedExports = {};
async function save(name) {
  const expectedBarcode = await page.locator('#barcode').inputValue();
  const previewData = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
  const pending = page.waitForEvent('download'); await page.locator('#export').click(); const download = await pending;
  const output = path.join(evidence, `${name}.png`); await download.saveAs(output);
  assert.equal((await readFile(output)).toString('base64'), previewData.split(',')[1], '导出与预览像素一致');
  await page.getByText('PNG 已生成，请在浏览器下载列表中查看。', { exact: true }).waitFor();
  expectedExports[name] = expectedBarcode;
}
await page.screenshot({ path: path.join(evidence, 'editor-desktop.png'), fullPage: true });
await save('default');
async function inputValues(keys) {
  return Object.fromEntries(await Promise.all(keys.map(async key => [key, await page.locator(`#${key}`).inputValue()])));
}
const paymentFields = ['amount', 'payDate', 'payTime', 'transaction', 'barcode', 'status', 'orderMode', 'orderHint', 'order', 'clock', 'battery'];
const beforePreset = await inputValues(paymentFields);
assert.equal(await page.locator('#merchant-preset option').count(), 3);
await page.locator('#merchant-preset').selectOption('like-lai');
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor();
assert.equal(await page.locator('#merchant').inputValue(), '青岛利客来集团股份有限公司购物中心');
assert.equal(await page.locator('#product').inputValue(), await page.locator('#merchant').inputValue());
assert.equal(await page.locator('#company').inputValue(), await page.locator('#merchant').inputValue());
assert.equal(await page.locator('#acquirer').inputValue(), '银联商务支付股份有限公司');
assert.equal(await page.locator('#acquirerNote').inputValue(), '');
assert.equal(await page.locator('#method').inputValue(), '零钱');
assert.equal(await page.locator('#more').getAttribute('open'), null, '更多字段折叠时也可应用预设');
assert.deepEqual(await inputValues(paymentFields), beforePreset, '预设不覆盖金额、时间、编号和其他状态');
assert.match(await page.locator('#preset-avatar').getAttribute('src'), /^data:image\/png;base64,/);
const colorfulIcon = await page.locator('#preview').evaluate(canvas => {
  const pixels = canvas.getContext('2d').getImageData(577, 411, 125, 125).data;
  let count = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) count++;
  return count;
});
assert.ok(colorfulIcon > 3000, '内嵌彩色头像实际进入预览与导出');
await save('merchant-like-lai');
await page.locator('#merchant-preset').selectOption('haipai-yiyue');
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor();
assert.equal(await page.locator('#merchant').inputValue(), '市北区海派怡悦餐厅');
assert.equal(await page.locator('#acquirerNote').inputValue(), '由中国银联股份有限公司提供收款清算服务');
assert.deepEqual(await inputValues(paymentFields), beforePreset);
await save('merchant-haipai');
await page.screenshot({ path: path.join(evidence, 'editor-presets.png'), fullPage: true });
// 连续选择只接受最后一次头像载入，选择后立即编辑也不会被异步回写覆盖。
await page.evaluate(() => {
  const select = document.querySelector('#merchant-preset');
  select.value = 'like-lai'; select.dispatchEvent(new Event('change'));
  select.value = 'haipai-yiyue'; select.dispatchEvent(new Event('change'));
});
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor();
assert.equal(await page.locator('#merchant-preset').inputValue(), 'haipai-yiyue');
assert.equal(await page.locator('#merchant').inputValue(), '市北区海派怡悦餐厅');
await page.evaluate(() => {
  const select = document.querySelector('#merchant-preset');
  select.value = 'like-lai'; select.dispatchEvent(new Event('change'));
  const merchant = document.querySelector('#merchant'); merchant.value = '手动填写的商户'; merchant.dispatchEvent(new Event('input'));
});
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor();
assert.equal(await page.locator('#merchant').inputValue(), '手动填写的商户');
assert.equal(await page.locator('#merchant-preset').inputValue(), '', '手动编辑后转为自定义');
await page.reload(); await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor();
assert.equal(await page.locator('#merchant-preset').inputValue(), '', '刷新不预选真实商家');
async function checkGeneratedDate(date) {
  const transaction = await page.locator('#transaction').inputValue();
  const barcode = await page.locator('#barcode').inputValue();
  assert.match(transaction, /^\d{28}$/); assert.match(barcode, /^\d{26}$/);
  assert.equal(transaction.slice(10, 18), date.replaceAll('-', ''));
  assert.equal(barcode.slice(0, 8), date.replaceAll('-', ''));
  return { transaction, barcode };
}
await checkGeneratedDate('2026-01-01');
await page.locator('#payDate').fill('2027-01-01'); await page.locator('#payTime').fill('00:00:00');
await checkGeneratedDate('2027-01-01');
await page.locator('#generation-status').filter({ hasText: '2027-01-01 00:00:00' }).waitFor();
await save('auto-new-year');
const beforeSecond = await page.locator('#barcode').inputValue();
await page.locator('#payTime').fill('00:00:01');
assert.notEqual(await page.locator('#barcode').inputValue(), beforeSecond, '秒变化重新生成');
const beforePrice = await page.locator('#barcode').inputValue();
await page.locator('#amount').fill('39.5');
assert.notEqual(await page.locator('#barcode').inputValue(), beforePrice, '金额变化重新生成');
const normalizedPrice = await page.locator('#barcode').inputValue();
await page.locator('#amount').fill('39.50');
assert.equal(await page.locator('#barcode').inputValue(), normalizedPrice, '等价金额不反复生成');
await page.locator('#payDate').fill('2024-02-29'); await save('auto-leap'); await checkGeneratedDate('2024-02-29');
await page.locator('#barcode').fill('00000123');
const beforeManualDate = await page.locator('#transaction').inputValue();
await page.locator('#payDate').fill('2026-12-31');
assert.equal(await page.locator('#barcode').inputValue(), '00000123', '手动条码不被覆盖');
assert.notEqual(await page.locator('#transaction').inputValue(), beforeManualDate, '另一自动字段继续跟随时间');
await page.locator('#transaction').fill('00000456'); await page.locator('#amount').fill('12.30');
assert.equal(await page.locator('#transaction').inputValue(), '00000456');
assert.equal(await page.locator('#barcode').inputValue(), '00000123');
await page.locator('#generation-status').filter({ hasText: '已手动修改' }).waitFor();
await page.locator('#regenerate').click(); await checkGeneratedDate('2026-12-31');
await page.locator('#amount').fill('28.80'); await page.locator('#payDate').fill('2026-01-01');
await page.locator('#payTime').fill('08:09');
assert.ok(await page.locator('#export').isEnabled(), '零秒控件值不能导致校验失败');
await save('zero-seconds');
await page.locator('#payTime').fill('12:30:00');
const beforeZoom = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
await page.locator('#zoom').selectOption('1');
assert.equal(await page.locator('#preview').evaluate(canvas => canvas.toDataURL()), beforeZoom, '缩放不改变导出像素');
await page.locator('#zoom').selectOption('fit');
// 强制一次 Canvas 失败，确认用户能看到提示并可继续使用。
await page.evaluate(() => {
  window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
});
await page.locator('#export').click();
await page.getByText('图片导出失败，请重试或更换浏览器。', { exact: true }).waitFor();
assert.ok(await page.locator('#export').isEnabled());
await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
// 延缓编码并重复提交；期间编辑表单，下载仍应对应点击时的快照。
await page.evaluate(() => {
  HTMLCanvasElement.prototype.toBlob = function (...args) {
    setTimeout(() => window.originalToBlob.apply(this, args), 150);
  };
});
const snapshot = await page.locator('#preview').evaluate(canvas => canvas.toDataURL());
const snapshotBarcode = await page.locator('#barcode').inputValue();
let downloadCount = 0;
const countDownload = () => { downloadCount++; }; page.on('download', countDownload);
const downloadPending = page.waitForEvent('download');
await page.locator('#export').click();
await page.evaluate(() => { document.querySelector('#form').requestSubmit(); document.querySelector('#form').requestSubmit(); });
await page.locator('#amount').fill('39.90');
const snapshotDownload = await downloadPending;
const snapshotPath = path.join(evidence, 'snapshot.png'); await snapshotDownload.saveAs(snapshotPath);
await page.getByText('PNG 已生成，请在浏览器下载列表中查看。', { exact: true }).waitFor();
assert.equal(downloadCount, 1, '重复提交只生成一次下载'); page.off('download', countDownload);
assert.equal((await readFile(snapshotPath)).toString('base64'), snapshot.split(',')[1], '导出使用点击时的快照');
expectedExports.snapshot = snapshotBarcode;
await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
await page.locator('#amount').fill('28.80');
const cases = [['barcode-short', 'A'], ['barcode-long', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'], ['barcode-mixed', 'aZ-000123-9X']];
for (const [name, value] of cases) { await page.locator('#barcode').fill(value); await save(name); }
await page.locator('#amount').fill('-1'); assert.ok(await page.locator('#export').isDisabled());
await page.locator('#amount').fill('999999999.99'); await page.locator('#transaction').fill('0'.repeat(63) + '1');
await page.locator('#barcode').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
await page.locator('summary').click();
await page.locator('#merchant').fill('北岸百货中心'.repeat(16));
await page.locator('#product').fill('多行商品说明用于检查布局测量与动态换行。'.repeat(5));
await page.locator('#company').fill('北岸百货有限公司'.repeat(10));
await page.locator('#orderMode').selectOption('number'); await page.locator('#order').fill('0'.repeat(63) + '2');
await page.locator('#payDate').fill('2024-02-29'); await page.locator('#payTime').fill('23:59:58');
// 使用 5 MB 的有效 PNG（浏览器实际解码），检验最大允许文件。
const smallPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWWQAAAAASUVORK5CYII=', 'base64');
const largePng = Buffer.concat([smallPng, Buffer.alloc(5 * 1024 * 1024 - smallPng.length)]);
await page.locator('#icon').setInputFiles({ name: 'five-mb.png', mimeType: 'image/png', buffer: largePng });
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor(); await save('long-layout-max-icon');
await page.locator('#icon').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not a png') });
await page.locator('#icon-error').filter({ hasText: '文件内容不是有效' }).waitFor(); assert.ok(await page.locator('#export').isDisabled());
await page.locator('#icon').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: smallPng.subarray(0, 8) });
await page.locator('#icon-error').filter({ hasText: '图片无法解码' }).waitFor(); assert.ok(await page.locator('#export').isDisabled());
await page.locator('#icon').setInputFiles({ name: 'oversize.png', mimeType: 'image/png', buffer: Buffer.concat([largePng, Buffer.from('a')]) });
await page.locator('#icon-error').filter({ hasText: '超过 5 MB' }).waitFor(); assert.ok(await page.locator('#export').isDisabled());
await page.locator('#default-icon').click(); await save('recovered-icon');
const jpeg = await page.evaluate(() => {
  const iconCanvas = document.createElement('canvas'); iconCanvas.width = 80; iconCanvas.height = 40;
  const ctx = iconCanvas.getContext('2d'); ctx.fillStyle = '#27664f'; ctx.fillRect(0, 0, 80, 40);
  return iconCanvas.toDataURL('image/jpeg').split(',')[1];
});
await page.locator('#icon').setInputFiles({ name: 'local-icon.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
await page.locator('#preview-state').filter({ hasText: '已同步' }).waitFor(); await save('jpeg-icon');
const longProduct = await page.locator('#product').inputValue();
await page.locator('#product').fill('字' + '\n'.repeat(99));
await page.locator('#feedback').filter({ hasText: '内容过长' }).waitFor();
assert.ok(await page.locator('#export').isDisabled());
await page.locator('#product').fill(longProduct);
await page.locator('#merchant').fill('<img src=x onerror=alert(1)>'); await save('literal-text'); assert.equal(await page.locator('#merchant img').count(), 0);
await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(evidence, 'editor-narrow.png'), fullPage: true });
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
const timezonePage = await browser.newPage({ timezoneId: 'Asia/Tokyo', offline: true }); await timezonePage.goto(pathToFileURL(path.join(isolated, 'receipt-editor.html')).href);
await timezonePage.locator('#payDate').fill('2024-02-29'); await timezonePage.locator('#payTime').fill('23:59:58');
assert.equal(await timezonePage.locator('#payTime').inputValue(), '23:59:58'); assert.equal(await timezonePage.locator('#payDate').inputValue(), '2024-02-29');
await timezonePage.close();
assert.deepEqual(external, []); assert.deepEqual(pageErrors, []);
await page.reload();
assert.equal(await page.locator('#amount').inputValue(), '28.80', '刷新恢复虚构默认值');
await writeFile(path.join(evidence, 'export-expectations.json'), JSON.stringify(expectedExports, null, 2));
await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ browser: await browser.version(), platform: `${os.platform()} ${os.arch()}`, htmlSha256: createHash('sha256').update(await readFile(path.join(isolated, 'receipt-editor.html'))).digest('hex'), isolatedDirectory: isolated, offline: true, externalRequests: external, pageErrors, exported: Object.keys(expectedExports), checks: ['两项商家预设在折叠状态下一次填充信息和内嵌头像，交易相关字段保持不变', '连续预设切换与载入期间手动编辑无异步覆盖，刷新回到自定义商户', '自动编号随跨年、闰日、秒与金额变化更新，规范等价金额保持稳定', '手动字段不被覆盖，另一自动字段继续更新，恢复自动可用', 'Apple 系统字体栈与无斜体条码文字', 'file:// 新目录只含一个 HTML 独立打开', '离线编辑、5 MB PNG / JPEG 图标上传、PNG 下载', '预览与导出 PNG 完全一致，缩放不改变像素', '金额错误禁止导出', '伪造、无法解码与超大图片禁止导出、默认图标恢复', '最长编号、长中文换行、超高布局拦截', '1440×1000、1366×768、1280×800 常用字段及导出首屏可见', '窄屏无页面横向溢出', '纽约/东京时区保留墙上日期时间与秒、零秒输入', 'Canvas 导出失败可恢复、重复提交只下载一次、点击快照稳定', '刷新恢复默认值'] }, null, 2));
console.log(`浏览器验证完成，证据：${evidence}`);
} finally { await browser.close(); }
