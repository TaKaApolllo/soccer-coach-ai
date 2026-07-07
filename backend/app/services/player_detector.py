"""選手・ボール検出エンジン

試合映像（放送映像・俯瞰映像・スタンドからの撮影）から
- ピッチ領域の検出（芝の緑色マスク）
- 選手のバウンディングボックス検出
- ユニフォーム色によるチーム分類（KMeans クラスタリング）
- ボール検出
- ピッチ座標（105m x 68m）への射影変換
を行う。

検出バックエンドは環境に応じて自動選択する:
1. RF-DETR (https://github.com/roboflow/rf-detr) — 導入されていれば最優先。
   COCO 学習済みの DETR 系リアルタイム検出器で person / sports ball を検出。
2. OpenCV HOG 人物検出器 — 追加依存なしのフォールバック。
3. 色ブロブ検出 — 芝マスク上の非緑領域から人物らしい形状を抽出する最終手段。
"""

import base64
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

try:
    from rfdetr import RFDETRBase  # type: ignore
    _RFDETR_AVAILABLE = True
except ImportError:
    RFDETRBase = None
    _RFDETR_AVAILABLE = False

# COCO クラス ID
COCO_PERSON = 1
COCO_SPORTS_BALL = 37

# 標準的なピッチサイズ (m)
PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

# 描画カラー (BGR)
TEAM_A_COLOR = (119, 174, 28)   # green #1CAE77
TEAM_B_COLOR = (229, 135, 57)   # blue  #3987E5
BALL_COLOR = (0, 213, 255)
BOX_THICKNESS = 2


@dataclass
class DetectedPlayer:
    bbox: Tuple[int, int, int, int]          # x1, y1, x2, y2
    confidence: float
    team: int = -1                            # 0 / 1、-1 は未分類
    jersey_color_bgr: Tuple[int, int, int] = (128, 128, 128)
    pitch_xy: Optional[Tuple[float, float]] = None  # 0-1 正規化ピッチ座標
    is_goalkeeper: bool = False


@dataclass
class DetectionResult:
    players: List[DetectedPlayer] = field(default_factory=list)
    ball_bbox: Optional[Tuple[int, int, int, int]] = None
    ball_pitch_xy: Optional[Tuple[float, float]] = None
    backend: str = ""
    annotated_image_b64: str = ""


def _kmeans(data: np.ndarray, k: int, iters: int = 30, seed: int = 7) -> Tuple[np.ndarray, np.ndarray]:
    """依存を増やさないための最小 KMeans 実装 (data: N x D)"""
    rng = np.random.default_rng(seed)
    n = data.shape[0]
    if n <= k:
        labels = np.arange(n) % k
        centers = np.array([data[labels == i].mean(axis=0) if np.any(labels == i) else data[0]
                            for i in range(k)])
        return labels, centers

    centers = data[rng.choice(n, size=k, replace=False)].astype(np.float64)
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        dists = np.linalg.norm(data[:, None, :] - centers[None, :, :], axis=2)
        new_labels = dists.argmin(axis=1)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for i in range(k):
            mask = labels == i
            if np.any(mask):
                centers[i] = data[mask].mean(axis=0)
    return labels, centers


