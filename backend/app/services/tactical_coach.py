"""AI 戦術コーチ

TacticalAnalyzer の数値結果から、日本語のコーチングコメントを生成する。
- 良い点 / 課題 / 改善案
- 初心者・中級者・上級者向けの説明レベル切り替え
- チーム戦術と個人戦術（保持者・最終ラインなど）の両方に対応
- 次の練習メニューの提案

決定的なテンプレートベースで動作するため API キー不要。
OPENAI_API_KEY が設定されている場合は、生成済みコメントを
LLM で自然な文章に磨き上げる（失敗時はテンプレート出力のまま）。
"""

import os
from typing import List, Optional

try:
    from openai import OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    OpenAI = None
    _OPENAI_AVAILABLE = False

# 課題カテゴリー → 練習メニュー
DRILL_BY_ISSUE = {
    "compactness": "シャドープレー: 11人でボールなしのポジション移動練習。コーチの合図でブロック全体を 10 秒以内にスライド（20分）",
    "line_gap": "ライン間圧縮ドリル: DF-MF 2ライン + フリーマンで、ライン間パスを通されたら守備側の負け（15分）",
    "width": "ワイドポゼッション: ピッチ幅いっぱいの 8対8。両サイドレーンにタッチ制限ゾーンを設定（20分）",
    "support": "3人目の動きドリル: 3対1ロンドから前進。パス&ムーブでサポート角度を作り直す（15分)",
    "press": "即時奪回ゲーム: 5対5 + GK。ボールロスト後 6 秒間のカウンタープレスを義務化（15分）",
    "offside_line": "ラインコントロール練習: DF4枚 + GK でクロスバー間を想定したライン上下動。コーチのボール位置に連動（15分）",
    "pass_selection": "パス優先順位ロンド: 6対3。前進パス2点・横パス1点のスコア制で判断を鍛える（15分）",
    "balance": "バランスゲーム: 通常の 8対8 に「危険スペース発生で相手に FK」の特別ルールを追加（20分）",
}


