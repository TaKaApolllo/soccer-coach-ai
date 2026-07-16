/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 既存のプレーンCSS（index.css）に影響を与えないよう、Tailwindのベースリセットは無効化する
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      screens: {
        // 3カラムレイアウト用の追加ブレークポイント（/analysis/kick）
        wide: '1440px'
      },
      /**
       * デザイントークン（キックフォーム分析系）。
       * index.css の CSS 変数との対応表:
       *   kick-bg       = --bg            (#0a0f14)
       *   kick-surface  = --surface       (#101820)
       *   kick-card     = analysis 系ガラスカード背景（ui.tsx cardStyle と一致）
       *   kick-border   = analysis 系カード枠（ui.tsx CARD_BORDER と一致）
       *   kick-accent   = ネオングリーン（analysis 系 #39ff88。CSS 変数 --accent は
       *                   クラシック側 #39e58c で色味が異なる点に注意）
       *   kick-success  = --success-color (#39e58c)
       *   kick-warn     = TONE_COLOR.warn (#facc15)
       *   kick-danger   = TONE_COLOR.bad  (#ef4444)
       *   kick-text     = --text-primary  (#f2f7f5)
       *   kick-text-sub = --text-secondary(#a7b4b0)
       * 新コンポーネントでは生の色コードを増やさず、これらのトークン
       * （または components/analysis/ui.tsx の TONE_COLOR）を使うこと。
       */
      colors: {
        'kick-bg': '#0a0f14',
        'kick-surface': '#101820',
        'kick-card': 'rgba(15, 23, 42, 0.72)',
        'kick-border': 'rgba(148, 163, 184, 0.18)',
        'kick-accent': '#39ff88',
        'kick-success': '#39e58c',
        'kick-warn': '#facc15',
        'kick-danger': '#ef4444',
        'kick-text': '#f2f7f5',
        'kick-text-sub': '#a7b4b0'
      },
      borderRadius: {
        card: '1rem'
      },
      boxShadow: {
        card: '0 18px 40px -24px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.03)'
      }
    }
  },
  plugins: []
}
