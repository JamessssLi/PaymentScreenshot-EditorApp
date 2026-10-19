import JsBarcode from 'jsbarcode';
import { template } from './template.ts';
export function makeBarcode(value: string): HTMLCanvasElement {
  const data: { encodings?: { data: string }[] } = {};
  JsBarcode(data, value, { format: 'CODE128', displayValue: false });
  const modules = data.encodings!.reduce((total, item) => total + item.data.length, 0);
  // 每个模块占整数个导出像素；左右各保留至少 10 个模块静区。
  const maxModuleWidth = Math.floor((template.width - 100) / (modules + 20));
  const moduleWidth = Math.min(maxModuleWidth, Math.max(2, Math.round(template.barcode.targetBarsWidth / modules)));
  if (moduleWidth < 2) throw new Error('条码过宽，请缩短条码内容。');
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, { format: 'CODE128', width: moduleWidth, height: template.barcode.height, margin: 0, marginLeft: moduleWidth * 10, marginRight: moduleWidth * 10, marginTop: 0, marginBottom: 0, displayValue: false, background: '#ffffff', lineColor: '#000000' });
  return canvas;
}
