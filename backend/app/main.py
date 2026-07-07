from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app import db
from app.routers import analysis, formation, growth, pose

app = FastAPI(
    title="Soccer Coach AI",
    description="サッカー指導AI - 骨格推定によるフォーム解析・フォーメーション判定・成長記録",
    version="2.0.0"
)

# データベースの初期化
db.init_db()

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
app.include_router(pose.router, prefix="/api", tags=["pose"])
app.include_router(formation.router, prefix="/api", tags=["formation"])
app.include_router(growth.router, prefix="/api", tags=["growth"])


@app.get("/")
async def root():
    return {"message": "Soccer Coach AI API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
