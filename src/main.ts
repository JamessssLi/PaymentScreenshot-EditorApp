import './styles.css';
import { defaults, statuses, type ReceiptDraft } from './model.ts';
import { validate } from './validation.ts';
import { render } from './render.ts';
import { downloadPng } from './export.ts';
import { generateIdentifiers, paymentInputKey } from './identifiers.ts';
import { merchantPresets, merchantFieldKeys } from './merchants.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header class="app-header"><div class="brand"><span class="brand-mark">▤</span><span>LOCAL STUDIO<span class="brand-sub">支付详情编辑器</span></span></div><span class="local-badge"><i></i>离线可用 · 数据仅在本机</span></header>
<main><section class="intro"><div class="eyebrow">PAYMENT DETAIL / LOCAL EDITOR</div><h1>支付详情，随手编辑。</h1><p>修改字段，实时预览，导出高清 PNG。</p></section>
<div class="workspace"><section class="editor" aria-label="编辑表单"><div class="panel-heading"><h2>编辑详情</h2><div class="merchant-picker"><label class="sr-only" for="merchant-preset">常用商家</label><img id="preset-avatar" width="28" height="28" alt="" hidden><select id="merchant-preset"><option value="">常用商家…</option></select></div></div><form id="form" novalidate><div id="common"></div><div class="export-area"><button id="export" type="submit"><span>↓</span> 导出图片 <small>PNG</small></button><p id="feedback" role="status" aria-live="polite">所有编辑仅在本机处理，刷新后恢复默认值</p></div><details id="more"><summary><span>更多字段<small>商户、支付方式与状态栏</small></span><span class="chevron">⌄</span></summary><div id="extra"></div></details></form><div class="local-note"><span>◎</span><p>只在浏览器中处理。刷新会恢复默认值，分享时只需发送这个 HTML 文件。</p></div></section>
<section class="preview-panel" aria-label="实时预览"><div class="preview-toolbar"><div><h2>实时预览</h2><span class="preview-state" id="preview-state">已同步</span></div><div class="zoom-control"><label for="zoom">缩放</label><select id="zoom"><option value="fit">适应宽度</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select></div></div><div class="preview-stage" id="stage"><div class="canvas-wrap" id="canvas-wrap"><canvas id="preview" role="img" aria-label="支付详情图片实时预览"></canvas><div id="invalid-overlay" hidden>请先修正表单中的错误<br><small>此处保留上一次有效预览</small></div></div></div><div class="preview-footer"><span><i></i>固定账单模板</span><span id="dimensions">正在准备预览…</span></div></section></div>
<footer class="page-footer"><span>本地文件 · 无需安装</span><span>CODE128 条码 · 全程本地处理</span></footer></main>`;

type FieldKey = keyof ReceiptDraft;
const draft: ReceiptDraft = { ...defaults };
const form = document.querySelector<HTMLFormElement>('#form')!;
const common = document.querySelector('#common')!;
const extra = document.querySelector('#extra')!;
const canvas = document.querySelector<HTMLCanvasElement>('#preview')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export')!;
const feedback = document.querySelector<HTMLElement>('#feedback')!;
const stateLabel = document.querySelector<HTMLElement>('#preview-state')!;
const overlay = document.querySelector<HTMLElement>('#invalid-overlay')!;
const merchantSelect = document.querySelector<HTMLSelectElement>('#merchant-preset')!;
const presetAvatar = document.querySelector<HTMLImageElement>('#preset-avatar')!;
for (const preset of merchantPresets) {
  const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label; merchantSelect.append(option);
}
let icon: HTMLImageElement | null = null;
let iconError = ''; let loadingIcon = false; let exporting = false; let renderError = ''; let iconToken = 0;
const automatic = { transaction: true, barcode: true };
let lastGenerationKey = '';
const controls = new Map<FieldKey, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
function section(title: string) { const h = document.createElement('h3'); h.textContent = title; extra.append(h); }
function field(parent: Element, key: FieldKey, label: string, options: { type?: string; hint?: string; prefix?: string; choices?: Record<string, string> } = {}) {
  const wrapper = document.createElement('div'); wrapper.className = 'field'; wrapper.dataset.field = key;
  const labelElement = document.createElement('label'); labelElement.htmlFor = key; labelElement.textContent = label;
  const holder = document.createElement('div'); holder.className = options.prefix ? 'input-shell prefixed' : 'input-shell';
  if (options.prefix) { const prefix = document.createElement('span'); prefix.className = 'prefix'; prefix.textContent = options.prefix; holder.append(prefix); }
  const control = options.choices ? document.createElement('select') : options.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (control instanceof HTMLInputElement) { control.type = options.type || 'text'; if (control.type === 'time') control.step = key === 'payTime' ? '1' : '60'; if (control.type === 'date') { control.min = '0001-01-01'; control.max = '9999-12-31'; } }
  if (options.choices) for (const [value, title] of Object.entries(options.choices)) { const option = document.createElement('option'); option.value = value; option.textContent = title; control.append(option); }
  if (key === 'amount') control.inputMode = 'decimal';
  if (key === 'battery') control.inputMode = 'numeric';
  control.id = key; control.name = key; control.value = draft[key]; control.autocomplete = 'off'; control.setAttribute('aria-describedby', `${key}-hint ${key}-error`);
  holder.append(control);
  const hint = document.createElement('p'); hint.id = `${key}-hint`; hint.className = 'hint'; hint.textContent = options.hint || '';
  const error = document.createElement('p'); error.id = `${key}-error`; error.className = 'field-error'; error.setAttribute('aria-live', 'polite');
  wrapper.append(labelElement, holder, hint, error); parent.append(wrapper); controls.set(key, control);
  control.addEventListener('input', () => {
    // 原生时间控件可能省略零秒；数据层仍显式保留时、分、秒。
    draft[key] = key === 'payTime' && /^\d{2}:\d{2}$/.test(control.value) ? `${control.value}:00` : control.value;
    if (key === 'transaction' || key === 'barcode') automatic[key] = false;
    if (key === 'amount' || key === 'payDate' || key === 'payTime') syncIdentifiers();
    if ((merchantFieldKeys as readonly string[]).includes(key)) clearPresetSelection();
    feedback.textContent = '所有编辑仅在本机处理，刷新后恢复默认值'; refresh();
  });
  return wrapper;
}
field(common, 'amount', '支出金额', { prefix: '¥', hint: '非负金额，最多 2 位小数' }).classList.add('amount-field');
const dateGroup = document.createElement('div'); dateGroup.className = 'date-group'; common.append(dateGroup);
field(dateGroup, 'payDate', '支付日期', { type: 'date' }); field(dateGroup, 'payTime', '支付时间', { type: 'time' });
const generationGroup = document.createElement('div'); generationGroup.className = 'generation-group';
const generationNote = document.createElement('p'); generationNote.id = 'generation-status'; generationNote.setAttribute('role', 'status'); generationNote.setAttribute('aria-live', 'polite');
const regenerate = document.createElement('button'); regenerate.type = 'button'; regenerate.id = 'regenerate'; regenerate.className = 'text-button';
regenerate.textContent = '重新生成'; generationGroup.append(generationNote, regenerate); common.append(generationGroup);
field(common, 'transaction', '交易单号', { hint: '1–64 位字母、数字或连字符，保留前导零' });
field(common, 'barcode', '条码内容', { hint: '1–32 位字母、数字或连字符，与交易单号独立' });
section('商户信息');
field(extra, 'merchant', '商户显示名');
const iconField = document.createElement('div'); iconField.className = 'field';
iconField.innerHTML = '<label for="icon">商户图标</label><input type="file" id="icon" accept="image/png,image/jpeg"><p class="hint">PNG / JPEG，最大 5 MB；图片居中裁为方形。</p><p id="icon-error" class="field-error" role="alert"></p><button type="button" id="default-icon" class="text-button">使用默认图标</button>';
extra.append(iconField);
field(extra, 'product', '商品', { type: 'textarea' }); field(extra, 'company', '商户全称', { type: 'textarea' });
section('支付详情');
field(extra, 'status', '当前状态', { choices: statuses }); field(extra, 'acquirer', '收单机构');
field(extra, 'acquirerNote', '收单机构补充说明', { type: 'textarea', hint: '可留空；以较小灰色文字显示在收单机构下方' });
field(extra, 'method', '支付方式');
field(extra, 'orderMode', '商户单号区域', { choices: { hint: '显示提示文本', number: '显示商户编号' } });
const hintField = field(extra, 'orderHint', '提示文本', { type: 'textarea' });
const orderField = field(extra, 'order', '商户编号', { hint: '1–64 位字母、数字或连字符' });
section('顶部状态栏');
field(extra, 'clock', '顶部时间', { type: 'time', hint: '与支付时间独立，不自动同步' });
field(extra, 'signal', '信号', { choices: { '0': '无信号', '1': '1 格', '2': '2 格', '3': '3 格', '4': '4 格' } });
field(extra, 'network', '网络文字'); field(extra, 'battery', '电量（%）', { hint: '0–100 的整数' });

function clearPresetSelection() {
  merchantSelect.value = ''; presetAvatar.hidden = true;
}
async function decodeIcon(src: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = src; await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片无法解码，请重新选择图片。');
  return image;
}
merchantSelect.addEventListener('change', async () => {
  const preset = merchantPresets.find(item => item.id === merchantSelect.value);
  if (!preset) { presetAvatar.hidden = true; return; }
  for (const key of merchantFieldKeys) { draft[key] = preset.fields[key]; controls.get(key)!.value = draft[key]; }
  presetAvatar.src = preset.avatarUrl; presetAvatar.hidden = false;
  (document.querySelector('#icon') as HTMLInputElement).value = '';
  const token = ++iconToken; loadingIcon = true; iconError = ''; refresh();
  try {
    const image = await decodeIcon(preset.avatarUrl);
    if (token === iconToken) {
      icon = image;
      feedback.textContent = `已填入${preset.label}的信息与头像，可在“更多字段”继续修改。`;
    }
  } catch {
    if (token === iconToken) iconError = '商家头像载入失败，请上传本地图标或使用默认图标。';
  } finally { if (token === iconToken) { loadingIcon = false; refresh(); } }
});

function syncIdentifiers(force = false) {
  const key = paymentInputKey(draft);
  if (!key || !force && key === lastGenerationKey) return;
  const generated = generateIdentifiers(draft);
  if (!generated) return;
  for (const fieldKey of ['transaction', 'barcode'] as const) {
    if (automatic[fieldKey]) { draft[fieldKey] = generated[fieldKey]; const control = controls.get(fieldKey); if (control) control.value = draft[fieldKey]; }
  }
  lastGenerationKey = key;
}
function updateGenerationNote() {
  const valid = Boolean(paymentInputKey(draft));
  regenerate.disabled = !valid;
  regenerate.textContent = automatic.transaction && automatic.barcode ? '重新生成' : '恢复自动';
  if (!valid) { generationNote.textContent = '填写有效金额和完整时间后，将自动生成单号与条码。'; return; }
  const generated = [automatic.transaction && '交易单号', automatic.barcode && '条码'].filter(Boolean).join('与');
  const manual = [!automatic.transaction && '交易单号', !automatic.barcode && '条码'].filter(Boolean).join('与');
  generationNote.textContent = generated ? `已根据 ${draft.payDate} ${draft.payTime} 生成${generated}，可修改。${manual ? `${manual}已保留手动内容。` : ''}` : '交易单号与条码已手动修改，时间和金额变化不会覆盖。可恢复自动生成。';
}
regenerate.addEventListener('click', () => { automatic.transaction = true; automatic.barcode = true; syncIdentifiers(true); refresh(); });

function resizePreview() {
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const zoom = document.querySelector<HTMLSelectElement>('#zoom')!.value;
  const width = zoom === 'fit' ? Math.min(450, Math.max(180, stage.clientWidth - 56)) : 1279 * Number(zoom);
  const wrap = document.querySelector<HTMLElement>('#canvas-wrap')!; wrap.style.width = `${width}px`; canvas.style.width = `${width}px`;
}
function refresh() {
  updateGenerationNote();
  hintField.hidden = draft.orderMode !== 'hint'; orderField.hidden = draft.orderMode !== 'number';
  const { errors, model } = validate(draft); renderError = '';
  for (const [key, control] of controls) { const error = errors[key] || ''; document.getElementById(`${key}-error`)!.textContent = error; control.setAttribute('aria-invalid', String(Boolean(error))); }
  document.querySelector('#icon-error')!.textContent = iconError;
  if (model && !iconError && !loadingIcon) {
    try { render(canvas, model, icon); document.querySelector('#dimensions')!.textContent = `${canvas.width} × ${canvas.height} px · PNG`; }
    catch (error) { renderError = error instanceof Error ? error.message : '预览失败，请重试。'; }
  }
  const invalid = !model || Boolean(iconError) || Boolean(renderError);
  overlay.hidden = !invalid; stateLabel.textContent = loadingIcon ? '正在载入图标' : invalid ? '待修正' : '已同步'; stateLabel.classList.toggle('invalid', invalid);
  if (renderError) feedback.textContent = renderError;
  exportButton.disabled = invalid || loadingIcon || exporting; resizePreview();
}

document.querySelector('#zoom')!.addEventListener('change', resizePreview);
new ResizeObserver(resizePreview).observe(document.querySelector('#stage')!);
document.querySelector('#icon')!.addEventListener('change', async event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  clearPresetSelection();
  const token = ++iconToken; loadingIcon = true; iconError = ''; refresh();
  let url = '';
  try {
    if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('请选择 PNG 或 JPEG 图片。');
    if (file.size > 5 * 1024 * 1024) throw new Error('图片超过 5 MB，请选择较小的图片。');
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => signature[i] === v);
    const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg)) throw new Error('文件内容不是有效的 PNG / JPEG 图片。');
    url = URL.createObjectURL(file); const image = await decodeIcon(url);
    if (token === iconToken) icon = image;
  } catch (error) { if (token === iconToken) iconError = error instanceof Error && !['EncodingError'].includes(error.name) ? error.message : '图片无法解码，请重新选择有效的 PNG / JPEG。'; }
  finally { if (url) URL.revokeObjectURL(url); if (token === iconToken) { loadingIcon = false; refresh(); } }
});
document.querySelector('#default-icon')!.addEventListener('click', () => { clearPresetSelection(); ++iconToken; icon = null; loadingIcon = false; iconError = ''; (document.querySelector('#icon') as HTMLInputElement).value = ''; refresh(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); if (exporting || loadingIcon) return; refresh();
  const { model } = validate(draft); if (!model || iconError || renderError) return;
  exporting = true; const iconSnapshot = icon; exportButton.disabled = true; exportButton.textContent = '正在生成 PNG…'; feedback.textContent = '正在准备图片，请稍候…';
  try { await downloadPng(model, iconSnapshot); feedback.textContent = 'PNG 已生成，请在浏览器下载列表中查看。'; }
  catch (error) { feedback.textContent = error instanceof Error ? error.message : '导出失败，请重试。'; }
  finally { exporting = false; exportButton.innerHTML = '<span>↓</span> 导出图片 <small>PNG</small>'; refresh(); }
});
syncIdentifiers(); refresh();
if (document.fonts) document.fonts.ready.then(refresh);
