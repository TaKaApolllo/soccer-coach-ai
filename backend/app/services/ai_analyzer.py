import os
import re
from typing import List, Optional

from dotenv import load_dotenv

try:
    from openai import OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    OpenAI = None
    _OPENAI_AVAILABLE = False

load_dotenv()

# 骨格計測値のラベル（プロンプト・フォールバック文の両方で使用）
METRIC_LABELS = {
    "backswing_knee_angle": "バックスイング時の膝角度",
    "torso_lean_at_impact": "インパクト時の体幹の傾き",
    "plant_leg_knee_angle": "軸足の膝角度",
    "kicking_leg_knee_angle": "蹴り足の膝角度",
    "arm_extension": "腕の開き（肘角度）",
}


class AIAnalyzer:
    """Vision LLM + 骨格計測値によるサッカープレイ解析

    OPENAI_API_KEY が未設定でも、骨格推定の計測値から
    ヒューリスティックなコーチングを生成して動作する。
    """

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        self.client = OpenAI(api_key=api_key) if (_OPENAI_AVAILABLE and api_key) else None
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")

    def analyze_play(
        self,
        images_base64: List[str],
        analysis_type: str,
        additional_context: Optional[str] = None,
        pose_metrics: Optional[dict] = None,
        pose_score: Optional[int] = None,
    ) -> dict:
        """画像/動画フレームを解析してフィードバックを生成

        Args:
            images_base64: Base64エンコードされた画像のリスト
            analysis_type: 解析タイプ（kick, pass, dribble, positioning, movement, general）
            additional_context: ユーザーからの追加コンテキスト
            pose_metrics: 骨格推定による関節角度などの計測値
            pose_score: 骨格推定によるフォームスコア (0-100)
        """
        if self.client is None:
            return self._heuristic_analysis(analysis_type, pose_metrics, pose_score)

        system_prompt = self._get_system_prompt()
        user_prompt = self._get_analysis_prompt(analysis_type, additional_context, pose_metrics, pose_score)

        content = [{"type": "text", "text": user_prompt}]
        for img_base64 in images_base64:
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{img_base64}",
                    "detail": "high"
                }
            })

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": content}
                ],
                max_tokens=2000,
                temperature=0.7
            )
            analysis_text = response.choices[0].message.content
        except Exception as e:
            # API エラー時はヒューリスティックにフォールバック
            result = self._heuristic_analysis(analysis_type, pose_metrics, pose_score)
            result["note"] = f"AI API エラーのため簡易解析を表示しています: {e}"
            return result

        return self._parse_analysis(analysis_text, analysis_type)

    def _get_system_prompt(self) -> str:
        return """あなたは経験豊富なプロサッカーコーチです。

選手の動画や画像と、骨格推定 AI による関節角度の計測値を組み合わせて、
数値の根拠がある技術的なアドバイスを提供します。

あなたの専門知識:
- キックフォーム分析（インサイド、インステップ、アウトサイド、ボレー等）
- パス技術（グラウンダー、ロングフィード、スルーパス等）
- ドリブル技術（ボールタッチ、重心移動、緩急）
- ポジショニング（体の向き、足の位置、重心）
- オフ・ザ・ボールの動き
- ディフェンス技術
- ゴールキーパー技術

参考にする選手:
- メッシ: ドリブル、ボールコントロール、フィニッシュ
- ロナウド: シュートフォーム、ヘディング、フィジカル
- モドリッチ: パス精度、ビジョン、ボールキープ
- カンテ: 守備位置取り、インターセプト
- ノイアー: GKポジショニング、飛び出し

フィードバックは以下の構造で提供してください:
0. 【スコア】フォームの総合評価を 0-100 の整数で（例: スコア: 82）
1. 【良い点】現在できていること
2. 【改善点】技術的な改善ポイント
3. 【具体的アドバイス】どう改善すべきか（計測値を引用して具体的に）
4. 【参考選手】お手本となるプロ選手のプレー
5. 【練習メニュー】おすすめの練習方法"""

    def _get_analysis_prompt(
        self,
        analysis_type: str,
        additional_context: Optional[str],
        pose_metrics: Optional[dict] = None,
        pose_score: Optional[int] = None,
    ) -> str:
        prompts = {
            "kick": """この画像/動画のキックフォームを詳しく分析してください。

注目ポイント:
- 軸足の位置と向き
- 蹴り足の振り方
- 体の傾き・バランス
- 腕の使い方
- インパクトの瞬間
- フォロースルー""",

            "pass": """この画像/動画のパスを詳しく分析してください。

注目ポイント:
- パスを出す足の使い方
- 体の向きと視野
- パスコースの選択
- タイミング
- ボールスピード・精度""",

            "dribble": """この画像/動画のドリブルを詳しく分析してください。

注目ポイント:
- ボールタッチの細かさと強さ
- 重心の高さと移動
- 視線（顔が上がっているか）
- 緩急・方向転換
- 相手との間合い""",

            "positioning": """この画像/動画のポジショニングを詳しく分析してください。

注目ポイント:
- 体の向き（ゴールとボールの両方が見えるか）
- 足の置き位置（すぐに動き出せる体勢か）
- 周囲のスペース認識
- マークの付き方/外し方""",

            "movement": """この画像/動画のオフ・ザ・ボールの動きを詳しく分析してください。

注目ポイント:
- ランニングコース
- タイミング
- 相手DFとの駆け引き
- スペースの使い方
- パスを引き出す動き""",

            "general": """この画像/動画のサッカープレーを総合的に分析してください。

技術、戦術、フィジカル面から評価し、改善点をアドバイスしてください。"""
        }

        base_prompt = prompts.get(analysis_type, prompts["general"])

        if pose_metrics:
            lines = ["\n\n【骨格推定 AI による計測値】"]
            for key, value in pose_metrics.items():
                label = METRIC_LABELS.get(key)
                if label:
                    lines.append(f"- {label}: {value}°")
            if pose_score is not None:
                lines.append(f"- 骨格推定によるフォームスコア: {pose_score}/100")
            lines.append("この計測値を引用しながら、数値に基づいたアドバイスをしてください。")
            base_prompt += "\n".join(lines)

        if additional_context:
            base_prompt += f"\n\n【ユーザーからの追加情報】\n{additional_context}"

        return base_prompt

    def _parse_analysis(self, analysis_text: str, analysis_type: str) -> dict:
        """解析結果を構造化"""
        return {
            "analysis_type": analysis_type,
            "raw_analysis": analysis_text,
            "score": self._extract_score(analysis_text),
            "sections": self._extract_sections(analysis_text),
        }

    @staticmethod
    def _extract_score(text: str) -> Optional[int]:
        """本文から「スコア: 82」のような総合評価を抽出"""
        m = re.search(r"スコア[】\s:：]*([0-9]{1,3})", text)
        if m:
            score = int(m.group(1))
            if 0 <= score <= 100:
                return score
        return None

    def _extract_sections(self, text: str) -> dict:
        """テキストからセクションを抽出"""
        sections = {
            "good_points": "",
            "improvements": "",
            "advice": "",
            "reference_player": "",
            "practice_menu": ""
        }

        current_section = None
        for line in text.split('\n'):
            if '良い点' in line or '長所' in line:
                current_section = "good_points"
            elif '改善' in line or '課題' in line:
                current_section = "improvements"
            elif 'アドバイス' in line or '具体的' in line:
                current_section = "advice"
            elif '参考' in line or '選手' in line:
                current_section = "reference_player"
            elif '練習' in line or 'メニュー' in line:
                current_section = "practice_menu"
            elif current_section:
                sections[current_section] += line + "\n"

        return sections

    # ------------------------------------------------------------------
    # ヒューリスティックフォールバック（API キーなしでも動作させる）
    # ------------------------------------------------------------------

    def _heuristic_analysis(
        self,
        analysis_type: str,
        pose_metrics: Optional[dict],
        pose_score: Optional[int],
    ) -> dict:
        good, improve, advice = [], [], []

        if pose_metrics:
            checks = [
                ("backswing_knee_angle", 60, 110,
                 "バックスイングで膝が十分に曲がり、スイングの力を溜められています",
                 "バックスイングが浅く、キックの威力が出にくいフォームです",
                 "蹴り足のかかとをお尻に近づけるイメージで、膝を深く畳んでから振り抜きましょう"),
                ("torso_lean_at_impact", 5, 25,
                 "上体の角度が適切で、ボールをしっかり抑えられています",
                 "上体が起きすぎ（または倒れすぎ）で、ボールが浮きやすい姿勢です",
                 "軸足をボールの真横に置き、胸をボールにかぶせる意識を持ちましょう"),
                ("plant_leg_knee_angle", 140, 175,
                 "軸足の膝が適度に緩み、安定した土台ができています",
                 "軸足が突っ張っており、体のバランスを崩しやすい状態です",
                 "軸足の膝を軽く曲げ、着地の衝撃を吸収できる姿勢を作りましょう"),
                ("arm_extension", 90, 170,
                 "腕を使って体のバランスを取れています",
                 "腕が体に付きすぎており、バランスが不安定です",
                 "蹴り足と逆側の腕を大きく開いて、回転のバランスを取りましょう"),
            ]
            for key, lo, hi, good_msg, bad_msg, advice_msg in checks:
                if key in pose_metrics:
                    value = pose_metrics[key]
                    label = METRIC_LABELS.get(key, key)
                    if lo <= value <= hi:
                        good.append(f"{good_msg}（{label}: {value}°）")
                    else:
                        improve.append(f"{bad_msg}（{label}: {value}°、理想は {lo}〜{hi}°）")
                        advice.append(advice_msg)

        if pose_metrics:
            if not good:
                good.append("大きな課題のない安定したフォームです。継続して記録し、成長を可視化しましょう")
            if not improve:
                improve.append("大きな課題は検出されませんでした。動作スピードを上げても同じフォームを保てるか試しましょう")
        else:
            good.append("解析を継続して記録することで、成長をグラフで確認できるようになります")
            improve.append("骨格を検出できませんでした。選手の全身が写るように、横から明るい場所で撮影してみてください")
        if not advice:
            advice.append("スロー再生で自分のフォームとプロ選手の動画を見比べてみましょう")

        reference = {
            "kick": "ロナウドのシュートフォーム: 軸足の踏み込みと胸をかぶせる上体の使い方に注目",
            "pass": "モドリッチのパス: 蹴る直前まで顔を上げて複数のコースを見ている点に注目",
            "dribble": "メッシのドリブル: 小刻みなタッチと低い重心、減速からの一気の加速に注目",
        }.get(analysis_type, "メッシ・ロナウド・モドリッチのプレー動画をスロー再生で観察しましょう")

        practice = {
            "kick": "壁当てインサイドキック 100 本（15分）: 軸足の位置を毎回確認しながら",
            "pass": "壁当てパス練習（10分）: ワンタッチでコントロール → 狙った高さに返す",
            "dribble": "コーンジグザグドリル（15分）: 顔を上げたままボールタッチ",
        }.get(analysis_type, "基礎ボールタッチ 10 分 + 対人 1対1 を週 2 回")

        raw = "\n".join([
            *(["【スコア】スコア: " + str(pose_score)] if pose_score is not None else []),
            "【良い点】", *[f"- {g}" for g in good],
            "【改善点】", *[f"- {i}" for i in improve],
            "【具体的アドバイス】", *[f"- {a}" for a in advice],
            f"【参考選手】{reference}",
            f"【練習メニュー】{practice}",
        ])

        return {
            "analysis_type": analysis_type,
            "raw_analysis": raw,
            "score": pose_score,
            "sections": {
                "good_points": "\n".join(f"- {g}" for g in good),
                "improvements": "\n".join(f"- {i}" for i in improve),
                "advice": "\n".join(f"- {a}" for a in advice),
                "reference_player": reference,
                "practice_menu": practice,
            },
            "note": "OPENAI_API_KEY が未設定のため、骨格推定の計測値に基づく簡易解析を表示しています。",
        }
