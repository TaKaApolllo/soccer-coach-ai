# Soccer Coach AI

AIを活用したサッカー指導支援アプリケーション。動画や画像を解析し、フォームやプレイに対する詳細なフィードバックを提供します。

## 機能

- **動画/画像アップロード**: ドラッグ&ドロップでファイルをアップロード
- **AI解析**: OpenAI Vision API (GPT-4o) による詳細なプレー分析
- **解析タイプ**:
  - キックフォーム分析
  - パス分析
  - ポジショニング分析
  - 動き出し分析
  - 総合分析
- **プロ選手参考**: メッシ、ロナウド、モドリッチなどのプレーを参考にしたアドバイス
- **練習メニュー提案**: 改善のための具体的な練習方法

## 技術スタック

### バックエンド
- Python 3.10+
- FastAPI
- OpenCV
- OpenAI API

### フロントエンド
- React 18
- TypeScript
- Vite
- React Router

## セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/YOUR_USERNAME/soccer-coach-ai.git
cd soccer-coach-ai
```

### 2. バックエンドのセットアップ

```bash
cd backend

# 仮想環境の作成
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係のインストール
pip install -r requirements.txt

# 環境変数の設定
cp .env.example .env
# .envファイルを編集してOPENAI_API_KEYを設定
```

### 3. フロントエンドのセットアップ

```bash
cd frontend

# 依存関係のインストール
npm install
```

## 起動方法

### バックエンドの起動

```bash
cd backend
uvicorn app.main:app --reload
```

サーバーが http://localhost:8000 で起動します。

### フロントエンドの起動

```bash
cd frontend
npm run dev
```

アプリケーションが http://localhost:5173 で起動します。

## 使い方

1. ブラウザで http://localhost:5173 にアクセス
2. サッカーの動画または画像をアップロード
3. 解析タイプを選択（キック、パス、ポジショニングなど）
4. 必要に応じて追加情報を入力
5. 「AI解析を開始」ボタンをクリック
6. AIからのフィードバックを確認

## API エンドポイント

- `POST /api/analyze` - 動画/画像の解析
- `GET /api/analysis-types` - 解析タイプ一覧
- `GET /api/history` - 解析履歴
- `GET /api/history/{id}` - 特定の解析結果
- `DELETE /api/history/{id}` - 解析結果の削除

## ライセンス

MIT License
