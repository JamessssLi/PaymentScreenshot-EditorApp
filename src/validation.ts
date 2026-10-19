import { statuses, type ReceiptDraft, type RenderModel } from './model.ts';
export type Errors = Partial<Record<keyof ReceiptDraft, string>>;
export function normalizeAmount(value: string): string | undefined {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return undefined;
  const [integer, decimal = ''] = value.split('.');
  return `${integer.replace(/^0+(?=\d)/, '')}.${decimal.padEnd(2, '0')}`;
}
export function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}
export function validDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
export function validate(draft: ReceiptDraft): { errors: Errors; model?: RenderModel } {
  const errors: Errors = {};
  const amountDisplay = normalizeAmount(draft.amount);
  if (!amountDisplay) errors.amount = '请输入非负金额：最多 9 位整数、2 位小数。';
  if (!validDate(draft.payDate)) errors.payDate = '请选择有效日期（年份 0001–9999）。';
  if (!validTime(draft.payTime)) errors.payTime = '请填写完整时间，包含时、分、秒。';
  for (const key of ['transaction', 'barcode', ...(draft.orderMode === 'number' ? ['order'] : [])] as (keyof ReceiptDraft)[]) {
    const limit = key === 'barcode' ? 32 : 64;
    if (!new RegExp(`^[A-Za-z0-9-]{1,${limit}}$`).test(draft[key])) errors[key] = `请输入 1–${limit} 位 ASCII 字母、数字或连字符。`;
  }
  for (const key of ['merchant', 'product', 'company', 'acquirer', 'acquirerNote', 'method', 'network', ...(draft.orderMode === 'hint' ? ['orderHint'] : [])] as (keyof ReceiptDraft)[]) {
    if (!draft[key].trim() && key !== 'acquirerNote') errors[key] = '请填写内容，不能仅有空格。';
    else if (Array.from(draft[key]).length > 100) errors[key] = '请缩短至 100 个 Unicode 字符以内。';
    else if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(draft[key])) errors[key] = '请移除不可见的控制字符。';
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.clock)) errors.clock = '请填写有效的时、分。';
  if (!/^[0-4]$/.test(draft.signal)) errors.signal = '请选择 0–4 格信号。';
  if (!/^\d{1,3}$/.test(draft.battery) || Number(draft.battery) > 100) errors.battery = '请输入 0–100 的整数。';
  if (!Object.hasOwn(statuses, draft.status)) errors.status = '请选择列表中的状态。';
  if (!['hint', 'number'].includes(draft.orderMode)) errors.orderMode = '请选择显示方式。';
  if (Object.keys(errors).length) return { errors };
  const [year, month, day] = draft.payDate.split('-');
  return { errors, model: { ...draft, amountDisplay: amountDisplay!, dateDisplay: `${year}年${Number(month)}月${Number(day)}日 ${draft.payTime}`, transactionValue: draft.transaction, barcodeValue: draft.barcode, orderValue: draft.orderMode === 'number' ? draft.order : draft.orderHint, statusDisplay: statuses[draft.status] } };
}
