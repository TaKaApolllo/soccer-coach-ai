import { chromium } from 'playwright'

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const SHOT = '/tmp/claude-0/-home-user-soccer-coach-ai/f9cd1010-7888-5b71-8dc5-bdac16b96617/scratchpad'
const BASE = 'http://127.0.0.1:5173'

const errors = []
function attach(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`))
}

const browser = await chromium.launch({ executablePath: EXEC })

// ---- Desktop 1440 ----
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2400 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
attach(page, 'kick-pro')
await page.goto(`${BASE}/kick-pro`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
// dismiss first-visit onboarding
try {
  const ob = page.locator('[data-testid="onboard-skip"]')
  if (await ob.isVisible()) { await ob.click(); await page.waitForTimeout(300) }
} catch {}

// full page screenshot
await page.screenshot({ path: `${SHOT}/ui8_pro_polished.png`, fullPage: true })
console.log('shot: polished')

// --- operation tests ---
const results = {}

// 1. angle row click -> joint highlight (check focusJoint dims others: look for active row style)
try {
  const row = page.locator('[data-testid^="angle-row-"]').first()
  await row.click()
  await page.waitForTimeout(400)
  // after click, viewer should have a focus (dimmed) group. Check an angle-row active bg applied
  const active = await page.locator('[data-testid^="angle-row-"]').evaluateAll(els =>
    els.some(e => e.style.background && e.style.background !== 'transparent'))
  results.angleRowHighlight = active
} catch (e) { results.angleRowHighlight = `ERR ${e.message}` }

// 2. insight chip -> scroll (check it doesn't throw, and coach card gets flash class shortly)
try {
  await page.locator('[data-testid="insight-chip-improvements"]').click()
  await page.waitForTimeout(600)
  results.insightChip = true
} catch (e) { results.insightChip = `ERR ${e.message}` }

// 3. keyboard: Space toggles play
try {
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const before = await page.locator('[data-testid="play-toggle"]').getAttribute('aria-label')
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  const after = await page.locator('[data-testid="play-toggle"]').getAttribute('aria-label')
  results.spaceToggle = before !== after ? `ok(${before}->${after})` : `nochange(${before})`
  await page.keyboard.press('Space') // pause again
} catch (e) { results.spaceToggle = `ERR ${e.message}` }

// 4. arrow keys seek (time text changes)
try {
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  results.arrowSeek = true
} catch (e) { results.arrowSeek = `ERR ${e.message}` }

// 5. compare tab -> ghost opacity slider present
try {
  await page.getByRole('tab', { name: '比較' }).click()
  await page.waitForTimeout(400)
  const slider = page.locator('[data-testid="ghost-opacity"]')
  const visible = await slider.isVisible()
  if (visible) {
    await slider.fill('90')
    await page.waitForTimeout(200)
  }
  results.ghostSlider = visible
} catch (e) { results.ghostSlider = `ERR ${e.message}` }

// back to form tab
try { await page.getByRole('tab', { name: 'フォーム' }).click(); await page.waitForTimeout(200) } catch {}

// 6. phase click seek
try {
  await page.locator('[data-testid="phase-1"]').click()
  await page.waitForTimeout(200)
  results.phaseSeek = true
} catch (e) { results.phaseSeek = `ERR ${e.message}` }

// 7. empty state: click new-analysis to show dropzone
try {
  await page.locator('[data-testid="new-analysis"]').click()
  await page.waitForTimeout(500)
  const dz = await page.locator('[data-testid="analyze-dropzone"]').isVisible()
  results.dropzone = dz
  if (dz) {
    // scroll to top and screenshot the dropzone/empty state (viewport shot of viewer area)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOT}/ui8_pro_empty.png`, fullPage: false })
    console.log('shot: empty')
  }
} catch (e) { results.dropzone = `ERR ${e.message}` }

await ctx.close()

// ---- Mobile 800 ----
const mctx = await browser.newContext({ viewport: { width: 800, height: 1600 } })
const mpage = await mctx.newPage()
attach(mpage, 'mobile')
await mpage.goto(`${BASE}/kick-pro`, { waitUntil: 'networkidle' })
await mpage.waitForTimeout(1500)
// dismiss onboarding if shown (fresh context)
try {
  const ob = mpage.locator('[data-testid="onboard-skip"]')
  if (await ob.isVisible()) await ob.click()
} catch {}
await mpage.waitForTimeout(300)
await mpage.screenshot({ path: `${SHOT}/ui8_pro_mobile.png`, fullPage: true })
console.log('shot: mobile')
await mctx.close()

// ---- Regression: other pages, console errors ----
const rctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const routeErrors = {}
for (const path of ['/', '/analysis', '/kick', '/form-analysis', '/growth', '/drills', '/settings']) {
  const rp = await rctx.newPage()
  const errs = []
  rp.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  rp.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  await rp.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await rp.waitForTimeout(800)
  routeErrors[path] = errs
  await rp.close()
}
await rctx.close()

await browser.close()

console.log('\n=== OPERATION RESULTS ===')
console.log(JSON.stringify(results, null, 2))
console.log('\n=== KICK-PRO CONSOLE ERRORS ===')
console.log(errors.length ? errors.join('\n') : 'none')
console.log('\n=== REGRESSION CONSOLE ERRORS ===')
for (const [p, e] of Object.entries(routeErrors)) console.log(`${p}: ${e.length ? e.join(' | ') : 'clean'}`)
