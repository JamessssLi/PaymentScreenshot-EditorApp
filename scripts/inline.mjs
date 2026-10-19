import { readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';
let html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)];
for (const [tag, path] of scripts) {
  let js = await readFile(new URL(`../dist/${path.replace(/^\.\//, '')}`, import.meta.url), 'utf8');
  // 模块预加载在 file:// 下没有作用，产物改为内联经典脚本。
  js = js.replace(/<\/script/gi, '<\\/script');
  // 回调替换防止打包代码中的 $`、$& 等被当成替换指令。
  new Script(js, { filename: 'receipt-editor-inline.js' });
  // 经典内联脚本在正文末尾执行，确保 #app 已存在。
  html = html.replace(tag, '');
  html = html.replace('</body>', () => `<script>${js}</script></body>`);
}
for (const [tag, path] of [...html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)]) {
  const css = await readFile(new URL(`../dist/${path.replace(/^\.\//, '')}`, import.meta.url), 'utf8'); html = html.replace(tag, () => `<style>${css}</style>`);
}
const license = await readFile(new URL('../node_modules/jsbarcode/MIT-LICENSE.txt', import.meta.url), 'utf8');
html = html.replace('</head>', () => `<!-- JsBarcode license\n${license}\n--></head>`);
html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; base-uri 'none'; form-action 'none'">`);
if (/<script[^>]+src=|<link[^>]+href=|\bimport\s*\(/i.test(html)) throw new Error('发现外部资源引用');
await writeFile(new URL('../dist/receipt-editor.html', import.meta.url), html);
console.log(`独立文件 dist/receipt-editor.html (${Buffer.byteLength(html)} bytes)`);
