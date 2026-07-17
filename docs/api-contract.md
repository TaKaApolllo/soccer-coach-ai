# キックフォーム分析 API 契約 v1.0

フロントエンド（TypeScript）とバックエンド（Pydantic）で共有するデータ契約。

| 実装 | 場所 |
|---|---|
| 正となる契約（TS） | `frontend/src/types/kickAnalysis.ts` |
| バックエンド実装（Pydantic） | `backend/app/schemas/kick_analysis.py` |
| 旧形式 → v1.0 アダプタ（BE） | `backend/app/services/kick_analysis_adapter.py` |
| 旧形式 → v1.0 アダプタ（FE, フォールバック用） | `frontend/src/types/kickAnalysis.ts` の `kickAnalysisFromPoseResponse` |
| 理想角度レンジ単一ソース | BE: `backend/app/schemas/ideal_form.py` / FE: `frontend/src/constants/idealForm.ts`（同値を維持すること） |
| 契約テスト | `backend/tests/test_kick_analysis_contract.py`（pytest） |

## 単位・値の規約

| 項目 | 規約 |
|---|---|
| confidence | `0.0 – 1.0` |
| score 系 | `0 – 100`（整数） |
| 角度 | 度（`unit: "deg"`） |
| 時間 | ミリ秒（`durationMs` 等） |
| フレーム | 0 始まりの整数 |
| 命名 | JSON は camelCase |
| **測定不能** | **0 で表現しない**。値は `null` とし、`measurementStatus` / `CaptureQuality.status` で「測れなかった」ことを明示する |
| 余剰フィールド | 禁止（Pydantic `extra="forbid"`） |

## エンドポイント

既存エンドポイント（`/api/pose/analyze`, `/api/history*`）は**無変更**（後方互換維持）。
契約 v1.0 は新設の以下で提供する。

| メソッド/パス | 説明 |
|---|---|
| `GET /api/v1/kick-analysis/latest?include_source=` | 最新のキックフォーム解析（契約 v1.0） |
| `GET /api/v1/kick-analysis/{analysisId}?include_source=` | ID 指定取得 |
| `GET /api/v1/kick-analysis?limit=` | 履歴一覧 `{ items: KickHistoryEntry[] }` |

応答はエンベロープ形式:

```
{ "analysis": KickAnalysisResult, "source": <旧APIペイロード> | null }
```

- `analysis` — Pydantic で実行時検証済みの契約オブジェクト
- `source` — `include_source=true` のときのみ。旧 `PoseAnalysisResponse` 互換の生ペイロード
  （base64 フレーム画像等の表示素材）。契約本体に重い画像を含めないための分離
- 変換・検証に失敗しても **500 を返さない**。`analysis.status = "failed"` +
  `captureQuality.warnings` に理由を載せた構造化応答を返す。リソース不存在のみ 404

## enum 一覧（TS / Pydantic で値完全一致）

| enum | 値 |
|---|---|
| `AnalysisStatus` | `queued` `processing` `completed` `low_confidence` `failed` |
| `MeasurementStatus` | `available` `low_confidence` `unavailable` |
| `MetricStatus` | `excellent` `good` `warning` `poor` `unknown` |
| `CameraView` | `side` `front` `rear` `diagonal` `unknown` |
| `MotionPhaseType` | `approach` `backswing` `support_plant` `impact` `follow_through` |
| `VideoOrientation` | `landscape` `portrait` `unknown` |
| `FeedbackSeverity` | `high` `mid` `low` |

## 型定義

### KickAnalysisResult（ルート）

| フィールド | 型 | 説明 |
|---|---|---|
| `schemaVersion` | `"1.0"` | 契約バージョン（固定） |
| `analysisId` | `string` | 解析 ID |
| `status` | `AnalysisStatus` | 解析ジョブの状態 |
| `createdAt` | `string` | ISO 8601 |
| `video` | `VideoInfo` | 動画メタ |
| `captureQuality` | `CaptureQuality` | 撮影品質・信頼度の根拠 |
| `phases` | `MotionPhaseSegment[]` | キック動作フェーズ区間 |
| `scores` | `KickScores` | 総合 + 部位別スコア |
| `metrics` | `KickMetric[]` | 計測値一覧 |
| `feedback` | `KickFeedback` | 強み / 改善優先度 / ドリル |
| `history` | `KickHistoryEntry[]` | 解析履歴 |

### VideoInfo

| フィールド | 型 | 備考 |
|---|---|---|
| `durationMs` | `number \| null` | 動画長（ms） |
| `fps` | `number \| null` | 現行 API は null |
| `width` / `height` | `number \| null` | 現行 API は null |
| `orientation` | `VideoOrientation` | 現行 API は `unknown` |

### CaptureQuality（#22 で本実装・optional 拡張あり）

