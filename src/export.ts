import type { RenderModel } from './model.ts';
import { render } from './render.ts';
export async function pngBlob(model: RenderModel, icon: HTMLImageElement | null): Promise<Blob> {
  if (document.fonts) await document.fonts.ready;
  if (icon) await icon.decode();
  const canvas = document.createElement('canvas'); render(canvas, model, icon);
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片导出失败，请重试或更换浏览器。')), 'image/png'); }
    catch { reject(new Error('浏览器无法导出此图片，请重新选择本地图标后重试。')); }
  });
}
export async function downloadPng(model: RenderModel, icon: HTMLImageElement | null) {
  const blob = await pngBlob(model, icon); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `receipt-${model.payDate}.png`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
