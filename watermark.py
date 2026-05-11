#!/usr/bin/env python3
"""
WFX Image Watermarking Tool
============================

Adds a subtle "© WFX wanfuxin.com" watermark to product photos before they're
uploaded to the website. Even if a competitor screenshots or scrapes the
images, the watermark survives and provides attribution + DMCA evidence.

Usage:
    # Watermark a single file
    python watermark.py photo.jpg

    # Batch-watermark all images in a directory
    python watermark.py --batch ./product-photos/

    # Custom output directory
    python watermark.py --batch ./photos/ --output ./watermarked/

    # Stronger watermark (more visible)
    python watermark.py photo.jpg --opacity 0.5

Requires: Pillow (pip install Pillow)
"""
import os
import sys
import argparse
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow")
    sys.exit(1)


def get_font(size):
    """Try to load a nice font; fall back to default if not available."""
    candidates = [
        # Common system fonts (cross-platform)
        '/System/Library/Fonts/Helvetica.ttc',           # macOS
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',  # Linux
        'C:/Windows/Fonts/arialbd.ttf',                  # Windows
        '/Library/Fonts/Arial Bold.ttf',                 # macOS alt
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def watermark_image(input_path, output_path, opacity=0.35, text='© WFX wanfuxin.com'):
    """
    Add a diagonal repeating watermark across the image.
    The diagonal pattern is harder to crop out than corner watermarks.
    """
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size

    # Create transparent overlay
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Font size scales with image — minimum 14px, ~2.5% of image width
    font_size = max(14, int(width * 0.025))
    font = get_font(font_size)

    # Measure text size
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        # Older Pillow
        text_w, text_h = draw.textsize(text, font=font)

    # Diagonal repeating pattern. Spacing = ~3x text dimensions.
    spacing_x = int(text_w * 2.5)
    spacing_y = int(text_h * 4)

    alpha = int(255 * opacity)

    # Draw text in a grid, rotated 30 degrees
    text_layer = Image.new('RGBA', (text_w + 20, text_h + 20), (0, 0, 0, 0))
    text_draw = ImageDraw.Draw(text_layer)
    text_draw.text((10, 10), text, font=font, fill=(255, 255, 255, alpha))
    # Add a slight shadow for legibility on light + dark backgrounds
    shadow = Image.new('RGBA', text_layer.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.text((11, 11), text, font=font, fill=(0, 0, 0, alpha // 2))
    combined = Image.alpha_composite(shadow, text_layer)
    combined = combined.rotate(30, expand=True, resample=Image.BICUBIC)

    cw, ch = combined.size

    # Tile across the image
    for y in range(-ch, height + ch, spacing_y):
        offset = (y // spacing_y) * (spacing_x // 2)  # offset every other row
        for x in range(-cw + offset, width + cw, spacing_x):
            overlay.paste(combined, (x, y), combined)

    # Also add a clear corner watermark (always visible)
    corner_font = get_font(max(16, int(width * 0.03)))
    corner_text = '© WFX wanfuxin.com'
    try:
        bbox = draw.textbbox((0, 0), corner_text, font=corner_font)
        ctw, cth = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        ctw, cth = draw.textsize(corner_text, font=corner_font)
    margin = int(width * 0.02)
    corner_x = width - ctw - margin
    corner_y = height - cth - margin
    # Shadow
    draw.text((corner_x + 1, corner_y + 1), corner_text, font=corner_font, fill=(0, 0, 0, 180))
    draw.text((corner_x, corner_y), corner_text, font=corner_font, fill=(255, 255, 255, 220))
    # Box behind it for legibility
    overlay_draw = ImageDraw.Draw(overlay, 'RGBA')
    overlay_draw.rectangle(
        [corner_x - 8, corner_y - 4, corner_x + ctw + 8, corner_y + cth + 8],
        fill=(0, 0, 0, 100)
    )
    overlay_draw.text((corner_x + 1, corner_y + 1), corner_text, font=corner_font, fill=(0, 0, 0, 200))
    overlay_draw.text((corner_x, corner_y), corner_text, font=corner_font, fill=(255, 255, 255, 240))

    # Composite
    watermarked = Image.alpha_composite(img, overlay)

    # Save in original format
    ext = Path(input_path).suffix.lower()
    if ext in ('.jpg', '.jpeg'):
        watermarked.convert('RGB').save(output_path, 'JPEG', quality=92, optimize=True)
    elif ext == '.png':
        watermarked.save(output_path, 'PNG', optimize=True)
    elif ext == '.webp':
        watermarked.save(output_path, 'WEBP', quality=90, method=6)
    else:
        # Fallback: save as PNG
        watermarked.save(output_path, 'PNG')


def main():
    parser = argparse.ArgumentParser(
        description='Add WFX watermark to images before uploading to the website',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('input', help='Input image file (or directory if --batch)')
    parser.add_argument('--batch', action='store_true', help='Process all images in input directory')
    parser.add_argument('--output', default=None,
                        help='Output path (default: append _wm to filename, or ./watermarked/ for batch)')
    parser.add_argument('--opacity', type=float, default=0.35,
                        help='Watermark opacity 0.0–1.0 (default: 0.35, subtle but visible)')
    parser.add_argument('--text', default='© WFX wanfuxin.com',
                        help='Watermark text (default: "© WFX wanfuxin.com")')
    args = parser.parse_args()

    if args.batch:
        in_dir = Path(args.input)
        if not in_dir.is_dir():
            print(f"ERROR: {in_dir} is not a directory")
            sys.exit(1)
        out_dir = Path(args.output) if args.output else in_dir.parent / 'watermarked'
        out_dir.mkdir(parents=True, exist_ok=True)

        exts = {'.jpg', '.jpeg', '.png', '.webp'}
        files = [f for f in in_dir.iterdir() if f.is_file() and f.suffix.lower() in exts]

        if not files:
            print(f"No image files found in {in_dir}")
            sys.exit(0)

        print(f"Watermarking {len(files)} images → {out_dir}")
        for i, f in enumerate(files, 1):
            out_path = out_dir / f.name
            try:
                watermark_image(f, out_path, opacity=args.opacity, text=args.text)
                print(f"  [{i}/{len(files)}] ✓ {f.name}")
            except Exception as e:
                print(f"  [{i}/{len(files)}] ✗ {f.name}: {e}")
        print(f"\nDone. Watermarked images in: {out_dir}")
    else:
        in_path = Path(args.input)
        if not in_path.is_file():
            print(f"ERROR: {in_path} not found")
            sys.exit(1)
        out_path = Path(args.output) if args.output else in_path.with_stem(in_path.stem + '_wm')
        try:
            watermark_image(in_path, out_path, opacity=args.opacity, text=args.text)
            print(f"✓ Watermarked: {out_path}")
        except Exception as e:
            print(f"✗ Failed: {e}")
            sys.exit(1)


if __name__ == '__main__':
    main()
