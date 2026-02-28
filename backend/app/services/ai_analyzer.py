import os
from typing import List, Optional
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class AIAnalyzer:
    """OpenAI Vision APIを使用したサッカープレイ解析"""

    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = "gpt-4o"

    def analyze_play(
        self,
        images_base64: List[str],
        analysis_type: str,
        additional_context: Optional[str] = None
    ) -> dict:
        """
        画像/動画フレームを解析してフィードバックを生成

        Args:
            images_base64: Base64エンコードされた画像のリスト
            analysis_type: 解析タイプ（kick, pass, positioning, movement, general）
            additional_context: ユーザーからの追加コンテキスト
        """
        system_prompt = self._get_system_prompt()
        user_prompt = self._get_analysis_prompt(analysis_type, additional_context)

        # 画像メッセージを構築
        content = [{"type": "text", "text": user_prompt}]

        for i, img_base64 in enumerate(images_base64):
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{img_base64}",
                    "detail": "high"
                }
            })

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

        return self._parse_analysis(analysis_text, analysis_type)

    def _get_system_prompt(self) -> str:
        return """あなたは経験豊富なプロサッカーコーチです。

選手の動画や画像を見て、技術的なアドバイスを提供します。

あなたの専門知識:
- キックフォーム分析（インサイド、インステップ、アウトサイド、ボレー等）
- パス技術（グラウンダー、ロングフィード、スルーパス等）
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
1. 【良い点】現在できていること
2. 【改善点】技術的な改善ポイント
3. 【具体的アドバイス】どう改善すべきか
4. 【参考選手】お手本となるプロ選手のプレー
5. 【練習メニュー】おすすめの練習方法"""

    def _get_analysis_prompt(self, analysis_type: str, additional_context: Optional[str]) -> str:
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

        if additional_context:
            base_prompt += f"\n\n【ユーザーからの追加情報】\n{additional_context}"

        return base_prompt

    def _parse_analysis(self, analysis_text: str, analysis_type: str) -> dict:
        """解析結果を構造化"""
        return {
            "analysis_type": analysis_type,
            "raw_analysis": analysis_text,
            "sections": self._extract_sections(analysis_text)
        }

    def _extract_sections(self, text: str) -> dict:
        """テキストからセクションを抽出"""
        sections = {
            "good_points": "",
            "improvements": "",
            "advice": "",
            "reference_player": "",
            "practice_menu": ""
        }

        # 簡易的なセクション抽出
        current_section = None
        lines = text.split('\n')

        for line in lines:
            line_lower = line.lower()

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
