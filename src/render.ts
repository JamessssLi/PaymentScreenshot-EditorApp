import type { RenderModel } from './model.ts';
import { template as t } from './template.ts';
import { makeBarcode } from './barcode.ts';

export interface Layout {
  height: number;
  navigationY: number;
  iconY: number;
  merchantY: number;
  merchantLines: string[];
  amountY: number;
  rows: { label: string; lines: string[]; y: number; noteLines: string[]; noteY: number }[];
  barcodeY: number;
  barcode: HTMLCanvasElement;
  networkLines: string[];
  footerY: number;
}
function font(ctx: CanvasRenderingContext2D, size: number, weight = 400) {
  ctx.font = `${weight} ${size}px ${t.font}`;
}
export function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const character of Array.from(value)) {
    if (character === '\n') { lines.push(line); line = ''; continue; }
    if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = character; }
    else line += character;
  }
  lines.push(line); return lines;
}
export function layout(ctx: CanvasRenderingContext2D, model: RenderModel): Layout {
  font(ctx, 49, 500);
  const networkLines = wrap(ctx, model.network, 146);
  const navigationY = Math.max(203, 76 + networkLines.length * 64 + 63);
  const iconY = navigationY + 208;
  const merchantY = navigationY + 417;
  font(ctx, 60);
  const merchantLines = wrap(ctx, model.merchant, 1090);
  const amountY = merchantY + 175 + (merchantLines.length - 1) * 78;
  let y = amountY + 376;
  const rows = t.rows.map(([label, key]) => {
    font(ctx, t.bodySize);
    const lines = wrap(ctx, model[key], t.valueWidth);
    const noteY = y + lines.length * t.lineHeight + t.noteGap;
    font(ctx, t.noteSize);
    const noteLines = key === 'acquirer' && model.acquirerNote.trim() ? wrap(ctx, model.acquirerNote, t.valueWidth) : [];
    const row = { label, lines, y, noteLines, noteY };
    y += lines.length * t.lineHeight + (noteLines.length ? t.noteGap + noteLines.length * t.noteLineHeight : 0) + t.rowGap;
    return row;
  });
  const barcodeY = y + t.barcode.afterRows;
  const barcode = makeBarcode(model.barcodeValue);
  const footerY = barcodeY + barcode.height + t.barcode.footerGap;
  const height = Math.ceil(footerY + 175);
  if (height > t.maxHeight) throw new Error(`内容过长，图片高度上限为 ${t.maxHeight} 像素，请缩短商户或详情文字。`);
  return { height, navigationY, iconY, merchantY, merchantLines, amountY, rows, barcodeY, barcode, networkLines, footerY };
}
export function render(canvas: HTMLCanvasElement, model: RenderModel, icon: HTMLImageElement | null): Layout {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法绘制图片，请换用支持 Canvas 的浏览器。');
  const l = layout(ctx, model);
  canvas.width = t.width; canvas.height = l.height;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, t.width, l.height);
  // 使用字形实际上沿定位，避免不同字号的 Canvas 顶部留白造成纵向偏移。
  const text = (value: string, x: number, y: number, size = t.bodySize, color = t.ink, weight = 400) => {
    font(ctx, size, weight);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y + ctx.measureText(value).actualBoundingBoxAscent);
  };
  const center = (value: string, y: number, size: number, weight = 400) => {
    font(ctx, size, weight);
    text(value, (t.width - ctx.measureText(value).width) / 2, y, size, t.ink, weight);
  };
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  };

  text(model.clock, 179, 76, 52, t.ink, 600);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i < Number(model.signal) ? '#050505' : '#d7d7d7';
    rounded(908 + i * 17, 115 - (i + 1) * 10, 12, (i + 1) * 10, 3);
  }
  l.networkLines.forEach((v, i) => text(v, 995, 76 + i * 64, 49, t.ink, 500));
  ctx.fillStyle = '#d8d8d8'; rounded(1071, 72, 86, 44, 13);
  ctx.save(); ctx.beginPath(); ctx.roundRect(1071, 72, 86, 44, 13); ctx.clip();
  ctx.fillStyle = '#080808'; ctx.fillRect(1071, 72, 86 * Number(model.battery) / 100, 44); ctx.restore();
  font(ctx, 38, 600);
  const batteryWidth = ctx.measureText(model.battery).width;
  text(model.battery, 1114 - batteryWidth / 2, 79, 38, Number(model.battery) >= 50 ? '#ffffff' : '#101010', 600);
  ctx.fillStyle = '#b5b5b5'; rounded(1160, 84, 5, 20, 2);

  ctx.strokeStyle = t.ink; ctx.lineWidth = 4.5; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(63, l.navigationY + 2); ctx.lineTo(111, l.navigationY + 50);
  ctx.moveTo(111, l.navigationY + 2); ctx.lineTo(63, l.navigationY + 50); ctx.stroke();
  center('账单', l.navigationY, 60);
  font(ctx, 52); text('全部账单', 1229 - ctx.measureText('全部账单').width, l.navigationY + 5);

  if (icon) {
    const side = Math.min(icon.naturalWidth, icon.naturalHeight);
    ctx.drawImage(icon, (icon.naturalWidth - side) / 2, (icon.naturalHeight - side) / 2, side, side, 577, l.iconY, 125, 125);
  } else {
    // 通用购物袋图形；可通过本地图标上传替换。
    ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.roundRect(591, l.iconY + 32, 97, 87, 11); ctx.stroke();
    ctx.beginPath(); ctx.arc(639.5, l.iconY + 36, 24, Math.PI, 0); ctx.stroke();
  }
  l.merchantLines.forEach((v, i) => center(v, l.merchantY + i * 78, 60));
  center(`−${model.amountDisplay}`, l.amountY, 112, 500);
  ctx.fillStyle = t.line; ctx.fillRect(94, l.amountY + 282, 1090, 2);
  for (const row of l.rows) {
    text(row.label, t.margin, row.y, t.bodySize, t.muted);
    row.lines.forEach((v, i) => text(v, t.valueX, row.y + i * t.lineHeight));
    row.noteLines.forEach((v, i) => text(v, t.valueX, row.noteY + i * t.noteLineHeight, t.noteSize, t.muted));
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(l.barcode, Math.floor((t.width - l.barcode.width) / 2), l.barcodeY);
  // 极长字母组合仍按测量结果换行，不缩放字体或挤压条形码。
  font(ctx, t.barcode.textSize);
  wrap(ctx, model.barcodeValue, t.width - 2 * t.margin).forEach((value, index) => {
    center(value, l.barcodeY + l.barcode.height + t.barcode.textGap + index * 62, t.barcode.textSize);
  });
  ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, l.footerY, t.width, 28);
  text('账单服务', t.margin, l.footerY + 85);
  return l;
}
