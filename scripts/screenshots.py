"""把浏览器截图处理成应用商店要求的尺寸。

应用商店（Chrome Web Store / Firefox Add-ons）要求截图是 1280x800 或 640x400，
比例固定 16:10 = 1.6。

**同一套截图供所有语言复用**：本项目不按语言区分截图，所以目录是平铺的，
没有「中文/」「英文/」这类子目录。

处理分两步：

    1. 裁到 16:10 —— 比目标宽就裁左右，比目标窄就裁底部
    2. 等比缩放到 1280x800 与 640x400

这样既不留边、也不变形，代价只是裁掉一点点边缘像素。
截图越接近 16:10 裁得越少：1440x900 和 1600x1000 本身就是 16:10，一像素都不用裁；
1314x819（比例 1.6044）也只裁掉 4px 宽。

**裁底部而不是上下均分**：截图底部往往是空白或状态栏一类可以舍弃的区域，
顶部才有标题和工具栏。横向居中裁，两侧对称。

────────────────────────────────────────────────────────────────
用法
────────────────────────────────────────────────────────────────

目录结构约定（原图直接平铺在这里，非图片文件会被忽略）：

    docs/
    ├── 截图/                    ← 把原图直接放这里
    │   ├── 一张图.png
    │   └── 另一张.png


跑一次：

    npm run screenshots
    # 等价于
    uv run scripts/screenshots.py

输出（会覆盖同名结果，原图永远不动）：

    docs/
    ├── 截图/
    │   ├── 一张图.png            ← 原图，保持原样
    │   ├── 1280x800/
    │   │   └── 一张图.png        ← 商店首选尺寸
    │   └── 640x400/
    │       └── 一张图.png        ← 小尺寸备选

源图是 .jpg / .webp 也没关系：输出一律是 .png，保证扩展名与内容一致。

另一个选项：

    --keep-stale    保留尺寸目录里原图已不存在的旧输出
                    （默认会清掉，避免删了原图后结果里留着幽灵文件）

────────────────────────────────────────────────────────────────
截图本身的建议
────────────────────────────────────────────────────────────────

- **截成 16:10 最省事**。做法：F12 打开 DevTools → Ctrl+Shift+M 开启设备工具栏
  → 尺寸填 1600x1000 或 1440x900 → Ctrl+Shift+P 输入 screenshot
  → 选 Capture screenshot。这样截出来直接就是 16:10
- 注意窗口宽度别低于 824px，否则侧边栏会收成抽屉（见 app.css 的断点注释）
- 别把浏览器边框、桌面背景截进去，那会改变比例，白白多裁一些
"""

# /// script
# requires-python = ">=3.9"
# dependencies = ["pillow"]
# ///

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, UnidentifiedImageError

# Windows 控制台默认 GBK，输出 ✓/✗ 会抛 UnicodeEncodeError；强制 UTF-8（同 check-locales.py）
try:
    sys.stdout.reconfigure(encoding='utf-8')
except (AttributeError, ValueError):
    pass

# 仓库根目录：脚本在 scripts/ 下，用 __file__ 定位，从任何 cwd 调用都能跑
ROOT = Path(__file__).resolve().parents[1] / 'docs' / '截图'
SIZES = [(1280, 800), (640, 400)]

# 商店要求的比例，两个尺寸都是它
TARGET_RATIO = 1280 / 800

IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp'}

# 比例已经这么接近就不裁（1280x800 下不到 2px，肉眼看不出来），省一次没意义的裁剪
RATIO_TOLERANCE = 0.002


def crop_to_ratio(img: Image.Image, ratio: float) -> tuple[Image.Image, str]:
    """裁到指定宽高比。返回（裁好的图, 裁掉了什么的说明）"""
    w, h = img.size
    current = w / h

    if abs(current - ratio) < RATIO_TOLERANCE:
        return img, '无需裁剪'

    if current > ratio:
        # 太宽 → 裁左右，居中
        new_w = round(h * ratio)
        left = (w - new_w) // 2
        return img.crop((left, 0, left + new_w, h)), f'裁左右 {w - new_w}px'

    # 太高 → 裁底部，保住顶部的标题与工具栏
    new_h = round(w / ratio)
    return img.crop((0, 0, w, new_h)), f'裁底部 {h - new_h}px'


