"""戦術分析エンジン

検出された選手のピッチ座標（0-1 正規化、実寸 105m x 68m）から、
- チームシェイプ指標（縦幅・横幅・コンパクトネス・ライン間距離）
- 守備ブロック評価（高さ・スライド・プレス強度）
- スペース分析（ピッチ支配率グリッド、危険/有効スペース）
- パスコース分析（保持者推定、パス候補の成功率・前進度・リスク）
- オフサイドライン分析（最終ライン推定、裏抜けスペース、高さ評価）
を数値化する。すべて決定的なヒューリスティックで、外部 API に依存しない。

座標系: x は 0（チーム A のゴール側）→ 1（チーム B のゴール側）。
チーム A は左→右、チーム B は右→左に攻めるものとして扱う。
"""

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

# スペース分析のグリッド解像度（約 5m セル）
GRID_W = 21
GRID_H = 14


@dataclass
class TeamShape:
    """1チーム分のシェイプ指標"""
    team: int
    width_m: float = 0.0            # 横幅（タッチライン方向）
    depth_m: float = 0.0            # 縦幅（ゴール方向）
    compactness: int = 0            # 0-100（高いほどコンパクト）
    line_x: dict = field(default_factory=dict)       # DF/MF/FW ラインの平均 x（自陣0→敵陣1）
    line_gaps_m: dict = field(default_factory=dict)  # ライン間距離 (m)
    line_gap_warnings: List[str] = field(default_factory=list)
    block_height: str = "-"         # ロー/ミドル/ハイ
    press_intensity: int = 0        # 0-100
    slide_offset_m: float = 0.0     # ブロック中心とボールの横ズレ (m)
    side_space_m: dict = field(default_factory=dict)  # 左右サイドの空き (m)
    central_density: int = 0        # 中央レーンの選手数
    attack_width_score: int = 0     # 0-100
    attack_depth_score: int = 0     # 0-100
    support_score: int = 0          # 0-100（保持者へのサポート角度・数）
    defensive_block_score: int = 0  # 0-100


def _to_meters(p: Tuple[float, float]) -> Tuple[float, float]:
    return p[0] * PITCH_LENGTH, p[1] * PITCH_WIDTH


def _dist_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    ax, ay = _to_meters(a)
    bx, by = _to_meters(b)
    return math.hypot(ax - bx, ay - by)


def _point_to_segment_dist_m(p, a, b) -> float:
    """点 p から線分 ab までの距離 (m)"""
    px, py = _to_meters(p)
    ax, ay = _to_meters(a)
    bx, by = _to_meters(b)
    dx, dy = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy
    if seg_len2 < 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