| フィールド | 型 | 備考 |
|---|---|---|
| `score` | `number(0-100) \| null` | 撮影品質の総合スコア（人物30% + カバレッジ25% + 画質25% + ビュー20% の加重。人物未検出時は null） |
| `status` | `MeasurementStatus` | |
| `cameraView` | `CameraView` | 肩幅比 + 鼻可視性から推定。`side` 推奨。front/rear/unknown では角度系メトリクスが `low_confidence` に制限される |
| `fullBodyVisible` | `boolean` | 全身キーポイントカバレッジ ≥ 90% |
| `singlePersonDetected` | `boolean` | HOG 検出 bbox の IoU クラスタ数で近似 |
| `personScaleScore` | `number(0-100) \| null` | 人物サイズの適正度（#22 optional 拡張） |
| `brightnessScore` | `number(0-100) \| null` | 輝度ヒストグラム平均から算出 |
| `blurScore` | `number(0-100) \| null` | Laplacian 分散から算出（大きいほどシャープ） |
| `keypointCoverage` | `number(0-100) \| null` | 頭・肩・腰・膝・足首・つま先の可視率（#22 optional 拡張） |
| `warnings` | `string[]` | ユーザー向け警告 |
| `retakeInstructions` | `string[]` | 具体的な再撮影ガイダンス（#22 optional 拡張。UI ではスコアより前に表示） |

しきい値はすべて `backend/app/config/capture_quality.py` に集約（判定ロジックは
`backend/app/services/capture_quality.py` の純粋関数群）。

**品質ゲーティング**（保存される `capture_quality.level`）:

| level | 条件（例） | 契約上の status |
|---|---|---|
| `critical` | 人物未検出 / 解像度不足 / 動画が短すぎ・長すぎ / FPS 不足 | `failed`（解析中止 + 再撮影指示） |
| `warning` | 暗い / ブラー / 縦向き / 見切れ / 人物小 / 複数人 / 正面撮り / 関節検出不安定 | `low_confidence`（結果は表示） |
| `ok` | 問題なし | `completed` |

### MotionPhaseSegment

| フィールド | 型 |
|---|---|
| `type` | `MotionPhaseType` |
| `startFrame` / `peakFrame` / `endFrame` | `int ≥ 0` |
| `confidence` | `number(0-1)` |

### KickScores（各値 `number(0-100) | null`。測定不能は null）

`overall` / `supportLeg` / `kickingLeg` / `upperBody` / `balance` / `followThrough`

### KickMetric

| フィールド | 型 | 備考 |
|---|---|---|
| `id` | `string` | 安定キー（`torso_lean` `pelvis_tilt` `support_leg` `backswing` `knee_impact` `ankle_impact` `follow_through` `arm_extension` `ball_speed`） |
| `label` | `string` | 日本語表示名 |
| `value` | `number \| null` | 測定不能は null |
| `unit` | `string` | `"deg"` / `"km/h"` 等 |
| `frame` | `int?` | 計測フレーム |
| `phase` | `MotionPhaseType?` | |
| `idealRange` | `{min, max}?` | 理想レンジ（単一ソース由来） |
| `confidence` | `number(0-1)` | |
| `status` | `MetricStatus` | レンジ中央50%=excellent / レンジ内=good / 逸脱≤レンジ幅25%=warning / それ以上=poor |
| `measurementStatus` | `MeasurementStatus` | |

### KickFeedback

| フィールド | 型 |
|---|---|
| `strengths` | `string[]` |
| `priorities` | `{rank≥1, label, issue, advice, severity: FeedbackSeverity, relatedMetricId?}[]` |
| `drills` | `{id, title, focus, durationMinutes: int\|null, tag}[]` |

### KickHistoryEntry

`{ analysisId, createdAt, overallScore: number(0-100)|null, thumbnailUrl: string|null }`

## 旧形式 → v1.0 フィールド対応表

| 旧（`PoseAnalysisResponse` / 保存ペイロード） | 新（v1.0） | 変換ルール |
|---|---|---|
| `id` | `analysisId` | そのまま |
| `created_at` | `createdAt` | そのまま |
| `score`（トップレベル） / `pose.score` | `scores.overall` | トップレベル優先 |
| `duration`（秒） | `video.durationMs` | ×1000 して丸め |
| `pose.metrics.detection_rate` | `captureQuality.score`（×100）、各 `confidence` | 0-1 → 0-100 / そのまま |
| `pose.frames[].phase`（日本語） | `phases[].type` | 助走・踏み込み→`approach` / バックスイング→`backswing` / インパクト→`impact` / フォロースルー→`follow_through`（`support_plant` は現行 API 未出力） |
| `pose.timeline[].intensity` | `phases[].peakFrame` | 区間内 intensity 最大のフレーム |
| `pose.key_angles[]`（key/value） | `metrics[]`（deg） | `idealRange` は理想レンジ単一ソースから付与。`ideal`（単一値）は廃止 |
| `ball_speed.speed_kmh` | `metrics[id=ball_speed]` | 概算のため常に `measurementStatus: low_confidence`。無ければ `value: null` + `unavailable` |
| `pose.body_part_scores.{plant_leg, kicking_leg, upper_body, balance}.score` | `scores.{supportLeg, kickingLeg, upperBody, balance}` | 無い部位は null |
| （なし） | `scores.followThrough` | `key_angles.follow_through` から暫定導出（レンジ逸脱 1° につき 2.5 点減）。v1.1 で正式配布予定 |
| `ai_feedback.sections.good_points`（箇条書き文字列） | `feedback.strengths[]` | 行分割 + 記号除去 |
| `pose.improvement_rankings[]` | `feedback.priorities[]` | rank/label/issue/advice/severity をそのまま |
| `ai_feedback.sections.practice_menu`（文字列） | `feedback.drills[]` | タイトル分離 + 「N分」を `durationMinutes` に抽出 |
| `pose_error` / 検出失敗 | `captureQuality.warnings[]` + `status: low_confidence` | 検出ゼロや低検出率は `failed` ではなく `low_confidence`（結果は返す） |
| `pose.annotated_images` 等（base64 画像） | **契約に含めない** | `include_source=true` の `source` で旧形式のまま取得 |