def to_rgb(img: Image.Image) -> Image.Image:
    """转成 RGB。带透明通道的图先垫白底，直接 convert('RGB') 会把透明区压成黑色"""
    has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
    if not has_alpha:
        return img.convert('RGB')
    rgba = img.convert('RGBA')
    canvas = Image.new('RGB', rgba.size, (255, 255, 255))
    canvas.paste(rgba, mask=rgba.split()[-1])
    return canvas


def output_name(src: Path) -> str:
    """输出一律 .png：源图是 jpg/webp 时，扩展名必须跟着真实内容走"""
    return f'{src.stem}.png'


def collect_sources() -> list[Path]:
    """ROOT 下平铺的图片。尺寸目录是子目录，is_file() 天然把它们跳过"""
    return sorted(
        p for p in ROOT.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    )


def process(sources: list[Path], keep_stale: bool) -> tuple[int, int, int]:
    """返回（写出的文件数, 清理的陈旧文件数, 处理失败的张数）"""
    # a.png 与 a.jpg 会输出成同一个 a.png，先拦住，别静默覆盖
    by_stem: dict[str, list[str]] = {}
    for src in sources:
        by_stem.setdefault(src.stem, []).append(src.name)
    clashes = {stem: names for stem, names in by_stem.items() if len(names) > 1}
    if clashes:
        for stem, names in sorted(clashes.items()):
            print(f'✗ 输出重名：{"、".join(names)} 都会输出成 {stem}.png，请先改掉其中一个')
        return 0, 0, len(clashes)

    written = 0
    cleaned = 0
    failed = 0
    notes: list[str] = []

    for src in sources:
        try:
            with Image.open(src) as raw:
                # convert 返回的是已加载好的新对象，出了 with 继续拿它裁剪/缩放是安全的
                img = to_rgb(raw)
                w0, h0 = img.size
                cropped, how = crop_to_ratio(img, TARGET_RATIO)

            for width, height in SIZES:
                out_dir = ROOT / f'{width}x{height}'
                out_dir.mkdir(parents=True, exist_ok=True)
                cropped.resize((width, height), Image.LANCZOS).save(out_dir / output_name(src), 'PNG')
                written += 1
        except (UnidentifiedImageError, OSError) as e:
            failed += 1
            print(f'    ✗ {src.name} 处理失败：{e}')
            continue

        notes.append(f'    {src.name:<40} {w0}x{h0} → {how}，缩放 {1280 / cropped.width * 100:.0f}%')

    # 清理陈旧输出：原图已删掉、尺寸目录里却还留着的那些（按输出名比对，不是按源文件名）
    if not keep_stale:
        expected = {output_name(s) for s in sources}
        for width, height in SIZES:
            out_dir = ROOT / f'{width}x{height}'
            if not out_dir.is_dir():
                continue
            for old in sorted(out_dir.iterdir()):
                # 只清图片：万一有人往尺寸目录里放了说明文件，不要动它
                if old.is_file() and old.suffix.lower() in IMAGE_SUFFIXES and old.name not in expected:
                    old.unlink()
                    print(f'    清理陈旧输出 {out_dir.name}/{old.name}')
                    cleaned += 1

    for line in notes:
        print(line)
    return written, cleaned, failed


def main() -> int:
    argv = sys.argv[1:]
    unknown = [a for a in argv if a not in ('--keep-stale', '-h', '--help')]
    if unknown:
        print(f'✗ 不认识的参数：{" ".join(unknown)}')
        print('  用法：uv run scripts/screenshots.py [--keep-stale]')
        return 2
    if any(a in ('-h', '--help') for a in argv):
        print(__doc__)
        return 0
    keep_stale = '--keep-stale' in argv

    if not ROOT.is_dir():
        print(f'✗ 找不到 {ROOT}/ 目录。请把截图放进去（平铺即可，结构见脚本注释）。')
        return 1

    sources = collect_sources()
    if not sources:
        print(f'✗ {ROOT}/ 下没有图片（支持 {", ".join(sorted(IMAGE_SUFFIXES))}）')
        return 1

    print(f'输入 {ROOT}/，共 {len(sources)} 张（平铺读取，不递归子目录）')
    print(f'输出到 {ROOT}/{{1280x800, 640x400}}/，原图不动')
    print('处理：裁到 16:10 → 等比缩放（不留边、不变形）\n')

    written, cleaned, failed = process(sources, keep_stale)

    print(f'\n完成：写出 {written} 个文件'
          + (f'，清理 {cleaned} 个陈旧输出' if cleaned else '')
          + (f'，{failed} 张失败' if failed else '') + '。')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
