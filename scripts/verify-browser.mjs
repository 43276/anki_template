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
  // Hold initializers across real painted frames. Old runtime-only hiding left
  // the entire inherited front visible during this window, especially on slow devices.
  let flipCount = 0
  for (const name of ['jlpt', 'ja_grammar']) {
    for (const width of [375, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
      const front = await cardHtml(name, 'front')
      const back = await cardHtml(name, 'back')
      await page.setContent(`<html><head><style>${outputs.get(`${name}/style.css`)}</style></head><body class="card"><div id="qa">${front}</div></body></html>`)
      await page.waitForFunction(() => !!window.__ankiTemplateContext)
      const frames = await page.evaluate(async ({ back, name }) => {
        Math.random = () => 0.5
        const nativeTimeout = window.setTimeout
        const queued = []
        window.setTimeout = (fn, delay = 0, ...args) => {
          if (delay !== 0) return nativeTimeout(fn, delay, ...args)
          queued.push(() => fn(...args))
          return -queued.length
        }
        const qa = document.getElementById('qa')
        qa.innerHTML = back
        for (const inert of [...qa.querySelectorAll('script')]) {
          const executable = document.createElement('script')
          executable.textContent = inert.textContent
          inert.replaceWith(executable)
        }
        const frames = []
        const capture = () => {
          const inherited = document.querySelector(name === 'jlpt' ? '#FrontSide > .SentenceList' : '#FrontSide')
          frames.push({
            hidden: getComputedStyle(inherited).display === 'none',
            answerVisible: document.getElementById('BackSide').getClientRects().length > 0,
            initialized: !!window.__ankiTemplateContext?.isBack,
          })
        }
        capture()
        for (let i = 0; i < 12; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve))
          capture()
        }
        window.setTimeout = nativeTimeout
        queued.forEach(fn => fn())
        return frames
      }, { back, name })
      assert.equal(frames.length, 13)
      for (const frame of frames) {
        assert.equal(frame.initialized, false, 'this check must run before delayed initialization')
        assert.equal(frame.hidden, true, `${name}/${width}: inherited front flashed`)
        assert.equal(frame.answerVisible, true, `${name}/${width}: hiding must not blank the answer`)
      }
      // Replacing the card removes its inline guard, so the next front is visible.
      await page.evaluate(front => {
        const qa = document.getElementById('qa')
        qa.innerHTML = front.replace(/<script>[\s\S]*?<\/script>/g, '')
      }, front)
      assert.equal(await page.evaluate(name => {
        const element = document.querySelector(name === 'jlpt' ? '#FrontSide > .SentenceList' : '#FrontSide')
        return getComputedStyle(element).display !== 'none'
      }, name), true)
      await page.close()
      flipCount++
    }
  }
  console.log(`Flip verified ${flipCount} slow-CPU scenarios across 13 pre-initialization samples each.`)
} finally { await browser.close() }
