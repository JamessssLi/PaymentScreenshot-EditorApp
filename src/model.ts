export interface ReceiptDraft {
  amount: string; payDate: string; payTime: string; transaction: string; barcode: string;
  merchant: string; product: string; company: string; status: string; acquirer: string; method: string;
  orderMode: string; orderHint: string; order: string; clock: string; signal: string; network: string; battery: string;
}
export const defaults: ReceiptDraft = {
  amount: '28.80', payDate: '2026-01-01', payTime: '12:30:00', transaction: '0000012345678901234567890123456', barcode: '000000123456789012345678901',
  merchant: '海棠百货购物中心', product: '日用百货', company: '海棠百货有限公司', status: 'success', acquirer: '海棠收单服务有限公司', method: '零钱',
  orderMode: 'hint', orderHint: '可在支持的商户扫码退款', order: '000000123456789', clock: '12:30', signal: '4', network: '5G', battery: '80',
};
export const statuses: Record<string, string> = { success: '支付成功', pending: '处理中', refunded: '已退款' };
export type RenderModel = ReceiptDraft & { amountDisplay: string; dateDisplay: string; transactionValue: string; barcodeValue: string; orderValue: string; statusDisplay: string };
