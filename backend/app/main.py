from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.routers import analysis

app = FastAPI(
    title="Soccer Coach AI",
    description="サッカー指導AI - 動画・画像解析によるフィードバックシステム",
    version="1.0.0"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# アップロードディレクトリの作成
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 静的ファイル（アップロードされたファイル）の配信
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ルーターの登録
app.include_router(analysis.router, prefix="/api", tags=["analysis"])


@app.get("/")
async def root():
    return {"message": "Soccer Coach AI API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
