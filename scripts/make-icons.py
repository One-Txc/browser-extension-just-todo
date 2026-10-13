"""生成扩展图标。

图形与 icons/source.svg 一致：品牌蓝实心圆 + 白色对勾（圆头线帽、扁平无渐变）。

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

BLUE = (77, 107, 250, 255)   # #4d6bfa
WHITE = (255, 255, 255, 255)

# 超采样倍数：先按大画布画，再缩回去，得到平滑边缘
SS = 8

# 几何（viewBox 坐标）
DISC_R = 58.67                                            # 实心圆半径
CHECK = ((37.33, 66.13), (55.47, 84.27), (91.73, 45.87))  # 对勾折线：左下 → 底点 → 右上
STROKE = 13.87                                            # 对勾线宽


def _pt(x: float, y: float, size: int) -> tuple[float, float]:
    return (x / VB * size, y / VB * size)


def _caps(d: ImageDraw.ImageDraw, points, width: float) -> None:
    """line() 端点是方的，两端各补圆点，模拟 stroke-linecap: round"""
    r = width / 2
    for px, py in points:
        d.ellipse([px - r, py - r, px + r, py + r], fill=WHITE)


def draw_icon(size: int) -> Image.Image:
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 实心圆底
    cx, cy = _pt(64.0, 64.0, s)
    r = DISC_R / VB * s
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLUE)

    # 白色对勾
    lw = max(1, round(STROKE / VB * s))
    pts = [_pt(x, y, s) for x, y in CHECK]
    d.line(pts, fill=WHITE, width=lw, joint='curve')
    _caps(d, (pts[0], pts[-1]), lw)

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
