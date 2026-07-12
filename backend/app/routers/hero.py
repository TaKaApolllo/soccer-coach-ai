"""ヒーロー画像 API

Kick Form Analysis Pro 画面の中央ビューワーに表示する、フォトリアルな
選手ヒーロー画像を管理する。3 層のフォールバック構成:

1. 保存済みヒーロー画像（uploads/hero_player.png）があればそれを配信
2. OPENAI_API_KEY があれば OpenAI Images API で生成して保存
3. どちらも無ければフロントの同梱ベクターイラストにフォールバック

OpenAI 呼び出しは ai_analyzer.py と同様に import をガードし、
try/except で保護する。キー未設定・失敗時は 503 + 日本語 detail を返す。
"""

import base64
import os

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

try:
    from openai import OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:  # pragma: no cover - 環境依存
    OpenAI = None
    _OPENAI_AVAILABLE = False

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
HERO_PATH = os.path.join(UPLOAD_DIR, "hero_player.png")

# 画像アップロードの許可拡張子と上限
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5MB

# 画像生成プロンプト（固定）。実在選手の肖像・既存キャラクターを
# 想起させる語は入れない。フロントの「推奨生成プロンプト」表示にも使う。
HERO_PROMPT = (
    "Photorealistic professional soccer player in a dark navy uniform "
    "performing a powerful instep kick, side view, right leg swinging through "
    "a white ball, dramatic dark stadium with floodlights bokeh in the "
    "background, cinematic rim lighting with subtle green accent glow, sports "
    "photography style, no visible face of any real person, original "
    "fictional athlete"
)

_NO_KEY_DETAIL = (
    "OPENAI_API_KEY を設定すると画像生成できます。"
    "外部の画像生成AI（ChatGPT等）で生成した画像のアップロードも可能です"
)


def _openai_client():
    """OpenAI クライアントを返す。利用不可なら None。テストで差し替え可能。"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not (_OPENAI_AVAILABLE and api_key):
        return None
    return OpenAI(api_key=api_key)


def _generate_hero_bytes(client) -> bytes:
    """OpenAI Images API でヒーロー画像を生成し、PNG バイト列を返す。

    gpt-image-1 を優先し、失敗すれば dall-e-3 にフォールバック。
    b64_json / url いずれのレスポンス形式にも対応する。
    """
    last_err: Exception | None = None
    for model in ("gpt-image-1", "dall-e-3"):
        try:
            result = client.images.generate(
                model=model,
                prompt=HERO_PROMPT,
                size="1024x1024",
                n=1,
            )
            item = result.data[0]
            b64 = getattr(item, "b64_json", None)
            if b64:
                return base64.b64decode(b64)
            url = getattr(item, "url", None)
            if url:
                import urllib.request

                with urllib.request.urlopen(url, timeout=60) as resp:  # noqa: S310
                    return resp.read()
            raise RuntimeError("画像データが空でした")
        except Exception as exc:  # noqa: BLE001 - 次のモデルへフォールバック
            last_err = exc
            continue
    raise RuntimeError(str(last_err) if last_err else "画像生成に失敗しました")


@router.get("/hero-image")
async def get_hero_image():
    """保存済みヒーロー画像を返す。無ければ 404。"""
    if not os.path.exists(HERO_PATH):
        raise HTTPException(status_code=404, detail="ヒーロー画像は未設定です")
    return FileResponse(HERO_PATH, media_type="image/png")


@router.post("/hero-image")
async def upload_hero_image(file: UploadFile = File(...)):
    """multipart 画像アップロードを受けて uploads/hero_player.png に保存（上書き）。

    - jpg / png / webp のみ、5MB 制限
    """
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail="対応形式は jpg / png / webp です",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="空のファイルです")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="画像サイズは 5MB までです")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(HERO_PATH, "wb") as f:
        f.write(data)

    return {"ok": True, "url": "/api/hero-image"}


@router.post("/hero-image/generate")
async def generate_hero_image():
    """OpenAI Images API でヒーロー画像を生成して保存。

    キー未設定・生成失敗時は 503 + 日本語 detail。
    """
    client = _openai_client()
    if client is None:
        raise HTTPException(status_code=503, detail=_NO_KEY_DETAIL)

    try:
        image_bytes = _generate_hero_bytes(client)
    except Exception:  # noqa: BLE001 - 詳細は隠して 503
        raise HTTPException(status_code=503, detail=_NO_KEY_DETAIL)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(HERO_PATH, "wb") as f:
        f.write(image_bytes)

    return {"ok": True, "url": "/api/hero-image"}


@router.delete("/hero-image")
async def delete_hero_image():
    """ヒーロー画像を削除（デフォルトのイラストに戻す）。"""
    if os.path.exists(HERO_PATH):
        os.remove(HERO_PATH)
    return {"ok": True}
