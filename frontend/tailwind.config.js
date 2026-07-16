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
      }
    }
  },
  plugins: []
}
