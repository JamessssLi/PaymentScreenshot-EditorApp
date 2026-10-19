import type { ReceiptDraft } from './model.ts';
import { normalizeAmount, validDate, validTime } from './validation.ts';

type PaymentInput = Pick<ReceiptDraft, 'amount' | 'payDate' | 'payTime'>;
export function paymentInputKey(input: PaymentInput): string | undefined {
  const amount = normalizeAmount(input.amount);
  if (!amount || !validDate(input.payDate) || !validTime(input.payTime)) return undefined;
  return `${input.payDate}T${input.payTime}|${amount}`;
}
export function generateIdentifiers(input: PaymentInput, entropy?: string): { transaction: string; barcode: string } | undefined {
  if (!paymentInputKey(input)) return undefined;
  const digits = entropy ?? Array.from(crypto.getRandomValues(new Uint8Array(32)), value => String(value % 10)).join('');
  if (!/^\d{32}$/.test(digits)) throw new Error('编号生成失败，请重新生成。');
  const date = input.payDate.replaceAll('-', '');
  // 仅复用可观察的长度与日期位置；尾部为本地数字，不推断支付平台校验算法。
  return { transaction: `420000${digits.slice(0, 4)}${date}${digits.slice(4, 14)}`, barcode: `${date}${digits.slice(14)}` };
}