class PlayerDetector:
    """選手・ボール検出 + チーム分類 + ピッチ座標変換"""

    def __init__(self):
        self._rfdetr = None
        if _RFDETR_AVAILABLE:
            try:
                self._rfdetr = RFDETRBase()
            except Exception:
                self._rfdetr = None

        self._hog = cv2.HOGDescriptor()
        self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    # ------------------------------------------------------------------
    # 公開 API
    # ------------------------------------------------------------------

    def detect(self, frame_bgr: np.ndarray) -> DetectionResult:
        """1フレームから選手・ボールを検出し、ピッチ座標に変換する"""
        result = DetectionResult()

        field_mask = self._field_mask(frame_bgr)
        homography = self._estimate_homography(field_mask, frame_bgr.shape)

        players, backend = self._detect_players(frame_bgr, field_mask)
        result.backend = backend

        ball = self._detect_ball(frame_bgr, field_mask)
        result.ball_bbox = ball

        # ボールが選手ブロブとして重複検出されている場合は除外
        if ball is not None:
            bx = (ball[0] + ball[2]) / 2
            by = (ball[1] + ball[3]) / 2
            ball_area = max(1, (ball[2] - ball[0]) * (ball[3] - ball[1]))
            players = [
                p for p in players
                if not (
                    p.bbox[0] <= bx <= p.bbox[2]
                    and p.bbox[1] <= by <= p.bbox[3]
                    and (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]) < ball_area * 6
                )
            ]

        self._assign_teams(frame_bgr, players)
        self._project_to_pitch(players, ball, result, homography, field_mask, frame_bgr.shape)

        result.players = players
        result.annotated_image_b64 = self._annotate(frame_bgr, result)
        return result

    # ------------------------------------------------------------------
    # ピッチ領域
    # ------------------------------------------------------------------

    def _field_mask(self, frame: np.ndarray) -> np.ndarray:
        """芝（緑色）領域のマスクを生成"""
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, (30, 40, 40), (90, 255, 255))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        # 最大連結成分のみ残す
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        clean = np.zeros_like(mask)
        if contours:
            largest = max(contours, key=cv2.contourArea)
            if cv2.contourArea(largest) > 0.05 * mask.size:
                cv2.drawContours(clean, [largest], -1, 255, -1)
                return clean
        return mask

    def _estimate_homography(self, field_mask: np.ndarray, shape) -> Optional[np.ndarray]:
        """ピッチ輪郭の四角形近似からホモグラフィを推定（俯瞰映像向け）

        放送カメラのような部分視野では四角形近似が成立しないことが多く、
        その場合は None を返してマスク範囲による正規化にフォールバックする。
        """
        contours, _ = cv2.findContours(field_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        largest = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest) < 0.15 * field_mask.size:
            return None

        peri = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
        if len(approx) != 4:
            return None

        quad = approx.reshape(4, 2).astype(np.float32)
        # 左上→右上→右下→左下 に並べ替え
        s = quad.sum(axis=1)
        d = np.diff(quad, axis=1).ravel()
        ordered = np.array([
            quad[np.argmin(s)], quad[np.argmin(d)],
            quad[np.argmax(s)], quad[np.argmax(d)],
        ], dtype=np.float32)

        dst = np.array([
            [0, 0], [PITCH_LENGTH, 0],
            [PITCH_LENGTH, PITCH_WIDTH], [0, PITCH_WIDTH],
        ], dtype=np.float32)
        return cv2.getPerspectiveTransform(ordered, dst)

    # ------------------------------------------------------------------
    # 選手検出（バックエンド自動選択）
    # ------------------------------------------------------------------

    def _detect_players(self, frame: np.ndarray, field_mask: np.ndarray) -> Tuple[List[DetectedPlayer], str]:
        if self._rfdetr is not None:
            players = self._detect_rfdetr(frame)
            if players:
                filtered = self._filter_on_field(players, field_mask)
                if len(filtered) >= 2:
                    return filtered, "rf-detr"

        hog_players = self._filter_on_field(self._detect_hog(frame), field_mask)

        # HOG は遠景の小さい選手を取りこぼしやすい。
        # チーム分析に足りない場合は色ブロブ検出と比較して多い方を採用する。
        if len(hog_players) >= 8:
            return hog_players, "opencv-hog"

        blob_players = self._detect_blobs(frame, field_mask)
        if len(hog_players) >= len(blob_players):
            return (hog_players, "opencv-hog") if hog_players else (blob_players, "color-blob")
        return blob_players, "color-blob"

    def _detect_rfdetr(self, frame: np.ndarray) -> List[DetectedPlayer]:
        try:
            from PIL import Image
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            detections = self._rfdetr.predict(Image.fromarray(rgb), threshold=0.4)
            players = []
            for xyxy, cls_id, conf in zip(detections.xyxy, detections.class_id, detections.confidence):
                if int(cls_id) == COCO_PERSON:
                    x1, y1, x2, y2 = [int(v) for v in xyxy]
                    players.append(DetectedPlayer(bbox=(x1, y1, x2, y2), confidence=float(conf)))
            return players
        except Exception:
            return []

    def _detect_hog(self, frame: np.ndarray) -> List[DetectedPlayer]:
        h, w = frame.shape[:2]
        scale = min(1.0, 960 / max(h, w))
        small = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1.0 else frame
        try:
            rects, weights = self._hog.detectMultiScale(
                small, winStride=(8, 8), padding=(8, 8), scale=1.05
            )
        except cv2.error:
            return []

        players = []
        for (x, y, bw, bh), wgt in zip(rects, weights):
            players.append(DetectedPlayer(
                bbox=(int(x / scale), int(y / scale),
                      int((x + bw) / scale), int((y + bh) / scale)),
                confidence=float(wgt),
            ))
        return players

    def _detect_blobs(self, frame: np.ndarray, field_mask: np.ndarray) -> List[DetectedPlayer]:
        """芝マスク内の非緑領域から人物らしいブロブを抽出（最終フォールバック）"""
        if field_mask.sum() == 0:
            return []

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        green = cv2.inRange(hsv, (30, 40, 40), (90, 255, 255))
        non_green = cv2.bitwise_and(cv2.bitwise_not(green), field_mask)

        # ピッチの白線（細い白領域）を除去する。除去しないと
        # センターサークル等のリング内側にいる選手が RETR_EXTERNAL の
        # 子輪郭となって検出漏れするうえ、線の断片が選手として誤検出される。
        # 太い白領域（白ユニフォームの選手）はオープニングで残す。
        white = cv2.inRange(hsv, (0, 0, 170), (180, 70, 255))
        thick_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        thick_white = cv2.morphologyEx(white, cv2.MORPH_OPEN, thick_kernel)
        thin_lines = cv2.subtract(white, thick_white)
        thin_lines = cv2.dilate(thin_lines, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        non_green = cv2.bitwise_and(non_green, cv2.bitwise_not(thin_lines))

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        non_green = cv2.morphologyEx(non_green, cv2.MORPH_OPEN, kernel)
        non_green = cv2.dilate(non_green, kernel, iterations=2)

        contours, _ = cv2.findContours(non_green, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        h, w = frame.shape[:2]
        min_area = (h * w) * 0.00005
        max_area = (h * w) * 0.05

        boxes = []
        for c in contours:
            area = cv2.contourArea(c)
            if not (min_area <= area <= max_area):
                continue
            x, y, bw, bh = cv2.boundingRect(c)
            aspect = bh / max(bw, 1)
            if 0.5 <= aspect <= 6.0:
                boxes.append([x, y, x + bw, y + bh])

        # 白線除去によって頭と胴体が分断されることがあるため、
        # x 方向に重なり縦方向に近接するボックスを結合する
        boxes = self._merge_vertical_fragments(boxes)

        players = [DetectedPlayer(bbox=tuple(b), confidence=0.3) for b in boxes]

        # 面積の大きい順に最大 30 件
        players.sort(key=lambda p: (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]), reverse=True)
        return players[:30]

    @staticmethod
    def _merge_vertical_fragments(boxes: List[List[int]]) -> List[List[int]]:
        """縦に分断された同一人物のボックスを結合する"""
        merged = True
        while merged:
            merged = False
            out = []
            used = [False] * len(boxes)
            for i in range(len(boxes)):
                if used[i]:
                    continue
                a = boxes[i]
                for j in range(i + 1, len(boxes)):
                    if used[j]:
                        continue
                    b = boxes[j]
                    x_overlap = min(a[2], b[2]) - max(a[0], b[0])
                    min_w = min(a[2] - a[0], b[2] - b[0])
                    v_gap = max(a[1], b[1]) - min(a[3], b[3])
                    max_h = max(a[3] - a[1], b[3] - b[1])
                    if x_overlap > 0.5 * min_w and v_gap < 0.6 * max_h:
                        a = [min(a[0], b[0]), min(a[1], b[1]),
                             max(a[2], b[2]), max(a[3], b[3])]
                        used[j] = True
                        merged = True
                used[i] = True
                out.append(a)
            boxes = out
        return boxes

    def _filter_on_field(self, players: List[DetectedPlayer], field_mask: np.ndarray) -> List[DetectedPlayer]:
        """足元がピッチ上にある検出のみ残す"""
        if field_mask.sum() == 0:
            return players
        h, w = field_mask.shape[:2]
        kept = []
        for p in players:
            x1, y1, x2, y2 = p.bbox
            foot = (min(max((x1 + x2) // 2, 0), w - 1), min(max(y2, 0), h - 1))
            if field_mask[foot[1], foot[0]] > 0:
                kept.append(p)
        return kept

    # ------------------------------------------------------------------
    # ボール検出
    # ------------------------------------------------------------------

    def _detect_ball(self, frame: np.ndarray, field_mask: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        white = cv2.inRange(hsv, (0, 0, 180), (180, 60, 255))
        if field_mask.sum() > 0:
            white = cv2.bitwise_and(white, field_mask)

        # センターサークル等のリング内側にボールがあると RETR_EXTERNAL では
        # 子輪郭として落ちるため RETR_LIST を使う（リング自体は面積で弾かれる）
        contours, _ = cv2.findContours(white, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        h, w = frame.shape[:2]
        best = None
        best_circularity = 0.0
        for c in contours:
            area = cv2.contourArea(c)
            if not (10 <= area <= (h * w) * 0.002):
                continue
            peri = cv2.arcLength(c, True)
            if peri == 0:
                continue
            circularity = 4 * np.pi * area / (peri * peri)
            if circularity > max(0.6, best_circularity):
                best_circularity = circularity
                x, y, bw, bh = cv2.boundingRect(c)
                best = (x, y, x + bw, y + bh)
        return best

    # ------------------------------------------------------------------
    # チーム分類
    # ------------------------------------------------------------------

    def _assign_teams(self, frame: np.ndarray, players: List[DetectedPlayer]) -> None:
        if len(players) < 2:
            return

        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        features = []
        for p in players:
            x1, y1, x2, y2 = p.bbox
            # ユニフォーム部分（バウンディングボックス上半分の中央）を切り出し
            jy1 = y1 + int((y2 - y1) * 0.15)
            jy2 = y1 + int((y2 - y1) * 0.55)
            jx1 = x1 + int((x2 - x1) * 0.2)
            jx2 = x2 - int((x2 - x1) * 0.2)
            crop = lab[max(0, jy1):max(1, jy2), max(0, jx1):max(1, jx2)]
            if crop.size == 0:
                crop = lab[max(0, y1):max(1, y2), max(0, x1):max(1, x2)]
            mean = crop.reshape(-1, 3).mean(axis=0)
            features.append(mean)

            crop_bgr = frame[max(0, jy1):max(1, jy2), max(0, jx1):max(1, jx2)]
            if crop_bgr.size:
                b, g, r = crop_bgr.reshape(-1, 3).mean(axis=0)
                p.jersey_color_bgr = (int(b), int(g), int(r))

        feats = np.array(features)
        # 色クラスタリングでは a/b（色味）を重視し、明度 L の影響を弱める
        feats_w = feats.copy()
        feats_w[:, 0] *= 0.4

        labels, centers = _kmeans(feats_w, 2)
        for p, lb in zip(players, labels):
            p.team = int(lb)

        # 両チームのどのクラスタ中心からも遠い選手を GK 候補としてマーク
        for team_id in (0, 1):
            members = [(i, p) for i, p in enumerate(players) if p.team == team_id]
            if len(members) < 3:
                continue
            dists = [np.linalg.norm(feats_w[i] - centers[team_id]) for i, _ in members]
            outlier_idx = int(np.argmax(dists))
            if dists[outlier_idx] > 3.5 * (np.median(dists) + 1e-6):
                members[outlier_idx][1].is_goalkeeper = True

    # ------------------------------------------------------------------
    # ピッチ座標変換
    # ------------------------------------------------------------------

    def _project_to_pitch(
        self,
        players: List[DetectedPlayer],
        ball: Optional[Tuple[int, int, int, int]],
        result: DetectionResult,
        homography: Optional[np.ndarray],
        field_mask: np.ndarray,
        shape,
    ) -> None:
        h, w = shape[:2]

        # フォールバック用: ピッチマスクの外接矩形で正規化
        if field_mask.sum() > 0:
            ys, xs = np.nonzero(field_mask)
            fx1, fx2 = xs.min(), xs.max()
            fy1, fy2 = ys.min(), ys.max()
        else:
            fx1, fy1, fx2, fy2 = 0, 0, w - 1, h - 1

        def project(px: float, py: float) -> Tuple[float, float]:
            if homography is not None:
                src = np.array([[[px, py]]], dtype=np.float32)
                dst = cv2.perspectiveTransform(src, homography)[0][0]
                return (
                    float(np.clip(dst[0] / PITCH_LENGTH, 0, 1)),
                    float(np.clip(dst[1] / PITCH_WIDTH, 0, 1)),
                )
            nx = (px - fx1) / max(fx2 - fx1, 1)
            ny = (py - fy1) / max(fy2 - fy1, 1)
            return float(np.clip(nx, 0, 1)), float(np.clip(ny, 0, 1))

        for p in players:
            x1, y1, x2, y2 = p.bbox
            p.pitch_xy = project((x1 + x2) / 2, y2)  # 足元の位置を使う

        if ball is not None:
            bx = (ball[0] + ball[2]) / 2
            by = (ball[1] + ball[3]) / 2
            result.ball_pitch_xy = project(bx, by)

    # ------------------------------------------------------------------
    # 注釈描画
    # ------------------------------------------------------------------

    def _annotate(self, frame: np.ndarray, result: DetectionResult) -> str:
        out = frame.copy()
        for i, p in enumerate(result.players):
            x1, y1, x2, y2 = p.bbox
            color = TEAM_A_COLOR if p.team == 0 else TEAM_B_COLOR if p.team == 1 else (200, 200, 200)
            cv2.rectangle(out, (x1, y1), (x2, y2), color, BOX_THICKNESS)
            label = f"{'GK ' if p.is_goalkeeper else ''}#{i + 1}"
            cv2.putText(out, label, (x1, max(12, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

        if result.ball_bbox is not None:
            x1, y1, x2, y2 = result.ball_bbox
            c = ((x1 + x2) // 2, (y1 + y2) // 2)
            r = max(4, (x2 - x1) // 2)
            cv2.circle(out, c, r + 3, BALL_COLOR, 2, cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buf.tobytes()).decode("utf-8") if ok else ""
