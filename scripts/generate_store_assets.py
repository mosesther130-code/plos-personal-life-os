"""Generate PLOS store assets via OpenAI GPT Image 1, then downscale
to all Android launcher/store sizes via Pillow.

Outputs:
  /app/frontend/assets/store/plos_icon_1024.png    (primary source)
  /app/frontend/assets/store/plos_icon_512.png     (Play Store listing)
  /app/frontend/assets/store/plos_icon_192.png     (xxxhdpi)
  /app/frontend/assets/store/plos_icon_144.png     (xxhdpi)
  /app/frontend/assets/store/plos_icon_96.png      (xhdpi)
  /app/frontend/assets/store/plos_icon_72.png      (hdpi)
  /app/frontend/assets/store/plos_icon_48.png      (mdpi + notification)
  /app/frontend/assets/store/plos_feature_graphic.png (1024x500 Play banner)
  /app/frontend/assets/images/icon.png             (expo main icon)
  /app/frontend/assets/images/adaptive-icon.png    (android adaptive fg)
"""
import base64
import os
import sys
import pathlib
from openai import OpenAI
from PIL import Image
from io import BytesIO
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
KEY = os.getenv("OPENAI_API_KEY", "").strip()
if not KEY:
    print("ERROR: OPENAI_API_KEY missing")
    sys.exit(1)

client = OpenAI(api_key=KEY)

OUT_STORE = pathlib.Path("/app/frontend/assets/store")
OUT_IMAGES = pathlib.Path("/app/frontend/assets/images")
OUT_STORE.mkdir(parents=True, exist_ok=True)
OUT_IMAGES.mkdir(parents=True, exist_ok=True)

ICON_PROMPT = (
    "A professional mobile app icon for a personal life management app called PLOS. "
    "Deep navy blue gradient background from #1E3A5F top to #0F172A bottom. "
    "Center element: a clean geometric shield shape with subtle neural network "
    "or circuit lines inside in electric blue #3B82F6. Inside the shield, bold "
    "white letters PL as a monogram. The shield has a slight glow effect in blue. "
    "Overall aesthetic: premium fintech app, trustworthy, intelligent, modern. "
    "No text outside the shield. No rounded corners on the canvas — sharp square "
    "edges. Solid, no transparency."
)

FEATURE_PROMPT = (
    "A wide banner graphic for Google Play Store. Deep navy blue gradient background "
    "from #1E3A5F to #0F172A. A geometric shield with PL monogram in white on the "
    "left third of the image, electric blue #3B82F6 glow. On the right two-thirds: "
    "the text 'PLOS' in large bold white letters, below it the tagline "
    "'Your AI Life Command Center' in smaller blue #3B82F6 text. Clean, "
    "professional, premium fintech aesthetic. No rounded corners. Sharp edges."
)

def _generate(prompt: str, size: str, out_path: pathlib.Path) -> bytes:
    print(f"[GPT-Image-1] Generating {size} -> {out_path.name}")
    resp = client.images.generate(
        model="gpt-image-1", prompt=prompt, size=size,
        n=1, quality="high",
    )
    b64 = resp.data[0].b64_json
    data = base64.b64decode(b64)
    out_path.write_bytes(data)
    print(f"  saved: {len(data)/1024:.0f} KB")
    return data

# --- 1) Primary icon ------------------------------------------------------
icon_bytes = _generate(ICON_PROMPT, "1024x1024", OUT_STORE / "plos_icon_1024.png")

# --- 2) Feature graphic (GPT Image 1 supports 1536x1024 -> we downscale) ---
# GPT Image 1 supports: 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait)
feat_bytes = _generate(FEATURE_PROMPT, "1536x1024", OUT_STORE / "_feature_raw.png")
raw = Image.open(BytesIO(feat_bytes))
# Crop and resize to exactly 1024x500 (2:1 aspect band from center-ish)
# 1536x1024 -> crop to 1536x750 -> resize to 1024x500
target_ratio = 1024 / 500  # 2.048
src_w, src_h = raw.size
# height needed for target ratio at src_w:
new_h = int(src_w / target_ratio)
top = max(0, (src_h - new_h) // 2)
cropped = raw.crop((0, top, src_w, top + new_h))
banner = cropped.resize((1024, 500), Image.LANCZOS)
banner.save(OUT_STORE / "plos_feature_graphic.png", "PNG")
print("  cropped+resized feature graphic to 1024x500")
(OUT_STORE / "_feature_raw.png").unlink(missing_ok=True)

# --- 3) Downscale primary icon to all Android launcher/store sizes --------
src = Image.open(BytesIO(icon_bytes))
sizes = [512, 192, 144, 96, 72, 48]
for s in sizes:
    resized = src.resize((s, s), Image.LANCZOS)
    resized.save(OUT_STORE / f"plos_icon_{s}.png", "PNG")
    print(f"  saved plos_icon_{s}.png")

# --- 4) Wire into expo assets folder --------------------------------------
src.save(OUT_IMAGES / "icon.png", "PNG")               # main expo icon
src.save(OUT_IMAGES / "adaptive-icon.png", "PNG")      # android adaptive
# Favicon 48x48
Image.open(BytesIO(icon_bytes)).resize((48, 48), Image.LANCZOS)\
    .save(OUT_IMAGES / "favicon.png", "PNG")
print("[DONE] All 8 assets generated + wired into assets/images/")