class TacticalCoach:
    """戦術指標 → 日本語コーチング"""

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        self._client = OpenAI(api_key=api_key) if (_OPENAI_AVAILABLE and api_key) else None
        self._model = os.getenv("OPENAI_MODEL", "gpt-4o")

    # ------------------------------------------------------------------
    # メイン API
    # ------------------------------------------------------------------

    def coach(
        self,
        tactics: dict,
        formations: List[dict],
        focus_team: int = 0,
    ) -> dict:
        """戦術分析結果からコーチングコメント一式を生成

        Args:
            tactics: TacticalAnalyzer.analyze() の結果
            formations: [{"team", "formation", "confidence"}, ...]
            focus_team: コーチング対象のチーム（0 = チームA）
        """
        shape = next((t for t in tactics["teams"] if t["team"] == focus_team), None)
        opp_shape = next((t for t in tactics["teams"] if t["team"] != focus_team), None)
        offside = next(
            (t for t in tactics.get("offside", {}).get("teams", []) if t["team"] == focus_team),
            None,
        )
        passing = tactics.get("passing")

        good, issues, improvements, issue_keys = self._team_findings(shape, offside, passing, focus_team)
        individual = self._individual_findings(passing, offside, focus_team)

        drill = self._next_drill(issue_keys)

        levels = {
            "beginner": self._render_level(good, issues, improvements, "beginner"),
            "intermediate": self._render_level(good, issues, improvements, "intermediate"),
            "advanced": self._render_level(good, issues, improvements, "advanced"),
        }

        result = {
            "focus_team": focus_team,
            "good_points": [g["text"]["intermediate"] for g in good],
            "issues": [i["text"]["intermediate"] for i in issues],
            "improvements": [i["text"]["intermediate"] for i in improvements],
            "levels": levels,
            "individual": individual,
            "next_drill": drill,
        }

        polished = self._polish_with_llm(result, shape, formations)
        if polished:
            result["llm_summary"] = polished

        return result

    # ------------------------------------------------------------------
    # チーム戦術の所見
    # ------------------------------------------------------------------

    def _team_findings(self, shape: Optional[dict], offside: Optional[dict],
                       passing: Optional[dict], focus_team: int):
        """(良い点, 課題, 改善案, 課題キー) を生成。各項目は 3 レベルの文章を持つ"""
        good: List[dict] = []
        issues: List[dict] = []
        improvements: List[dict] = []
        issue_keys: List[str] = []

        def entry(beginner: str, intermediate: str, advanced: str) -> dict:
            return {"text": {"beginner": beginner, "intermediate": intermediate, "advanced": advanced}}

        if shape is None:
            issues.append(entry(
                "選手をうまく検出できませんでした。",
                "選手検出数が不足しており、チーム全体の分析ができません。",
                "有効サンプルが不足。俯瞰かつ両チームが写るフレームで再解析を推奨します。",
            ))
            return good, issues, improvements, issue_keys

        # --- コンパクトネス ---
        c = shape["compactness"]
        if c >= 70:
            good.append(entry(
                "チームがギュッとまとまっていて、守りやすい形です。",
                f"コンパクトネス {c}/100。選手間の距離が適切で、ボールを奪いやすい陣形です。",
                f"平均選手間距離が理想域にありコンパクトネス {c}/100。ライン間圧縮により中央のパスコースを消せています。",
            ))
        elif c < 50:
            issue_keys.append("compactness")
            issues.append(entry(
                "チームが広がりすぎていて、間を使われやすい状態です。",
                f"コンパクトネス {c}/100。選手間の距離が開き、ライン間へのパスを許しやすい状態です。",
                f"コンパクトネス {c}/100。垂直・水平方向とも圧縮が不足し、バイタルエリアの管理が困難です。",
            ))
            improvements.append(entry(
                "守るときは、みんなでボールの方に寄りましょう。",
                "守備時は縦横 35m 以内を目安にブロックを圧縮し、ボールサイドへ全体でスライドしましょう。",
                "ボールサイドコンプレッションを徹底し、逆サイドは捨ててウィークサイドのカバーシャドウで管理しましょう。",
            ))

        # --- ライン間 ---
        for warning in shape.get("line_gap_warnings", []):
            issue_keys.append("line_gap")
            gap_txt = warning
            issues.append(entry(
                "守りの列と列の間が空いています。そこにパスを通されると危険です。",
                gap_txt,
                gap_txt + " 相手のIH/トップ下がこのゾーンで前を向くと一気に加速されます。",
            ))
            improvements.append(entry(
                "前の列の選手が少し下がって、間をせまくしましょう。",
                "ライン間は 10〜15m を目安に。前線ラインが下がって圧縮するか、DF ラインを押し上げましょう。",
                "ボール非保持ではライン間 10m 台前半を基準に、CB のポジティブな押し上げと MF の背中管理で圧縮を再現しましょう。",
            ))

        # --- 幅と深さ（攻撃） ---
        w = shape["attack_width_score"]
        if w >= 70:
            good.append(entry(
                "攻めのとき、横に大きく広がれています。",
                f"攻撃時の幅 {shape['width_m']:.0f}m を確保。相手の守備ブロックを横に広げられています。",
                f"攻撃幅 {shape['width_m']:.0f}m。両ワイドの張りにより相手 SB を釘付けにし、ハーフスペースの侵入路を確保できています。",
            ))
        elif w < 45:
            issue_keys.append("width")
            issues.append(entry(
                "攻めのときにみんなが真ん中に集まりすぎています。",
                f"攻撃時の幅が {shape['width_m']:.0f}m と狭く、相手ブロックの外を使えていません。",
                f"攻撃幅 {shape['width_m']:.0f}m は不十分。密集自体は崩しの布石になりますが、逆サイドのアイソレーションが用意されていません。",
            ))
            improvements.append(entry(
                "サイドの選手はタッチラインの近くまで開きましょう。",
                "ウイングはタッチライン幅を取り、SB のオーバーラップで幅と厚みを両立させましょう。",
                "ポジショナルプレーの5レーン原則で幅を担保し、片側過負荷→逆サイド展開の設計を持ちましょう。",
            ))

        # --- サポート ---
        s = shape["support_score"]
        if passing is not None and s < 45:
            issue_keys.append("support")
            issues.append(entry(
                "ボールを持っている選手のまわりに、助けが少ないです。",
                f"サポートスコア {s}/100。保持者の周囲にパスコースを作る動きが不足しています。",
                f"サポートスコア {s}/100。保持者に対する角度・距離・タイミングの三要素のうち角度の多様性が欠けています。",
            ))
            improvements.append(entry(
                "パスを出したら、また次にもらえる場所に動きましょう。",
                "パス&ムーブを徹底し、保持者に対して常に 2〜3 つの角度でサポートを作りましょう。",
                "3人目の動き（third man run）を仕込み、レイオフから前進する再現性のある構造を作りましょう。",
            ))

        # --- プレス ---
        p = shape["press_intensity"]
        if p >= 60:
            good.append(entry(
                "ボールのまわりにすばやく人数をかけられています。",
                f"プレス強度 {p}/100。ボール周辺に十分な人数をかけ、即時奪回の体勢が取れています。",
                f"プレス強度 {p}/100。ファーストプレスと同時にパスコースを切るカバーシャドウが機能しています。",
            ))
        elif p < 30 and shape["block_height"] != "ローブロック":
            issue_keys.append("press")
            issues.append(entry(
                "ボールを持っている相手に、あまりプレッシャーをかけられていません。",
                f"プレス強度 {p}/100。中途半端な高さで構えており、ボールにも行けずスペースも守れていません。",
                f"プレス強度 {p}/100。ブロック高さ（{shape['block_height']}）に対してプレストリガーが共有されていない兆候です。",
            ))
            improvements.append(entry(
                "行くなら全員で行く、行かないなら全員で下がる、をはっきりさせましょう。",
                "「バックパス」「タッチが大きい」などのプレストリガーをチームで統一しましょう。",
                "プレッシングのトリガーとカバーの連動（1st DF の限定→2nd DF のインターセプト）を設計しましょう。",
            ))

        # --- オフサイドライン ---
        if offside and offside.get("line_x") is not None:
            if offside.get("height_level") == "warning":
                issue_keys.append("offside_line")
                a = offside["assessment"]
                issues.append(entry(
                    "守りの最終ラインの高さが、いまの状況に合っていません。",
                    a,
                    a,
                ))
                improvements.append(entry(
                    "ボールの位置を見て、みんなで一緒にラインを上げ下げしましょう。",
                    "ボール保持者への圧力の有無を基準に、ライン全体で連動して上下動しましょう。",
                    "「プレッシャーあり=ステイ/アップ、プレッシャーなし=ドロップ」の原則を CB がコーチングして統率しましょう。",
                ))
            else:
                good.append(entry(
                    "守りの最終ラインの高さがちょうどいいです。",
                    "最終ラインの高さが状況に対して適切にコントロールされています。",
                    f"最終ライン（x={offside['line_x']:.2f}）と GK のカバー距離のバランスが取れており、裏のリスク管理が機能しています。",
                ))

        # --- パス選択 ---
        if passing is not None:
            best = passing["options"][0] if passing.get("options") else None
            progressive = [o for o in passing.get("options", []) if o["class"] == "progressive"]
            if progressive:
                good.append(entry(
                    f"前に進めるパスコースが {len(progressive)} 本あります。",
                    f"前進可能なパスコースが {len(progressive)} 本確保されています。",
                    f"ライン突破可能なパスレーンが {len(progressive)} 本。レーン占有の配置が機能しています。",
                ))
            elif best is not None:
                issue_keys.append("pass_selection")
                issues.append(entry(
                    "前へのパスコースがふさがれています。",
                    "前進パスのコースがすべて封鎖されており、攻撃が停滞しやすい状態です。",
                    "縦パスレーンが全封鎖。保持側のレーン配置と相手ブロックの噛み合わせを再考する局面です。",
                ))
                improvements.append(entry(
                    "横パスで相手を動かしてから、前を狙いましょう。",
                    "サイドチェンジやリターンパスで相手ブロックをスライドさせ、ライン間が開いた瞬間を狙いましょう。",
                    "ベイトパス（誘い）でプレスを引き込み、3人目経由で反対レーンのライン間へ差し込みましょう。",
                ))

        if not good:
            good.append(entry(
                "チャレンジする姿勢が見えます。この調子で続けましょう。",
                "解析可能な配置が記録できています。継続して撮影・解析することで傾向が見えてきます。",
                "サンプルを蓄積中です。同一アングルでの定点撮影により指標の比較可能性が高まります。",
            ))

        return good, issues, improvements, issue_keys

    # ------------------------------------------------------------------
    # 個人戦術の所見
    # ------------------------------------------------------------------

    def _individual_findings(self, passing: Optional[dict], offside: Optional[dict],
                             focus_team: int) -> List[dict]:
        individual = []

        if passing is not None and passing["holder"]["team"] == focus_team:
            best = passing["options"][0] if passing.get("options") else None
            if best is not None:
                individual.append({
                    "target": f"ボール保持者（#{passing['holder']['index'] + 1}）",
                    "comment": passing["recommendation"],
                })
            risky = [o for o in passing.get("options", []) if o["class"] == "risky"]
            if len(risky) >= 2:
                individual.append({
                    "target": "受け手の選手たち",
                    "comment": "マークに付かれたまま足元で受けようとしている選手が多いです。"
                               "一度マーカーから離れる動き（チェックアウト→チェックイン）でパスコースを作りましょう。",
                })

        if offside and offside.get("line_x") is not None and offside.get("height_level") == "warning":
            individual.append({
                "target": "最終ラインの選手（CB）",
                "comment": "ラインの上げ下げの声かけはあなたの仕事です。ボール保持者への圧力を見て "
                           "「アップ」「ステイ」「ドロップ」を明確にコールしましょう。",
            })

        return individual

    # ------------------------------------------------------------------
    # レンダリング補助
    # ------------------------------------------------------------------

    @staticmethod
    def _render_level(good: List[dict], issues: List[dict], improvements: List[dict], level: str) -> dict:
        return {
            "good_points": [g["text"][level] for g in good],
            "issues": [i["text"][level] for i in issues],
            "improvements": [i["text"][level] for i in improvements],
        }

    @staticmethod
    def _next_drill(issue_keys: List[str]) -> dict:
        if not issue_keys:
            return {
                "issue": None,
                "menu": DRILL_BY_ISSUE["balance"],
                "reason": "大きな課題がないため、実戦形式でバランスを維持する練習を提案します。",
            }
        # 最も多く挙がった課題を優先
        key = max(set(issue_keys), key=issue_keys.count)
        return {
            "issue": key,
            "menu": DRILL_BY_ISSUE.get(key, DRILL_BY_ISSUE["balance"]),
            "reason": "今回の解析で最も大きかった課題に対応する練習メニューです。",
        }

    # ------------------------------------------------------------------
    # LLM による磨き上げ（任意）
    # ------------------------------------------------------------------

    def _polish_with_llm(self, result: dict, shape: Optional[dict],
                         formations: List[dict]) -> Optional[str]:
        if self._client is None or shape is None:
            return None
        try:
            summary_input = {
                "formations": formations,
                "metrics": shape,
                "good": result["good_points"],
                "issues": result["issues"],
            }
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system",
                     "content": "あなたはプロサッカーの戦術コーチです。分析データを 3〜4 文の総評にまとめてください。"},
                    {"role": "user", "content": str(summary_input)},
                ],
                max_tokens=400,
                temperature=0.6,
            )
            return response.choices[0].message.content
        except Exception:
            return None
