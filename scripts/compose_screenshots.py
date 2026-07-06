"""Compose 1080x1920 store-ready screenshots from raw 390x844 Playwright
captures. Each output has:
  - Dark navy #0F172A background filling 1080x1920
  - The PLOS logo (top-left, 96px)
  - The phone-framed screenshot centered
  - A caption in white at the bottom on a semi-transparent bar

Usage: python /app/scripts/compose_screenshots.py
"""
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAW = pathlib.Path("/app/store-assets/screenshots/raw")
OUT = pathlib.Path("/app/store-assets/screenshots/final")
OUT.mkdir(parents=True, exist_ok=True)

ICON = pathlib.Path("/app/frontend/assets/store/plos_icon_512.png")

CANVAS = (1080, 1920)
BG = (15, 23, 42)      # #0F172A
ACCENT = (59, 130, 246)  # #3B82F6

CAPTIONS = {
    "screenshot_01_dashboard.png":
        "Your AI-powered daily financial command center",
    "screenshot_02_financial.png":
        "Complete financial visibility \u2014 income, expenses & debt in one view",
    "screenshot_03_career.png":
        "AI job matching with ATS-optimized resume tailoring",
    "screenshot_04_safety.png":
        "Real-time safety alerts, GPS navigation & Emergency SOS",
    "screenshot_05_globaltools.png":
        "Translate 12 languages & convert 13 currencies in real time",
    "screenshot_06_chatbot.png":
        "Your personal AI advisor \u2014 answers every question about your life",
}


def _font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def draw_rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill=None, outline=None, width=1):
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_shadow(width: int, height: int, blur: int, opacity: int) -> Image.Image:
    shadow = Image.new("RGBA", (width + 4 * blur, height + 4 * blur), (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.rounded_rectangle(
        (2 * blur, 2 * blur, 2 * blur + width, 2 * blur + height),
        radius=60, fill=(0, 0, 0, opacity),
    )
    return shadow.filter(ImageFilter.GaussianBlur(blur))


def compose_one(raw_path: pathlib.Path, caption: str, out_path: pathlib.Path):
    canvas = Image.new("RGB", CANVAS, BG)
    # gradient overlay (subtle vertical)
    grad = Image.new("RGB", CANVAS, BG)
    gd = ImageDraw.Draw(grad)
    for y in range(CANVAS[1]):
        t = y / CANVAS[1]
        r = int(30 * (1 - t) + 15 * t)
        g = int(58 * (1 - t) + 23 * t)
        b = int(95 * (1 - t) + 42 * t)
        gd.line([(0, y), (CANVAS[0], y)], fill=(r, g, b))
    canvas.paste(grad)

    # ---- Load and scale phone screenshot ----
    phone = Image.open(raw_path).convert("RGB")
    # Target phone frame: 780px wide (leaves margins) preserving 390x844 aspect => 780x1687
    frame_w = 780
    frame_h = int(844 * (frame_w / 390))  # keep aspect
    phone_resized = phone.resize((frame_w, frame_h), Image.LANCZOS)

    # Position: horizontally centered, slightly above vertical center (leave room for caption)
    x = (CANVAS[0] - frame_w) // 2
    y = 210

    # Drop shadow
    shadow = make_shadow(frame_w, frame_h, blur=28, opacity=180)
    canvas.paste(shadow, (x - 2 * 28 + 4, y - 2 * 28 + 12), shadow)

    # Phone frame border (subtle blue glow)
    frame_border_thickness = 6
    frame_bg = Image.new("RGB",
                         (frame_w + 2 * frame_border_thickness,
                          frame_h + 2 * frame_border_thickness), (30, 41, 59))
    canvas.paste(frame_bg, (x - frame_border_thickness, y - frame_border_thickness))
    # Round the phone screenshot slightly by masking
    mask = Image.new("L", (frame_w, frame_h), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, frame_w, frame_h), radius=42, fill=255)
    canvas.paste(phone_resized, (x, y), mask)

    # Accent glow border
    glow_layer = Image.new("RGBA", (CANVAS[0], CANVAS[1]), (0, 0, 0, 0))
    gld = ImageDraw.Draw(glow_layer)
    gld.rounded_rectangle(
        (x - 8, y - 8, x + frame_w + 8, y + frame_h + 8),
        radius=48, outline=(59, 130, 246, 100), width=4,
    )
    canvas = Image.alpha_composite(canvas.convert("RGBA"), glow_layer).convert("RGB")

    # ---- Logo top-left ----
    try:
        logo = Image.open(ICON).convert("RGBA")
        logo = logo.resize((96, 96), Image.LANCZOS)
        canvas.paste(logo, (48, 48), logo)
    except Exception as e:
        print("logo err:", e)

    # ---- PLOS wordmark next to logo ----
    d = ImageDraw.Draw(canvas)
    d.text((164, 60), "PLOS", fill="#FFFFFF", font=_font(56))
    d.text((166, 118), "Personal Life OS", fill=(59, 130, 246), font=_font(22))

    # ---- Caption bar at bottom ----
    cap_h = 165
    cap_top = CANVAS[1] - cap_h - 60
    cap_layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    cld = ImageDraw.Draw(cap_layer)
    cld.rounded_rectangle(
        (48, cap_top, CANVAS[0] - 48, cap_top + cap_h),
        radius=28, fill=(15, 23, 42, 200), outline=(59, 130, 246, 120), width=2,
    )
    canvas = Image.alpha_composite(canvas.convert("RGBA"), cap_layer).convert("RGB")

    d = ImageDraw.Draw(canvas)
    # word-wrap caption to fit width
    cap_font = _font(38)
    max_width = CANVAS[0] - 48 * 2 - 60
    words = caption.split()
    lines = []
    cur = ""
    for w in words:
        candidate = (cur + " " + w).strip()
        if d.textlength(candidate, font=cap_font) < max_width:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    total_h = len(lines) * 44
    cy = cap_top + (cap_h - total_h) // 2
    for line in lines:
        w = d.textlength(line, font=cap_font)
        d.text(((CANVAS[0] - w) // 2, cy), line, fill="#FFFFFF", font=cap_font)
        cy += 46

    canvas.save(out_path, "PNG", optimize=True)
    return out_path


def main():
    for raw_name, caption in CAPTIONS.items():
        raw_path = RAW / raw_name
        if not raw_path.exists():
            print(f"[SKIP] missing {raw_path}")
            continue
        out_path = OUT / raw_name
        compose_one(raw_path, caption, out_path)
        size = out_path.stat().st_size
        print(f"  \u2713 {out_path.name}  ({size//1024} KB)")


if __name__ == "__main__":
    main()
