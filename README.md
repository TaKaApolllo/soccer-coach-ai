# ⚽ Soccer Coach AI

**成長を『数値』で実感するデジタルコーチ。**
骨格推定 AI によるフォーム解析、試合映像からのフォーメーション自動判定、成長記録を 1 つにまとめた次世代サッカー指導支援アプリです。

## 主な機能

### 1. AI フォーム解析（骨格推定）
- MediaPipe Pose による 33 点の関節キーポイント抽出
- 膝・股関節・肘・体幹の角度をリアルタイム計測
- キック動作のフェーズ検出（助走 → バックスイング → インパクト → フォロースルー）
- 理想レンジとの比較による **フォームスコア（0-100）** 算出
- AR 風ネオンスケルトンのオーバーレイ表示（関節角度バッジ付き）
- GPT-4o Vision と計測値を組み合わせた、数値の根拠があるコーチング
  - API キー未設定でも計測値ベースの簡易コーチングで動作

### 2. フォーメーション自動判定（戦術ボード）
- 試合の画像・動画から選手とボールを自動検出
  - 検出バックエンドは自動選択: [RF-DETR](https://github.com/roboflow/rf-detr)（導入時）→ OpenCV HOG → 色ブロブ検出
- ユニフォーム色のクラスタリングによるチーム自動分類（GK 判別付き）
- ピッチのホモグラフィ推定による 2D コート座標への変換
- ライン構造の解析による **4-4-2 / 4-3-3 / 3-5-2 等のシステム判定**（信頼度付き）
- 選手を 2D 戦術ボード上に自動配置（整形配置 / 検出位置 / 検出写真の 3 ビュー）

### 3. 成長記録・管理
- 解析結果を SQLite に自動保存
- スキルレーダーチャート（直近 30 日 vs 前月）
- 月次スキル推移グラフ（シュート / パス / ドリブル / ポジショニング / フィジカル）
- 達成バッジ（「メッシ級キック姿勢達成！」など）
- 弱点スキルに合わせた今日の練習ドリル提案

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Python 3.10+ / FastAPI / OpenCV / MediaPipe / NumPy / SQLite |
| 選手検出 | RF-DETR（任意）/ OpenCV HOG / 色ブロブ検出 |
| AI コーチング | OpenAI Vision API (GPT-4o)（任意） |
| フロントエンド | React 18 / TypeScript / Vite / SVG チャート（自前実装） |

## セットアップ

### 1. バックエンド

```bash
cd backend

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# （任意）OpenAI API キーの設定
cp .env.example .env
# .env を編集して OPENAI_API_KEY を設定（未設定でも動作します）

# （任意）RF-DETR による高精度選手検出
# pip install rfdetr
```

### 2. フロントエンド

```bash
cd frontend
npm install
```

## 起動方法

```bash
# バックエンド (http://localhost:8000)
cd backend
uvicorn app.main:app --reload

# フロントエンド (http://localhost:5173)
cd frontend
npm run dev
```

## 使い方

1. **フォーム解析**: キックやドリブルの動画をアップロード → 骨格スケルトンと関節角度、フォームスコア、AI コーチングを確認
2. **戦術ボード**: 試合の画像・動画（俯瞰・放送映像）をアップロード → 両チームのフォーメーションが自動判定され、選手が 2D コートに配置される
3. **成長記録**: 解析を重ねるとスキルレーダーと推移グラフが自動更新され、達成バッジが解放される

> 📷 フォーム解析のコツ: 選手の全身が写るように、横から明るい場所で撮影してください。

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/pose/analyze` | 骨格推定によるフォーム解析（動画/画像） |
| POST | `/api/formation/analyze` | フォーメーション判定・選手配置 |
| POST | `/api/analyze` | Vision AI による総合解析 |
| GET | `/api/analysis-types` | 解析タイプ一覧 |
| GET | `/api/history` | 解析履歴 |
| GET/DELETE | `/api/history/{id}` | 解析結果の取得 / 削除 |
| GET | `/api/growth/summary` | スキルレーダー・練習提案・最近の解析 |
| GET | `/api/growth/trend` | 月次スキル推移 |
| GET | `/api/growth/achievements` | 達成バッジ一覧 |

API ドキュメント: http://localhost:8000/docs

## アーキテクチャ

```
backend/
  app/
    main.py                    # FastAPI エントリポイント
    db.py                      # SQLite 永続化（履歴・スキルスコア・バッジ）
    routers/
      pose.py                  # フォーム解析 API
      formation.py             # フォーメーション解析 API
      growth.py                # 成長記録 API
      analysis.py              # Vision 解析 API
    services/
      pose_estimator.py        # 骨格推定・角度計測・スコアリング・描画
      player_detector.py       # 選手/ボール検出・チーム分類・座標変換
      formation_analyzer.py    # ライン分割・フォーメーション照合
      ai_analyzer.py           # GPT-4o コーチング + 簡易フォールバック
      video_processor.py       # フレーム抽出・エンコード
frontend/
  src/
    pages/                     # ダッシュボード / フォーム解析 / 戦術ボード / 成長記録
    components/                # RadarChart, TrendChart, ScoreRing, PitchView など
```

## ライセンス

MIT License
