"""独立于 JsBarcode 的 ZXing-C++ 解码，输入均为完整导出 PNG。"""
import json
from pathlib import Path
import zxingcpp
from PIL import Image

folder = Path(__file__).resolve().parent.parent / 'verification'
expected = json.loads((folder / 'export-expectations.json').read_text())
results = []
for name, value in expected.items():
    image = Image.open(folder / f'{name}.png')
    codes = zxingcpp.read_barcodes(image)
    assert any(code.text == value and code.format == zxingcpp.BarcodeFormat.Code128 for code in codes), (name, codes)
    code = next(code for code in codes if code.text == value)
    position = code.position
    # 解码器角点可能位于条纹内部，另从附近实际黑色像素测量尺寸。
    top = max(0, min(position.top_left.y, position.top_right.y) - 8)
    bottom = min(image.height, max(position.bottom_left.y, position.bottom_right.y) + 9)
    mask = image.convert('L').crop((0, top, image.width, bottom)).point(lambda value: 255 if value < 80 else 0)
    left, upper, right, lower = mask.getbbox()
    bars_width = right - left
    bars_height = lower - upper
    if name in ['default', 'auto-new-year', 'auto-leap']:
        assert .68 <= bars_width / image.width <= .73, (name, bars_width)
        assert 193 <= bars_height <= 195, (name, bars_height)
    results.append({'file': f'{name}.png', 'size': image.size, 'expected': value, 'decoded': [code.text for code in codes], 'barsX': left, 'barsY': top + upper, 'barsWidth': bars_width, 'barsHeight': bars_height, 'widthRatio': bars_width / image.width, 'passed': True})
(folder / 'decoder-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False, indent=2))
