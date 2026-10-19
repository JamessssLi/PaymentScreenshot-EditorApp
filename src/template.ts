export const template = {
  width: 1279, maxHeight: 6000, margin: 95, valueX: 418, valueWidth: 765,
  font: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif',
  ink: '#101010', muted: '#858b86', line: '#eeeeee',
  bodySize: 52, lineHeight: 73, rowGap: 30,
  noteSize: 44, noteLineHeight: 62, noteGap: 16,
  barcode: { targetBarsWidth: 900, height: 194, textSize: 52, textGap: 17, afterRows: 41, footerGap: 200 },
  rows: [ ['当前状态', 'statusDisplay'], ['支付时间', 'dateDisplay'], ['商品', 'product'], ['商户全称', 'company'], ['收单机构', 'acquirer'], ['支付方式', 'method'], ['交易单号', 'transactionValue'], ['商户单号', 'orderValue'] ] as const,
};