### AnalysisStatus の決定規則（アダプタ）

1. 変換・検証エラー → `failed`（+ warnings に理由）
2. 骨格未検出（`score_breakdown` 空）or `detection_rate < 0.5` → `low_confidence`
3. それ以外 → `completed`
4. `queued` / `processing` は非同期ジョブ化（将来）用の予約値

## サンプル JSON（実応答・抜粋）

```json
{
  "analysis": {
    "schemaVersion": "1.0",
    "analysisId": "5111f6d7-426c-4061-85f6-383b6da72f26",
    "status": "completed",
    "createdAt": "2026-07-07T23:19:38.391729",
    "video": { "durationMs": 4900, "fps": null, "width": null, "height": null, "orientation": "unknown" },
    "captureQuality": {
      "score": 100, "status": "available", "cameraView": "unknown",
      "fullBodyVisible": true, "singlePersonDetected": true,
      "brightnessScore": null, "blurScore": null, "warnings": []
    },
    "phases": [
      { "type": "backswing", "startFrame": 0, "peakFrame": 0, "endFrame": 0, "confidence": 1.0 },
      { "type": "impact", "startFrame": 1, "peakFrame": 1, "endFrame": 1, "confidence": 1.0 },
      { "type": "follow_through", "startFrame": 2, "peakFrame": 5, "endFrame": 7, "confidence": 1.0 }
    ],
    "scores": {
      "overall": 71, "supportLeg": null, "kickingLeg": null,
      "upperBody": null, "balance": null, "followThrough": 86
    },
    "metrics": [
      {
        "id": "torso_lean", "label": "上半身の傾き", "value": 0.8, "unit": "deg",
        "frame": 1, "phase": null, "idealRange": { "min": 5.0, "max": 25.0 },
        "confidence": 1.0, "status": "warning", "measurementStatus": "available"
      },
      {
        "id": "ball_speed", "label": "推定シュート速度", "value": 98.0, "unit": "km/h",
        "frame": null, "phase": null, "idealRange": null,
        "confidence": 0.6, "status": "excellent", "measurementStatus": "low_confidence"
      }
    ],
    "feedback": { "strengths": [], "priorities": [], "drills": [] },
    "history": [
      {
        "analysisId": "5111f6d7-426c-4061-85f6-383b6da72f26",
        "createdAt": "2026-07-07T23:19:38.391729",
        "overallScore": 71,
        "thumbnailUrl": "/api/history/5111f6d7-426c-4061-85f6-383b6da72f26/thumbnail"
      }
    ]
  },
  "source": null
}
```

## フロントエンドの受信規約

1. `services/kickAnalysisApi.ts` が v1 エンドポイントを優先取得
2. 応答は `parseKickAnalysisResult`（`types/kickAnalysis.ts`）で**受信時に構造検証**。
   契約違反なら旧 API + クライアント側アダプタへフォールバック
3. 双方失敗時は `null` を返し、画面は idle（サンプル表示）へ遷移（クラッシュしない）
4. `analysis.status === "failed"` は画面の failed 状態（理由 + 再試行 + 次の行動）に対応

## 旧レコードとの互換（#22 以降）

- 解析時に `payload.capture_quality`（品質評価）と `payload.video_meta`（fps/解像度/向き）が
  保存され、アダプタはこれを優先する。**#22 以前の旧レコードには存在しない**ため、
  その場合は従来どおり検出率ベースのフォールバック（cameraView `unknown`、
  brightness/blur/personScale/keypointCoverage は null、video.fps 等は null）
- メトリクスへの反映: `metric_confidences`（関節グループの visibility 最小値）で
  confidence を上書き、`angle_metrics_restricted` / `unreliable_frame_indices` に
  該当する角度メトリクスは `measurementStatus: low_confidence` に降格

## 既知の暫定事項（v1.1 で解消予定）

- `scores.followThrough` — アダプタでの暫定導出（バックエンドの部位別スコアラー拡張で正式化）
- 複数人判定は HOG 歩行者検出 + bbox IoU の近似（専用検出器の導入で精度向上余地）
- 理想レンジ単一ソースの FE/BE 二重管理 — FE を API 配布値（`metrics[].idealRange`）参照へ完全移行したら FE 定義を削除
