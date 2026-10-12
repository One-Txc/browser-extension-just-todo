"""生成扩展图标。

图形与 icons/source.svg 一致：蓝紫渐变圆角方块 + 白色清单（首行对勾，后两行圆点 + 短线）。

不依赖 SVG 栅格器，直接用 Pillow 绘制同款几何，保证在只有标准库 + Pillow 的环境也能跑通。

用法：
    uv run --with pillow python scripts/make-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path('icons')

# 与 source.svg 一致的 128 基准坐标系
VB = 128.0

TOP = (109, 139, 255, 255)   # #6d8bff
BOT = (138, 109, 245, 255)   # #8a6df5
WHITE = (255, 255, 255, 255)

# 超采样倍数：先按大画布画，再缩回去，得到平滑边缘
SS = 8

# 清单各行基线（viewBox 坐标）
ROW_Y = (45.0, 64.0, 83.0)
LINE_X0, LINE_X1 = 64.0, 92.0
MARK_X = 46.0
STROKE = 9.0


def _pt(x: float, y: float, size: int) -> tuple[float, float]:
    return (x / VB * size, y / VB * size)


def _gradient(size: int) -> Image.Image:
    """竖直渐变：逐行填色，尺寸最大也就 128*SS，循环开销可忽略"""
    grad = Image.new('RGBA', (size, size))
    span = max(1, size - 1)
    for y in range(size):
        f = y / span
        color = tuple(round(TOP[i] + (BOT[i] - TOP[i]) * f) for i in range(4))
        grad.paste(Image.new('RGBA', (size, 1), color), (0, y))
    return grad


def _caps(d: ImageDraw.ImageDraw, points, width: float) -> None:
    """line() 端点是方的，两端各补圆点，模拟 stroke-linecap: round"""
    r = width / 2
    for px, py in points:
        d.ellipse([px - r, py - r, px + r, py + r], fill=WHITE)


def draw_icon(size: int) -> Image.Image:
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))

    # 圆角渐变底
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.225, fill=255)
    img.paste(_gradient(s), (0, 0), mask)

    d = ImageDraw.Draw(img)
    lw = max(2, round(STROKE / VB * s))
    r = lw / 2

    # 首行：对勾
    check = [_pt(40, 45, s), _pt(47, 53, s), _pt(59, 38, s)]
    d.line(check, fill=WHITE, width=lw, joint='curve')
    _caps(d, (check[0], check[-1]), lw)

    # 三行短线
    for y in ROW_Y:
        p0, p1 = _pt(LINE_X0, y, s), _pt(LINE_X1, y, s)
        d.line([p0, p1], fill=WHITE, width=lw)
        _caps(d, (p0, p1), lw)

    # 第二、三行的圆点标记
    dot_r = max(1.5, 4.5 / VB * s)
    for y in ROW_Y[1:]:
        cx, cy = _pt(MARK_X, y, s)
        d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    # Chrome 工具栏用 16/32，扩展管理页用 48，商店与安装弹窗用 128
    for size in (16, 32, 48, 128):
        path = OUT_DIR / f'{size}.png'
        draw_icon(size).save(path, 'PNG')
        print(f'  {path}  {size}×{size}')
    print(f'\n共 4 个文件，输出到 {OUT_DIR}/')


if __name__ == '__main__':
    main()
