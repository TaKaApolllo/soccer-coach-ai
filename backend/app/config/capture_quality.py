"""撮影品質判定のしきい値設定（単一ソース）

キックフォーム分析の撮影品質ゲーティングで使うしきい値をすべてここに
集約する。判定ロジック（services/capture_quality.py）にマジックナンバーを
書かないこと。

区分:
    CRITICAL_* : 解析を中止する条件（status=failed + 再撮影指示）
    WARN_*     : 解析は続行するが low_confidence に落とす条件
    SCORE_*    : 0-100 スコアへの正規化パラメータ
"""

# ----------------------------------------------------------------------
# 動画そのものの要件（プリチェック。critical）
# ----------------------------------------------------------------------

# 最低解像度（これ未満は骨格推定の精度が担保できない）
CRITICAL_MIN_WIDTH_PX = 480
CRITICAL_MIN_HEIGHT_PX = 360

# 動画の長さ（秒）。キック1本の助走〜フォロースルーが収まる最小長と、
# 等間隔サンプリング（最大10フレーム）が意味を持つ最大長
CRITICAL_MIN_DURATION_SEC = 0.5
CRITICAL_MAX_DURATION_SEC = 60.0

# 最低 FPS（これ未満はインパクト前後を捉えられない）
CRITICAL_MIN_FPS = 10.0

# ----------------------------------------------------------------------
# 人物検出品質
# ----------------------------------------------------------------------

# 骨格を検出できたフレームの最低割合（これ未満は critical = 人物未検出扱い）
CRITICAL_MIN_DETECTION_RATIO = 0.2

# 複数人判定: 検出 bbox 同士の IoU がこの値未満なら「別人物」とみなす
MULTI_PERSON_IOU_THRESHOLD = 0.4
# 複数人が写っているフレームがこの割合を超えたら警告
WARN_MULTI_PERSON_FRAME_RATIO = 0.5

# 人物サイズ（骨格 bbox の高さ / 画面高さ）
WARN_MIN_PERSON_HEIGHT_RATIO = 0.25   # これ未満は「小さすぎ」警告
IDEAL_MIN_PERSON_HEIGHT_RATIO = 0.35  # スコア 100 の下限
IDEAL_MAX_PERSON_HEIGHT_RATIO = 0.90  # スコア 100 の上限（超えると見切れリスク）

# 被写体占有率（セグメンテーションマスクの画面比率）。これ未満は「遠すぎ」警告
WARN_MIN_PERSON_AREA_RATIO = 0.02

# トラッキング安定性: フレーム間の骨格 bbox 中心移動量（正規化座標）の
# 標準偏差がこの値を超えたら「ブレ・追跡不安定」警告
WARN_MAX_CENTER_JITTER = 0.18

# ----------------------------------------------------------------------
# 全身キーポイントカバレッジ
# ----------------------------------------------------------------------

# 全身判定に必要なランドマーク（MediaPipe 名）
REQUIRED_LANDMARKS = (
    "nose",
    "left_shoulder", "right_shoulder",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_foot_index", "right_foot_index",
)

# ランドマークを「見えている」とみなす最低 visibility
MIN_KEYPOINT_VISIBILITY = 0.5

# 画面内判定のマージン（正規化座標。0 未満/1 超はフレーム外）
IN_FRAME_MARGIN = 0.02

# 各ランドマークが「カバーされている」とみなす、可視フレームの最低割合
REQUIRED_LANDMARK_FRAME_RATIO = 0.6

# fullBodyVisible = true に必要なカバレッジ（%）
FULL_BODY_MIN_COVERAGE_PCT = 90

# ----------------------------------------------------------------------
# 画質（明るさ・コントラスト・ブラー）
# ----------------------------------------------------------------------

