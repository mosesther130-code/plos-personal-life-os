"""Generate PLOS store assets via Gemini Nano Banana (gemini-3.1-flash-image-preview)
through the Emergent LLM Universal Key. Then downscale to all Android
launcher/store sizes via Pillow.

Outputs:
  /app/frontend/assets/store/plos_icon_1024.png    (primary source, from Nano Banana)
  /app/frontend/assets/store/plos_icon_512.png     (Play Store listing)
  /app/frontend/assets/store/plos_icon_192.png     (xxxhdpi)
  /app/frontend/assets/store/plos_icon_180.png     (iOS default)
  /app/frontend/assets/store/plos_icon_152.png     (iPad)
  /app/frontend/assets/store/plos_icon_144.png     (xxhdpi)
  /app/frontend/assets/store/plos_icon_96.png      (xhdpi)
  /app/frontend/assets/store/plos_icon_72.png      (hdpi)
  /app/frontend/assets/store/plos_icon_48.png      (mdpi + notification)
  /app/frontend/assets/store/plos_feature_graphic.png (1024x500 Play banner)
  /app/frontend/assets/images/icon.png             (expo main icon)
  /app/frontend/assets/images/adaptive-icon.png    (android adaptive fg)
  /app/frontend/assets/images/favicon.png          (48x48 favicon)
"""
import asyncio
import base64
import os
import pathlib
import sys
from io import BytesIO

from PIL import Image
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

KEY = os.getenv("EMERGENT_LLM_KEY", "").strip()
if not KEY:
    print("ERROR: EMERGENT_LLM_KEY missing in /app/backend/.env")
    sys.exit(1)

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUT_STORE = pathlib.Path("/app/frontend/assets/store")
OUT_IMAGES = pathlib.Path("/app/frontend/assets/images")
OUT_STORE.mkdir(parents=True, exist_ok=True)
OUT_IMAGES.mkdir(parents=True, exist_ok=True)

MODEL = "gemini-3.1-flash-image-preview"

ICON_PROMPT = (
    "Generate a professional square mobile app icon for a personal life "
    "management app called PLOS. Deep navy blue vertical gradient background "
    "from #1E3A5F at the top to #0F172A at the bottom filling the entire "
    "square. Center element: one large clean geometric shield shape (heraldic "
    "style) with subtle electric blue #3B82F6 neural-network / circuit lines "
    "traced inside it. In the center of the shield, place bold white uppercase "
    "letters 'PL' as a modern monogram. The shield has a soft electric blue "
    "glow around its outer edge. Premium fintech aesthetic \u2014 trustworthy, "
    "intelligent, modern. Sharp square canvas corners (no rounding). Solid "
    "background \u2014 absolutely no transparency. Output a single image."
)

FEATURE_PROMPT = (
    "Generate a wide landscape banner graphic for the Google Play Store, "
    "aspect ratio close to 2:1. Deep navy blue horizontal gradient background "
    "from #1E3A5F on the left to #0F172A on the right filling the entire "
    "canvas. On the left third: the exact same geometric shield with a bold "
    "white 'PL' monogram inside and electric blue #3B82F6 circuit lines and "
    "outer glow. On the right two thirds: the text 'PLOS' in very large, bold, "
    "clean white sans-serif letters. Below the PLOS text, in a smaller "
    "electric blue #3B82F6 sans-serif font: 'Your AI Life Command Center'. "
    "Premium fintech aesthetic. Sharp square canvas corners. Solid background "
    "\u2014 no transparency. Output a single image."
)


async def _gen(session_id: str, prompt: str) -> bytes:
    print(f"[NanoBanana] {session_id} \u2014 generating...")
    chat = LlmChat(
        api_key=KEY,
        session_id=session_id,
        system_message="You are an expert brand designer producing production-ready mobile app store assets.",
    )
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    msg = UserMessage(text=prompt)
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        raise RuntimeError(
            f"[NanoBanana] No image returned for {session_id}. Text: {text[:200]!r}"
        )
    img = images[0]
    data = base64.b64decode(img["data"])
    print(f"[NanoBanana] {session_id} \u2014 got {len(data) // 1024} KB, "
          f"mime={img.get('mime_type','?')}")
    return data


async def main():
    # --- 1) Primary icon ------------------------------------------------
    icon_bytes = await _gen("plos-icon-primary", ICON_PROMPT)
    (OUT_STORE / "plos_icon_1024_raw.png").write_bytes(icon_bytes)
    # Normalize to exactly 1024x1024 (Nano Banana may output non-square)
    src = Image.open(BytesIO(icon_bytes)).convert("RGB")
    # Center-crop to square
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    src_sq = src.crop((left, top, left + side, top + side))
    icon_1024 = src_sq.resize((1024, 1024), Image.LANCZOS)
    icon_1024.save(OUT_STORE / "plos_icon_1024.png", "PNG")
    print("  \u2713 plos_icon_1024.png (normalized square 1024x1024)")

    # --- 2) Feature graphic --------------------------------------------
    feat_bytes = await _gen("plos-feature-graphic", FEATURE_PROMPT)
    (OUT_STORE / "_feature_raw.png").write_bytes(feat_bytes)
    raw = Image.open(BytesIO(feat_bytes)).convert("RGB")
    # Crop to 2.048:1 aspect ratio (1024/500) from horizontal center band.
    src_w, src_h = raw.size
    target_ratio = 1024 / 500
    if src_w / src_h > target_ratio:
        # too wide \u2014 crop left/right
        new_w = int(src_h * target_ratio)
        left = (src_w - new_w) // 2
        cropped = raw.crop((left, 0, left + new_w, src_h))
    else:
        # too tall \u2014 crop top/bottom
        new_h = int(src_w / target_ratio)
        top = (src_h - new_h) // 2
        cropped = raw.crop((0, top, src_w, top + new_h))
    banner = cropped.resize((1024, 500), Image.LANCZOS)
    banner.save(OUT_STORE / "plos_feature_graphic.png", "PNG")
    print("  \u2713 plos_feature_graphic.png (1024x500)")
    (OUT_STORE / "_feature_raw.png").unlink(missing_ok=True)

    # --- 3) Downscale primary icon to all sizes -----------------------
    sizes = [512, 192, 180, 152, 144, 96, 72, 48]
    for s in sizes:
        icon_1024.resize((s, s), Image.LANCZOS).save(
            OUT_STORE / f"plos_icon_{s}.png", "PNG"
        )
        print(f"  \u2713 plos_icon_{s}.png")

    # --- 4) Wire into expo assets folder ------------------------------
    icon_1024.save(OUT_IMAGES / "icon.png", "PNG")
    icon_1024.save(OUT_IMAGES / "adaptive-icon.png", "PNG")
    icon_1024.resize((196, 196), Image.LANCZOS).save(
        OUT_IMAGES / "favicon.png", "PNG"
    )
    # Splash screen \u2014 use the same icon at ~200px
    icon_1024.resize((200, 200), Image.LANCZOS).save(
        OUT_IMAGES / "splash-image.png", "PNG"
    )
    print("[DONE] Nano Banana produced all assets \u2014 wired into "
          "assets/images/{icon.png, adaptive-icon.png, favicon.png, "
          "splash-image.png}")


if __name__ == "__main__":
    asyncio.run(main())