class TacticalAnalyzer:
    """チーム戦術の数値化"""

    # ------------------------------------------------------------------
    # メインエントリ
    # ------------------------------------------------------------------

    def analyze(
        self,
        team_positions: List[List[Tuple[float, float]]],   # [チームA座標列, チームB座標列]
        team_gk_indices: List[Optional[int]],               # 各チームの GK の要素番号
        ball: Optional[Tuple[float, float]],
        attack_ltr: Optional[List[bool]] = None,            # 各チームが左→右に攻めるか
    ) -> dict:
        """全戦術指標を計算して dict で返す"""
        if attack_ltr is None:
            attack_ltr = self.infer_attack_directions(team_positions)

        shapes = []
        for team_id in (0, 1):
            shape = self._team_shape(
                team_id,
                team_positions[team_id],
                team_gk_indices[team_id],
                opponents=team_positions[1 - team_id],
                ball=ball,
                attack_ltr=attack_ltr[team_id],
            )
            shapes.append(shape)

        space = self._space_analysis(team_positions, ball, attack_ltr)
        passing = self._pass_analysis(team_positions, team_gk_indices, ball, attack_ltr)
        offside = self._offside_analysis(team_positions, team_gk_indices, ball, attack_ltr)

        return {
            "attack_ltr": attack_ltr,
            "teams": [self._shape_to_dict(s) for s in shapes],
            "space": space,
            "passing": passing,
            "offside": offside,
        }

    @staticmethod
    def infer_attack_directions(
        team_positions: List[List[Tuple[float, float]]],
    ) -> List[bool]:
        """各チームの攻撃方向を座標分布から推定

        最後方（GK 側）の選手がどちらのゴールに近いかで守る側を決める。
        判定が両チームで衝突した場合は重心の左右で振り分ける。
        片方のチームの座標が空の場合は、非空チームの方向をその座標から推定し、
        空チームは必ずその逆方向にする（両チーム同方向のまま返さない）。
        """
        result: List[Optional[bool]] = [None, None]
        for t in (0, 1):
            xs = [p[0] for p in team_positions[t]]
            if not xs:
                continue
            # x=0 側の端により深い選手がいる → x=0 のゴールを守る → 左→右に攻める
            result[t] = min(xs) < 1.0 - max(xs)

        if result[0] is None and result[1] is None:
            return [True, False]
        if result[0] is None:
            result[0] = not result[1]
        elif result[1] is None:
            result[1] = not result[0]
        elif result[0] == result[1]:
            m0 = float(np.mean([p[0] for p in team_positions[0]]))
            m1 = float(np.mean([p[0] for p in team_positions[1]]))
            result = [m0 <= m1, m1 < m0]
        return result

    # ------------------------------------------------------------------
    # チームシェイプ
    # ------------------------------------------------------------------

    def _team_shape(
        self,
        team_id: int,
        positions: List[Tuple[float, float]],
        gk_index: Optional[int],
        opponents: List[Tuple[float, float]],
        ball: Optional[Tuple[float, float]],
        attack_ltr: bool = True,
    ) -> TeamShape:
        shape = TeamShape(team=team_id)
        if len(positions) < 4:
            return shape

        # GK を除いたフィールドプレーヤー
        outfield = [p for i, p in enumerate(positions) if i != gk_index]
        if gk_index is None:
            # 最後方の選手を GK とみなして除外
            rear = min(range(len(positions)), key=lambda i: positions[i][0]) if attack_ltr \
                else max(range(len(positions)), key=lambda i: positions[i][0])
            outfield = [p for i, p in enumerate(positions) if i != rear]

        xs = np.array([p[0] for p in outfield])
        ys = np.array([p[1] for p in outfield])

        shape.depth_m = round(float(xs.max() - xs.min()) * PITCH_LENGTH, 1)
        shape.width_m = round(float(ys.max() - ys.min()) * PITCH_WIDTH, 1)

        # コンパクトネス: 平均ペア距離が 15m 前後で満点、広がるほど減点
        pts_m = [_to_meters(p) for p in outfield]
        pair_dists = [
            math.hypot(a[0] - b[0], a[1] - b[1])
            for i, a in enumerate(pts_m) for b in pts_m[i + 1:]
        ]
        mean_pair = float(np.mean(pair_dists)) if pair_dists else 0.0
        shape.compactness = int(np.clip(100 - max(0.0, mean_pair - 15.0) * 3.0, 0, 100))

        # ライン分割（自陣→敵陣に正規化した x でギャップ分割）
        norm_x = xs if attack_ltr else (1.0 - xs)
        order = np.argsort(norm_x)
        sorted_x = norm_x[order]
        lines = self._split_lines(sorted_x)

        line_names = ["DF", "MF", "FW"][:len(lines)]
        prev_center = None
        for name, seg in zip(line_names, lines):
            center = float(np.mean(seg))
            shape.line_x[name] = round(center, 3)
            if prev_center is not None:
                gap = (center - prev_center) * PITCH_LENGTH
                key = f"{line_names[line_names.index(name) - 1]}-{name}"
                shape.line_gaps_m[key] = round(gap, 1)
                if gap > 22:
                    shape.line_gap_warnings.append(
                        f"{key} 間が {gap:.0f}m 空いており、ライン間を使われる危険があります"
                    )
            prev_center = center

        # 守備ブロックの高さ: DF ラインの位置で判定
        df_x = shape.line_x.get("DF", float(sorted_x[0]))
        if df_x < 0.3:
            shape.block_height = "ローブロック"
        elif df_x < 0.45:
            shape.block_height = "ミドルブロック"
        else:
            shape.block_height = "ハイライン"

        # プレス強度: ボール周囲 12m 以内の自チーム選手数
        if ball is not None:
            near = sum(1 for p in outfield if _dist_m(p, ball) <= 12.0)
            shape.press_intensity = int(np.clip(near * 30, 0, 100))

            # スライド: ブロック重心とボールの横方向のズレ
            center_y = float(ys.mean())
            shape.slide_offset_m = round(abs(center_y - ball[1]) * PITCH_WIDTH, 1)

        # サイドの空き: 左右タッチライン側 15m レーンの最寄り選手までの距離
        left_lane = [p for p in outfield if p[1] < 15 / PITCH_WIDTH]
        right_lane = [p for p in outfield if p[1] > 1 - 15 / PITCH_WIDTH]
        shape.side_space_m = {
            "left": round(15.0 if not left_lane else min(p[1] for p in left_lane) * PITCH_WIDTH, 1),
            "right": round(15.0 if not right_lane else (1 - max(p[1] for p in right_lane)) * PITCH_WIDTH, 1),
        }

        # 中央密集: 中央 20m レーンの選手数
        centre = sum(1 for p in outfield if abs(p[1] - 0.5) < 10 / PITCH_WIDTH)
        shape.central_density = centre

        # 攻撃の幅: 60m 以上で満点
        shape.attack_width_score = int(np.clip(shape.width_m / 60.0 * 100, 0, 100))
        # 攻撃の深さ: 最前線が敵陣に入っているほど高評価
        front_x = float(sorted_x[-1])
        shape.attack_depth_score = int(np.clip((front_x - 0.5) * 250 + 50, 0, 100))

        # サポートスコア: 保持者周辺のパスコース角度の多様性（保持チームのみ意味を持つ）
        if ball is not None:
            shape.support_score = self._support_score(outfield, ball)

        # 守備ブロックスコア: コンパクトネスとライン間バランスの複合
        gap_penalty = sum(max(0.0, g - 20.0) for g in shape.line_gaps_m.values()) * 2.5
        shape.defensive_block_score = int(np.clip(shape.compactness - gap_penalty, 0, 100))

        return shape

    @staticmethod
    def _split_lines(sorted_x: np.ndarray) -> List[np.ndarray]:
        """昇順の x 座標列を最大3ラインにギャップ分割"""
        n = len(sorted_x)
        if n < 3:
            return [sorted_x]
        gaps = np.diff(sorted_x)
        n_cuts = min(2, n - 1)
        cut_idx = sorted(np.argsort(gaps)[-n_cuts:] + 1)
        segments = []
        prev = 0
        for c in cut_idx:
            segments.append(sorted_x[prev:c])
            prev = c
        segments.append(sorted_x[prev:])
        return [s for s in segments if len(s) > 0]

    @staticmethod
    def _support_score(teammates: List[Tuple[float, float]], ball: Tuple[float, float]) -> int:
        """保持者へのサポート: 25m 以内の味方の数と角度分散"""
        bx, by = _to_meters(ball)
        angles = []
        for p in teammates:
            px, py = _to_meters(p)
            d = math.hypot(px - bx, py - by)
            if 3.0 < d <= 25.0:
                angles.append(math.atan2(py - by, px - bx))
        if not angles:
            return 0
        count_score = min(len(angles), 5) / 5 * 60
        # 角度の広がり（円周統計）: atan2 の角度は ±π をまたぐと通常の std が
        # 破綻する（例: +3.0 rad と -3.0 rad は実際は約20°しか離れていないのに
        # std は約3 になる）ため、平均合成ベクトル長 R を使う。
        # R = |mean(exp(iθ))| は 1（全員が同じ方向）〜 0（全方位に分散）を取るので、
        # spread = 1 - R として「広がり」の指標にする。
        if len(angles) > 1:
            angles_arr = np.array(angles)
            mean_vector = np.mean(np.exp(1j * angles_arr))
            r = np.abs(mean_vector)
            spread = 1.0 - float(r)
        else:
            spread = 0.2
        spread_score = float(np.clip(spread * 40, 0, 40))
        return int(np.clip(count_score + spread_score, 0, 100))

    @staticmethod
    def _shape_to_dict(s: TeamShape) -> dict:
        return {
            "team": s.team,
            "width_m": s.width_m,
            "depth_m": s.depth_m,
            "compactness": s.compactness,
            "line_x": s.line_x,
            "line_gaps_m": s.line_gaps_m,
            "line_gap_warnings": s.line_gap_warnings,
            "block_height": s.block_height,
            "press_intensity": s.press_intensity,
            "slide_offset_m": s.slide_offset_m,
            "side_space_m": s.side_space_m,
            "central_density": s.central_density,
            "attack_width_score": s.attack_width_score,
            "attack_depth_score": s.attack_depth_score,
            "support_score": s.support_score,
            "defensive_block_score": s.defensive_block_score,
        }

    # ------------------------------------------------------------------
    # スペース分析（ピッチ支配率グリッド）
    # ------------------------------------------------------------------

    def _space_analysis(
        self,
        team_positions: List[List[Tuple[float, float]]],
        ball: Optional[Tuple[float, float]],
        attack_ltr: List[bool],
    ) -> dict:
        """距離ベースの簡易ピッチ支配率と、注目スペースの抽出

        control[gy][gx] は -1（チームBが支配）〜 +1（チームAが支配）。
        """
        control = np.zeros((GRID_H, GRID_W), dtype=np.float64)

        team_a = [_to_meters(p) for p in team_positions[0]]
        team_b = [_to_meters(p) for p in team_positions[1]]

        for gy in range(GRID_H):
            for gx in range(GRID_W):
                cx = (gx + 0.5) / GRID_W * PITCH_LENGTH
                cy = (gy + 0.5) / GRID_H * PITCH_WIDTH
                da = min((math.hypot(cx - x, cy - y) for x, y in team_a), default=200.0)
                db = min((math.hypot(cx - x, cy - y) for x, y in team_b), default=200.0)
                # 到達時間の代理として距離差を使用
                control[gy][gx] = (db - da) / (da + db + 1e-6)

        zones = self._notable_zones(control, team_positions, ball, attack_ltr)

        return {
            "grid_w": GRID_W,
            "grid_h": GRID_H,
            "control": [[round(float(v), 2) for v in row] for row in control],
            "zones": zones,
        }

    def _notable_zones(
        self,
        control: np.ndarray,
        team_positions: List[List[Tuple[float, float]]],
        ball: Optional[Tuple[float, float]],
        attack_ltr: List[bool],
    ) -> List[dict]:
        """危険スペース・有効スペースの抽出（チーム A 視点）"""
        zones = []
        a_ltr = attack_ltr[0]

        def add_zone(gx, gy, ztype, label):
            zones.append({
                "x": round((gx + 0.5) / GRID_W, 3),
                "y": round((gy + 0.5) / GRID_H, 3),
                "type": ztype,
                "label": label,
            })

        # チーム A の最終ラインより後ろで相手が支配しているセル = 危険
        if team_positions[0]:
            xs_a = sorted((p[0] for p in team_positions[0]), reverse=not a_ltr)
            df_line_a = xs_a[1] if len(xs_a) > 1 else xs_a[0]
            danger_cells = []
            for gy in range(GRID_H):
                for gx in range(GRID_W):
                    cx = (gx + 0.5) / GRID_W
                    behind = cx < df_line_a if a_ltr else cx > df_line_a
                    if behind and control[gy][gx] < -0.25:
                        danger_cells.append((control[gy][gx], gx, gy))
            for v, gx, gy in sorted(danger_cells)[:3]:
                add_zone(gx, gy, "danger", "最終ライン背後を相手に支配されています")

        # 敵陣で誰も支配していない（|control| 小）かつ前方のセル = 侵入すべきスペース
        opportunity_cells = []
        for gy in range(GRID_H):
            for gx in range(GRID_W):
                cx = (gx + 0.5) / GRID_W
                in_final_third = cx > 0.55 if a_ltr else cx < 0.45
                if in_final_third and -0.15 < control[gy][gx] < 0.35:
                    # ボールから遠すぎる場所は候補から除外
                    if ball is not None:
                        cell = (cx, (gy + 0.5) / GRID_H)
                        if _dist_m(cell, ball) > 45:
                            continue
                    opportunity_cells.append((abs(control[gy][gx]), gx, gy))
        for _, gx, gy in sorted(opportunity_cells)[:3]:
            add_zone(gx, gy, "opportunity", "味方が侵入すべきフリースペース")

        return zones

    # ------------------------------------------------------------------
    # パスコース分析
    # ------------------------------------------------------------------

    def _pass_analysis(
        self,
        team_positions: List[List[Tuple[float, float]]],
        team_gk_indices: List[Optional[int]],
        ball: Optional[Tuple[float, float]],
        attack_ltr_list: List[bool],
    ) -> Optional[dict]:
        if ball is None:
            return None

        # ボール保持者 = ボールに最も近い選手
        best = None
        for team_id in (0, 1):
            for i, p in enumerate(team_positions[team_id]):
                d = _dist_m(p, ball)
                if best is None or d < best[0]:
                    best = (d, team_id, i, p)
        if best is None or best[0] > 15.0:
            return None

        _, team_id, holder_idx, holder = best
        attack_ltr = attack_ltr_list[team_id]
        teammates = team_positions[team_id]
        opponents = team_positions[1 - team_id]

        options = []
        for i, target in enumerate(teammates):
            if i == holder_idx:
                continue
            dist = _dist_m(holder, target)
            if dist < 2.0 or dist > 60.0:
                continue

            # パスレーン上の相手（線分から 2.5m 以内）
            interceptors = sum(
                1 for opp in opponents
                if _point_to_segment_dist_m(opp, holder, target) < 2.5
            )
            # 受け手へのプレッシャー（最寄りの相手までの距離）
            pressure_d = min((_dist_m(opp, target) for opp in opponents), default=50.0)

            # 前進度: 攻撃方向への距離 (m)。正なら前進
            progress_m = (target[0] - holder[0]) * PITCH_LENGTH * (1 if attack_ltr else -1)

            # 成功可能性のヒューリスティック
            p_success = 0.95
            p_success -= max(0.0, dist - 15.0) * 0.008     # 距離ペナルティ
            p_success -= interceptors * 0.28               # レーン封鎖
            p_success -= max(0.0, 6.0 - pressure_d) * 0.04 # 受け手が寄せられている
            p_success = float(np.clip(p_success, 0.05, 0.98))

            risk = round(1.0 - p_success, 2)
            if p_success >= 0.75 and progress_m < 8:
                cls, label = "safe", "安全なパス"
            elif p_success >= 0.5 and progress_m >= 8:
                cls, label = "progressive", "前進できるパス"
            elif p_success >= 0.75 and progress_m >= 8:
                cls, label = "progressive", "前進できるパス"
            elif p_success >= 0.5:
                cls, label = "safe", "安全なパス"
            else:
                cls, label = "risky", "危険なパス"

            options.append({
                "index": i,
                "x": round(target[0], 3),
                "y": round(target[1], 3),
                "distance_m": round(dist, 1),
                "success": round(p_success, 2),
                "progress_m": round(progress_m, 1),
                "risk": risk,
                "interceptors": interceptors,
                "class": cls,
                "label": label,
            })

        if not options:
            return None

        # 最適パス: 成功率と前進度の複合スコア
        def option_value(o):
            progress_norm = np.clip(o["progress_m"] / 40.0, -0.5, 1.0)
            return o["success"] * 0.55 + progress_norm * 0.45

        options.sort(key=option_value, reverse=True)
        best_option = options[0]

        if best_option["class"] == "progressive":
            recommendation = (
                f"最適な次のプレー: {best_option['distance_m']:.0f}m 前方の味方"
                f"（#{best_option['index'] + 1}）への前進パス。"
                f"成功可能性 {best_option['success'] * 100:.0f}% で {best_option['progress_m']:.0f}m 前進できます。"
            )
        elif best_option["class"] == "safe":
            recommendation = (
                f"前方のコースが封鎖されています。まずは #{best_option['index'] + 1} への"
                f"安全なパス（成功可能性 {best_option['success'] * 100:.0f}%）でボールを動かし、"
                "相手ブロックをスライドさせましょう。"
            )
        else:
            recommendation = "有効なパスコースがありません。ドリブルで運ぶか、キープして味方のサポートを待ちましょう。"

        return {
            "holder": {
                "team": team_id,
                "index": holder_idx,
                "x": round(holder[0], 3),
                "y": round(holder[1], 3),
            },
            "options": options,
            "recommendation": recommendation,
        }

    # ------------------------------------------------------------------
    # オフサイドライン分析
    # ------------------------------------------------------------------

    def _offside_analysis(
        self,
        team_positions: List[List[Tuple[float, float]]],
        team_gk_indices: List[Optional[int]],
        ball: Optional[Tuple[float, float]],
        attack_ltr_list: List[bool],
    ) -> dict:
        """各チームの最終ライン（オフサイドライン）と裏のスペースを評価"""
        result = {"teams": []}

        for team_id in (0, 1):
            positions = team_positions[team_id]
            if len(positions) < 3:
                result["teams"].append({"team": team_id, "line_x": None})
                continue

            # 左→右に攻めるチームは x=0 側のゴールを守る
            defend_ltr = attack_ltr_list[team_id]
            xs = sorted((p[0] for p in positions), reverse=not defend_ltr)
            # xs[0] は通常 GK。オフサイドラインは後方から2人目
            line_x = xs[1] if len(xs) > 1 else xs[0]
            gk_x = xs[0]

            # 裏のスペース: 最終ラインと GK の間の奥行き
            behind_m = abs(line_x - gk_x) * PITCH_LENGTH

            # ライン高さの評価
            depth_from_goal = line_x if defend_ltr else (1 - line_x)
            assessment = ""
            level = "ok"
            if ball is not None:
                ball_dist_m = abs(ball[0] - line_x) * PITCH_LENGTH
                if depth_from_goal > 0.45 and behind_m > 25:
                    level = "warning"
                    assessment = (
                        f"ラインが高すぎます（ゴールから {depth_from_goal * PITCH_LENGTH:.0f}m）。"
                        f"背後に {behind_m:.0f}m のスペースがあり、裏抜け一本で決定機を作られます。"
                        "GK のカバー範囲を確認し、ボールにプレッシャーがない時はラインを下げましょう。"
                    )
                elif depth_from_goal < 0.18 and ball_dist_m > 30:
                    level = "warning"
                    assessment = (
                        f"ボールから {ball_dist_m:.0f}m も離れているのにラインが低すぎます。"
                        "ブロック全体を押し上げて中盤との距離を詰め、"
                        "セカンドボールを回収できる位置を取りましょう。"
                    )
                else:
                    assessment = "ラインの高さは状況に対して適切です。"
            else:
                assessment = "ボール位置が特定できないため、ライン高さの評価は参考値です。"

            # 裏抜けの狙い目: 相手（このラインを攻める側）視点の情報として返す
            runnable = behind_m > 15 and depth_from_goal > 0.3

            result["teams"].append({
                "team": team_id,
                "line_x": round(line_x, 3),
                "gk_x": round(gk_x, 3),
                "behind_space_m": round(behind_m, 1),
                "height_level": level,
                "assessment": assessment,
                "runnable_behind": runnable,
            })

        return result

    # ------------------------------------------------------------------
    # 攻守局面の判定（動画の複数フレーム用）
    # ------------------------------------------------------------------

    @staticmethod
    def possession_team(
        team_positions: List[List[Tuple[float, float]]],
        ball: Optional[Tuple[float, float]],
    ) -> Optional[int]:
        """ボールに最も近い選手のチームを保持チームとみなす"""
        if ball is None:
            return None
        best = None
        for team_id in (0, 1):
            for p in team_positions[team_id]:
                d = _dist_m(p, ball)
                if best is None or d < best[0]:
                    best = (d, team_id)
        if best is None or best[0] > 15.0:
            return None
        return best[1]
