"""フォーメーション判定エンジン

検出された選手のピッチ座標（0-1 正規化）から、チームごとの
フォーメーション（4-4-2, 4-3-3, 3-5-2 など）を判定し、
2D 戦術ボードに配置するための座標とロール（GK/DF/MF/FW）を返す。

アルゴリズム:
1. 各チームの攻撃方向を推定し、座標を「自陣ゴール = x0」に正規化
2. GK（最後方の選手）を分離
3. フィールドプレーヤーの x 座標を 1 次元ギャップクラスタリングでライン分割
4. ライン人数列（例: [4, 4, 2]）を既知フォーメーションのテンプレートと照合
5. テンプレートスロットへ最近傍割り当てし、整形済みの配置座標を生成
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

# 既知フォーメーションのテンプレート
# ライン人数（DF から FW の順）と、代表的な呼称
FORMATION_TEMPLATES = {
    "4-4-2": [4, 4, 2],
    "4-3-3": [4, 3, 3],
    "4-2-3-1": [4, 2, 3, 1],
    "4-1-4-1": [4, 1, 4, 1],
    "4-5-1": [4, 5, 1],
    "3-5-2": [3, 5, 2],
    "3-4-3": [3, 4, 3],
    "5-3-2": [5, 3, 2],
    "5-4-1": [5, 4, 1],
    "4-4-1-1": [4, 4, 1, 1],
    "3-6-1": [3, 6, 1],
    "4-3-2-1": [4, 3, 2, 1],
}

ROLE_BY_LINE = {0: "DF", 1: "MF", 2: "FW", 3: "FW"}

# ロール別の標準背番号（優先順）。同ロールが複数いる場合はリスト先頭から順に割当。
# 割当先が尽きた/該当ロールがない選手は 12 以降を昇順で補完する。
ROLE_JERSEY_PREFS = {
    "GK": [1],
    "RB": [2],
    "LB": [3],
    "CB": [4, 5],
    "CM": [6, 8, 10],   # 中盤中央（3枚なら 6/8/10 = アンカー/インサイド/トップ下相当）
    "AM": [10],
    "RM": [7],
    "LM": [11],
    "RW": [7],
    "LW": [11],
    "CF": [9],
    # 左右不明の総称ロール（フォールバック）
    "SB": [2, 3],
    "SH": [7, 11],
    "WG": [7, 11],
    "DF": [4, 5],
    "MF": [6, 8],
    "FW": [9],
}


@dataclass
class FormationPlayer:
    index: int                      # 検出時のインデックス
    x: float                        # 0-1 (自陣ゴール→敵陣ゴール、攻撃方向で正規化済み)
    y: float                        # 0-1 (タッチライン間、攻撃方向で正規化済み)
    role: str = "MF"
    line: int = -1
    is_goalkeeper: bool = False
    raw_x: float = 0.0              # 0-1 検出時の生ピッチ座標（フリップ前）
    raw_y: float = 0.0              # ボール・パス候補・オフサイドラインと同じ座標系
    snapped_x: float = 0.0          # テンプレート整形後の配置座標
    snapped_y: float = 0.0
    jersey_number: int = 0          # ロールに応じて割り当てた標準背番号（チーム内で一意）


@dataclass
class TeamFormation:
    team: int
    formation: str = "不明"
    confidence: float = 0.0
    players: List[FormationPlayer] = field(default_factory=list)
    line_counts: List[int] = field(default_factory=list)


class FormationAnalyzer:
    """選手座標からのフォーメーション判定"""

    def analyze_team(
        self,
        positions: List[Tuple[float, float]],
        indices: List[int],
        gk_hint: Optional[int] = None,
        attack_left_to_right: Optional[bool] = None,
    ) -> TeamFormation:
        """1チーム分の座標からフォーメーションを判定

        Args:
            positions: 0-1 正規化ピッチ座標 (x, y) のリスト
            indices: 各座標に対応する検出インデックス
            gk_hint: GK と推定される検出インデックス（色の外れ値など）
            attack_left_to_right: 攻撃方向。None なら座標分布から推定
        """
        tf = TeamFormation(team=-1)
        if len(positions) < 3:
            tf.formation = "判定不可（選手数不足）"
            for (x, y), idx in zip(positions, indices):
                tf.players.append(
                    FormationPlayer(index=idx, x=x, y=y, raw_x=x, raw_y=y, snapped_x=x, snapped_y=y)
                )
            return tf

        pts = np.array(positions, dtype=np.float64)
        raw_pts = pts.copy()  # 生の検出座標（フリップ前）。ルーターの detected_x/y に使う

        # 攻撃方向の推定: 選手の重心が左寄りなら左→右に攻めるとみなす
        if attack_left_to_right is None:
            attack_left_to_right = pts[:, 0].mean() <= 0.5
        if not attack_left_to_right:
            # フリップは内部のライン分割・整形配置（snapped_x/y）計算専用。
            # raw_x/raw_y は生座標のまま保持し、検出位置ビューの破壊的反転を防ぐ。
            pts[:, 0] = 1.0 - pts[:, 0]
            pts[:, 1] = 1.0 - pts[:, 1]

        players = [
            FormationPlayer(
                index=idx,
                x=float(p[0]),
                y=float(p[1]),
                raw_x=float(rp[0]),
                raw_y=float(rp[1]),
            )
            for p, rp, idx in zip(pts, raw_pts, indices)
        ]

        # GK: 色ヒントがあれば優先、なければ最後方（x 最小）の選手。
        # ただし色ヒントの選手が最後方付近にいない場合は誤検出とみなして無視する
        min_x = min(pl.x for pl in players)
        gk = None
        if gk_hint is not None:
            gk = next((pl for pl in players if pl.index == gk_hint), None)
            if gk is not None and gk.x > min_x + 0.15:
                gk = None
        if gk is None:
            gk = min(players, key=lambda pl: pl.x)
        gk.is_goalkeeper = True
        gk.role = "GK"
        gk.snapped_x, gk.snapped_y = 0.04, 0.5

        outfield = [pl for pl in players if not pl.is_goalkeeper]
        if len(outfield) < 2:
            tf.players = players
            tf.formation = "判定不可（選手数不足）"
            return tf

        line_groups = self._cluster_lines(outfield)
        tf.line_counts = [len(g) for g in line_groups]

        formation, confidence = self._match_template(tf.line_counts, len(outfield))
        tf.formation = formation
        tf.confidence = confidence

        self._assign_roles_and_snap(line_groups, formation)
        self._assign_jersey_numbers(players)

        tf.players = players
        return tf

    # ------------------------------------------------------------------
    # ライン分割
    # ------------------------------------------------------------------

    def _cluster_lines(self, outfield: List[FormationPlayer]) -> List[List[FormationPlayer]]:
        """x 座標のギャップで DF/MF/FW のラインに分割"""
        ordered = sorted(outfield, key=lambda p: p.x)
        n = len(ordered)

        # ライン数の候補は 3 または 4（10人前後を想定）
        best_groups = None
        best_score = -np.inf

        for n_lines in (3, 4):
            if n < n_lines:
                continue
            groups = self._split_by_gaps(ordered, n_lines)
            if groups is None:
                continue
            # 評価: ライン内の x 分散が小さく、ライン間の間隔が大きいほど良い
            within = 0.0
            for g in groups:
                xs = np.array([p.x for p in g])
                within += xs.var()
            centers = [np.mean([p.x for p in g]) for g in groups]
            between = np.diff(centers).min() if len(centers) > 1 else 0.0
            counts = [len(g) for g in groups]
            # 既知テンプレートに一致すればボーナス
            template_bonus = 0.15 if counts in FORMATION_TEMPLATES.values() else 0.0
            score = between - within * 3.0 + template_bonus
            if score > best_score:
                best_score = score
                best_groups = groups

        if best_groups is None:
            best_groups = [ordered]
        return best_groups

    def _split_by_gaps(self, ordered: List[FormationPlayer], n_lines: int) -> Optional[List[List[FormationPlayer]]]:
        """x 座標の大きいギャップ上位 (n_lines - 1) 箇所で分割"""
        n = len(ordered)
        if n < n_lines:
            return None
        xs = np.array([p.x for p in ordered])
        gaps = np.diff(xs)
        if len(gaps) < n_lines - 1:
            return None
        cut_positions = sorted(np.argsort(gaps)[-(n_lines - 1):] + 1)

        groups = []
        prev = 0
        for cut in cut_positions:
            groups.append(ordered[prev:cut])
            prev = cut
        groups.append(ordered[prev:])
        if any(len(g) == 0 for g in groups):
            return None
        return groups

    # ------------------------------------------------------------------
    # テンプレート照合
    # ------------------------------------------------------------------

    def _match_template(self, line_counts: List[int], n_outfield: int) -> Tuple[str, float]:
        if not line_counts:
            return "不明", 0.0

        best_name = None
        best_cost = np.inf
        for name, template in FORMATION_TEMPLATES.items():
            if sum(template) != n_outfield:
                # 検出漏れがある場合も考慮し、人数差 1 まで比較対象にする
                if abs(sum(template) - n_outfield) > 1:
                    continue
            cost = self._line_counts_distance(line_counts, template)
            cost += abs(sum(template) - n_outfield) * 0.5
            if cost < best_cost:
                best_cost = cost
                best_name = name

        if best_name is None:
            return "-".join(str(c) for c in line_counts), 0.3

        confidence = float(np.clip(1.0 - best_cost / 4.0, 0.0, 1.0))
        if best_cost == 0:
            confidence = max(confidence, 0.9)
        return best_name, round(confidence, 2)

    @staticmethod
    def _line_counts_distance(a: List[int], b: List[int]) -> float:
        """ライン人数列同士の距離（長さが違う場合は短い方を 0 埋め）"""
        la, lb = list(a), list(b)
        length = max(len(la), len(lb))
        la += [0] * (length - len(la))
        lb += [0] * (length - len(lb))
        return float(sum(abs(x - y) for x, y in zip(la, lb))) + abs(len(a) - len(b)) * 0.5

    # ------------------------------------------------------------------
    # ロール割り当てと整形配置
    # ------------------------------------------------------------------

    def _assign_roles_and_snap(self, line_groups: List[List[FormationPlayer]], formation: str) -> None:
        """ラインごとにロールを付与し、戦術ボード用の整形座標を生成

        整形座標は「ラインの x はライン平均、y はライン内で等間隔」。
        検出座標そのままだと重なりや偏りが出るため、
        画面上のコートに選手をきれいに配置するために使う。
        """
        n_lines = len(line_groups)
        # ラインの深さ: DF 0.2 → FW 0.85 に等間隔で配置
        depths = np.linspace(0.2, 0.85, n_lines) if n_lines > 1 else [0.5]

        for li, group in enumerate(line_groups):
            role = ROLE_BY_LINE.get(min(li, 3) if n_lines >= 3 else li + (3 - n_lines), "MF")
            if n_lines == 4:
                role = ["DF", "MF", "MF", "FW"][li]
            elif n_lines == 3:
                role = ["DF", "MF", "FW"][li]
            elif n_lines == 2:
                role = ["DF", "FW"][li]
            else:
                role = "MF"

            group_sorted = sorted(group, key=lambda p: p.y)
            k = len(group_sorted)
            ys = np.linspace(0.5, 0.5, 1) if k == 1 else np.linspace(0.12, 0.88, k)
            for pos_in_line, (pl, y) in enumerate(zip(group_sorted, ys)):
                pl.role = self._detailed_role(role, pos_in_line, k)
                pl.line = li
                pl.snapped_x = float(depths[li])
                pl.snapped_y = float(y)

    @staticmethod
    def _detailed_role(base_role: str, pos_in_line: int, line_size: int) -> str:
        """ライン内の位置（タッチライン側か中央か）から詳細ロールを左右つきで推定

        pos_in_line はライン内を snapped_y 昇順（＝攻撃方向で正規化した座標系）で
        並べた順位。攻撃方向を左→右に正規化してあるため、
        小さい y（pos_in_line == 0）が「左サイド」、大きい y が「右サイド」に対応する。
        """
        if base_role not in ("DF", "MF", "FW") or line_size <= 1:
            return {"DF": "CB", "MF": "CM", "FW": "CF"}.get(base_role, base_role)

        is_left = pos_in_line == 0
        is_right = pos_in_line == line_size - 1
        is_wide = is_left or is_right
        if base_role == "DF":
            if is_wide and line_size >= 4:
                return "LB" if is_left else "RB"
            return "CB"
        if base_role == "MF":
            if is_wide and line_size >= 4:
                return "LM" if is_left else "RM"
            return "CM"
        # FW
        if is_wide and line_size >= 3:
            return "LW" if is_left else "RW"
        return "CF"

    def _assign_jersey_numbers(self, players: List[FormationPlayer]) -> None:
        """ロールに応じた標準背番号をチーム内で一意に割り当てる

        1) GK→後方DF→中盤→前線の順（snapped_x 昇順、同深さは snapped_y 昇順）で走査し、
           各ロールの優先番号のうち未使用の先頭を割り当てる
        2) 優先番号が尽きた/該当ロールがない選手は 12 以降の空き番号を昇順で補完
        """
        used: set = set()
        # GK（line == -1）を先頭に、以降は後方から前方・左から右の順で決定論的に処理
        ordered = sorted(
            players,
            key=lambda p: (0 if p.is_goalkeeper else 1, p.snapped_x, p.snapped_y),
        )
        deferred: List[FormationPlayer] = []
        for pl in ordered:
            prefs = ROLE_JERSEY_PREFS.get(pl.role, [])
            chosen = next((n for n in prefs if n not in used), None)
            if chosen is None:
                deferred.append(pl)
                continue
            pl.jersey_number = chosen
            used.add(chosen)

        # フォールバック: 12 以降の空き番号を昇順で補完
        for pl in deferred:
            n = 12
            while n in used:
                n += 1
            pl.jersey_number = n
            used.add(n)
