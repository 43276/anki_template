import assert from 'node:assert/strict'
import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { generate, templates, root } from './build.mjs'
import { cardHtml, sampleFields } from '../tests/helpers.mjs'

// Reuse an installed browser. ANKI_BROWSER_PATH also supports other machines.
const candidates = [process.env.ANKI_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
let executablePath
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break } catch {}
}
if (!executablePath) throw new Error('Set ANKI_BROWSER_PATH to an installed Chrome/Edge/Chromium browser.')
const browser = await chromium.launch({ executablePath, headless: true })
const outputs = await generate()
const preview = path.join(root, 'preview')
await mkdir(preview, { recursive: true })
let count = 0
try {
  for (const { name } of templates) {
    for (const width of [375, 1280]) {
      for (const theme of ['light', 'dark']) {
        for (const side of ['front', 'back']) {
          const page = await browser.newPage({ viewport: { width, height: 900 } })
          const errors = []
          page.on('pageerror', error => errors.push(error.message))
          // Exclude probabilistic pet fly-throughs from layout screenshots.
          await page.evaluate(() => { Math.random = () => 0.5 })
          const fields = { ...sampleFields, Chinese1: '', Image1: '' }
          const html = await cardHtml(name, side, fields)
          const classes = `${width < 475 ? 'android' : ''} ${theme === 'dark' ? 'nightMode' : ''}`
          await page.setContent(`<html class="${classes}"><head><style>body { background: ${theme === 'dark' ? '#202020' : '#fff'}; color: ${theme === 'dark' ? '#eee' : '#222'}; }</style><style>${outputs.get(`${name}/style.css`)}</style></head><body class="card"><div id="qa">${html}</div></body></html>`)
          await page.waitForFunction(() => !!window.__ankiTemplateContext)
          assert.deepEqual(errors, [], `${name}/${side}/${theme}/${width}`)
          const result = await page.evaluate(() => {
            const root = window.__ankiTemplateContext.root
            const selectors = ['.word', '.word rt', '.content .num', '.VocabKanji [lang="ja"]', '.VocabDef', '.SentDef']
            const fonts = {}
            for (const selector of selectors) {
              const el = root.querySelector(selector)
              if (el) fonts[selector] = { family: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize }
            }
            return {
              fonts, isBack: window.__ankiTemplateContext.isBack,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              frontHidden: document.getElementById('FrontSide').hidden,
            }
          })
          assert.equal(result.isBack, side === 'back')
          assert.equal(result.overflow, false, `${name}: horizontal overflow at ${width}`)
          if (name === 'ja_grammar') {
            assert.match(result.fonts['.word'].family, /^KleeOne/)
            assert.match(result.fonts['.content .num'].family, /^"Source Han Sans JP"/)
            if (side === 'back') {
              assert.equal(result.frontHidden, true)
              assert.equal(result.fonts['.word rt'].size, '14px')
            }
          }
          if (name === 'jlpt') {
            if (side === 'front') assert.match(result.fonts['.VocabKanji [lang="ja"]'].family, /^KleeOne/)
            if (side === 'back') assert.match(result.fonts['.VocabDef'].family, /^"Source Han Sans CN"/)
          }
          // Keep one screenshot per card side/theme at mobile width for visual QA.
          if (width === 375) await page.screenshot({ path: path.join(preview, `${name}-${side}-${theme}.png`), fullPage: true })
          await page.close()
          count++
        }
      }
    }
  }
  console.log(`Browser verified ${count} card/viewport/theme combinations; screenshots saved in preview/.`)
} finally { await browser.close() }
