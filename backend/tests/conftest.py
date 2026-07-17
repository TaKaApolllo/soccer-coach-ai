"""pytest 共通設定

- backend ディレクトリを import パスに追加（`from app ...` を可能に）
- httpx>=0.28 は starlette 0.35 の TestClient と非互換のため、
  ASGITransport ベースの同期ヘルパー `api_client` を提供する
"""

import asyncio
import os
import sys
from typing import Optional

import httpx
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class SyncASGIClient:
    """httpx.AsyncClient(ASGITransport) を同期 API で使う薄いラッパー"""

    def __init__(self, app):
        self._app = app

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self._request("GET", url, **kwargs)

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        async def run():
            transport = httpx.ASGITransport(app=self._app)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://testserver"
            ) as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(run())


@pytest.fixture()
def api_client():
    from app.main import app

    return SyncASGIClient(app)


@pytest.fixture()
def temp_db(monkeypatch, tmp_path):
    """テスト専用の一時 SQLite DB に差し替える"""
    from app import db

    db_path = str(tmp_path / "test_soccer_coach.db")
    monkeypatch.setattr(db, "DB_PATH", db_path)
    db.init_db()
    return db