# 平均輝度（0-255）。この帯域内でスコア 100
BRIGHTNESS_IDEAL_MIN = 70.0
BRIGHTNESS_IDEAL_MAX = 190.0
# 帯域外の減点勾配（この幅だけ外れたらスコア 0）
BRIGHTNESS_FALLOFF = 60.0
# 警告を出すスコアしきい値
WARN_BRIGHTNESS_SCORE = 50

# コントラスト（輝度の標準偏差）。これ未満は「フラット/暗所」警告に含める
WARN_MIN_CONTRAST_STD = 20.0

# モーションブラー（Laplacian 分散）。この値以上でスコア 100、
# BLUR_ZERO_VAR 以下でスコア 0（線形補間）
BLUR_GOOD_VARIANCE = 150.0
BLUR_ZERO_VARIANCE = 20.0
# 警告を出すスコアしきい値
WARN_BLUR_SCORE = 40

# ----------------------------------------------------------------------
# カメラビュー分類（肩・腰・鼻キーポイントの幾何）
# ----------------------------------------------------------------------

# |肩の左右 x 差| / 人物高さ。これ未満なら側面（side）
VIEW_SIDE_MAX_SHOULDER_RATIO = 0.16
# これ以上なら正面/背面（front/rear）。中間は diagonal
VIEW_FRONTAL_MIN_SHOULDER_RATIO = 0.30
# front / rear の判別: 鼻の visibility がこの値以上なら front
VIEW_FRONT_MIN_NOSE_VISIBILITY = 0.5

# 角度系メトリクスを全信頼できるビュー / 制限するビュー
ANGLE_RELIABLE_VIEWS = ("side",)
ANGLE_SEMI_RELIABLE_VIEWS = ("diagonal",)
# それ以外（front/rear/unknown）は角度系メトリクスを low_confidence に制限

# ----------------------------------------------------------------------
# キーポイント信頼度・フレーム除外
# ----------------------------------------------------------------------

# フレームを「信頼できる」とみなす、主要関節の最低 visibility
FRAME_RELIABLE_MIN_VISIBILITY = 0.5
# 信頼できないフレームの許容割合（超えたら警告）
WARN_MAX_UNRELIABLE_FRAME_RATIO = 0.4

# メトリクス ID → 依存する関節グループ（confidence = グループ内の最小信頼度）
METRIC_JOINT_DEPENDENCIES = {
    "torso_lean": ("left_shoulder", "right_shoulder", "left_hip", "right_hip"),
    "pelvis_tilt": ("left_hip", "right_hip"),
    "support_leg": ("left_hip", "right_hip", "left_knee", "right_knee",
                    "left_ankle", "right_ankle"),
    "backswing": ("left_hip", "right_hip", "left_knee", "right_knee",
                  "left_ankle", "right_ankle"),
    "knee_impact": ("left_hip", "right_hip", "left_knee", "right_knee",
                    "left_ankle", "right_ankle"),
    "ankle_impact": ("left_knee", "right_knee", "left_ankle", "right_ankle",
                     "left_foot_index", "right_foot_index"),
    "follow_through": ("left_hip", "right_hip", "left_knee", "right_knee"),
    "arm_extension": ("left_shoulder", "right_shoulder", "left_elbow",
                      "right_elbow", "left_wrist", "right_wrist"),
}

# ----------------------------------------------------------------------
# 総合スコアの重み（合計 1.0）
# ----------------------------------------------------------------------

SCORE_WEIGHT_PERSON = 0.30      # 人物検出・サイズ
SCORE_WEIGHT_COVERAGE = 0.25    # 全身キーポイントカバレッジ
SCORE_WEIGHT_IMAGE = 0.25       # 明るさ・ブラー
SCORE_WEIGHT_VIEW = 0.20        # カメラビュー

# ビュー別のビュースコア
VIEW_SCORES = {"side": 100, "diagonal": 70, "front": 40, "rear": 40, "unknown": 30}

# status（MeasurementStatus）判定: 総合スコアがこの値未満なら low_confidence
LOW_CONFIDENCE_QUALITY_SCORE = 60
