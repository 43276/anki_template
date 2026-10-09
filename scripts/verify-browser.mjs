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
// Match the new AnkiDroid reviewer's theme injection. Its body uses --canvas
// and --fg, so private card variables must not overwrite either host token.
const reviewerThemeCss = `
  :root { --canvas: #fff; --fg: #222; }
  :root[class*='night-mode'] { --canvas: #000; --fg: #fff; }
  html.night-mode { color-scheme: dark; }
  body { background-color: #fff; color: #222; }
  body.nightMode { background-color: var(--canvas); color: var(--fg); }
`
const preview = path.join(root, 'preview')
await mkdir(preview, { recursive: true })
let count = 0
try {
  for (const { name } of templates) {
    for (const width of [375, 1280]) {
      for (const theme of ['light', 'dark']) {
        for (const side of ['front', 'back']) {
          const page = await browser.newPage({ viewport: { width, height: 900 } })
          // Keep probabilistic pet fly-throughs out of layout screenshots.
          await page.evaluate(() => { Math.random = () => 0.5 })
          const errors = []
          page.on('pageerror', error => errors.push(error.message))
          const fields = { ...sampleFields, Chinese1: '', Image1: '' }
          const html = await cardHtml(name, side, fields)
          const classes = `${width < 475 ? 'android' : ''} ${theme === 'dark' ? 'night-mode' : ''}`
          const bodyClasses = `card ${theme === 'dark' ? 'nightMode night_mode' : ''}`
          await page.setContent(`<html class="${classes}" data-bs-theme="${theme}"><head><style>${reviewerThemeCss}</style><style>${outputs.get(`${name}/style.css`)}</style></head><body class="${bodyClasses}"><div id="qa">${html}</div></body></html>`)
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
              bodyBackground: getComputedStyle(document.body).backgroundColor,
              bodyForeground: getComputedStyle(document.body).color,
              cardForeground: getComputedStyle(root).color,
            }
          })
          assert.equal(result.isBack, side === 'back')
          assert.equal(result.overflow, false, `${name}: horizontal overflow at ${width}`)
          if (theme === 'dark') {
            assert.equal(result.bodyBackground, 'rgb(0, 0, 0)', `${name}/${side}/${width}: host background must stay black`)
            assert.equal(result.bodyForeground, 'rgb(255, 255, 255)', `${name}/${side}/${width}: host text color was overwritten`)
          }
          if (name === 'ja_grammar') {
            assert.match(result.fonts['.word'].family, /^KleeOne/)
            assert.match(result.fonts['.content .num'].family, /^"Source Han Sans JP"/)
            if (side === 'back') {
              assert.equal(result.frontHidden, true)
              assert.equal(result.fonts['.word rt'].size, '14px')
            }
          }
          if (name === 'jlpt') {
            assert.equal(result.cardForeground, theme === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(31, 41, 55)')
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
  // Hold deferred tasks across real frames. Grammar keeps its inherited front
  // hidden; JLPT must already have prepared all layout synchronously.
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
        const pendingState = name === 'jlpt' ? {
          answerHidden: getComputedStyle(document.getElementById('BackSide')).visibility === 'hidden',
          titleHidden: getComputedStyle(document.querySelector('#FrontSide .Question')).visibility === 'hidden',
        } : null
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
            ready: getComputedStyle(document.getElementById('BackSide')).visibility === 'visible',
            vocabularyButton: !!document.querySelector('#FrontSide .VocabAudio .replay-button'),
            labels: [...document.querySelectorAll('#BackSide em')].map(el => el.textContent),
            geometry: [...document.querySelectorAll('#FrontSide .Question, #BackSide .VocabPoS, #BackSide .SentFurigana, #BackSide .SentDef')].map(el => {
              const rect = el.getBoundingClientRect()
              return [rect.x, rect.y, rect.width, rect.height]
            }),
          })
        }
        capture()
        for (let i = 0; i < 12; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve))
          capture()
        }
        window.setTimeout = nativeTimeout
        queued.forEach(fn => fn())
        return { frames, pendingState }
      }, { back, name })
      assert.equal(frames.frames.length, 13)
      if (name === 'jlpt') assert.deepEqual(frames.pendingState, { answerHidden: true, titleHidden: true })
      for (const frame of frames.frames) {
        assert.equal(frame.initialized, name === 'jlpt', `${name}: unexpected initialization phase`)
        assert.equal(frame.hidden, true, `${name}/${width}: inherited front flashed`)
        assert.equal(frame.answerVisible, true, `${name}/${width}: hiding must not blank the answer`)
        if (name === 'jlpt') {
          assert.equal(frame.ready, true)
          assert.equal(frame.vocabularyButton, true)
          assert.deepEqual(frame.labels, ['［動詞］', '［補］', '［例］', '［訳］'])
          assert.deepEqual(frame.geometry, frames.frames[0].geometry, 'prepared elements moved between frames')
        }
      }
      // Replacing the card removes the answer-only hiding rule. The JLPT
      // front's own readiness gate is exercised separately below.
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
  console.log(`Flip verified ${flipCount} slow-CPU scenarios across 13 samples each with deferred tasks held.`)
  let nextCount = 0
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
    const back = await cardHtml('jlpt', 'back')
    await page.setContent(`<html><head><style>${outputs.get('jlpt/style.css')}</style></head><body class="card"><div id="qa">${back}</div></body></html>`)
    await page.waitForFunction(() => !!window.__ankiTemplateContext?.isBack)
    // First switch from an answer; then replace that front with another front.
    for (const type of ['例', '関']) {
      const front = await cardHtml('jlpt', 'front', { ...sampleFields, SentType1: type })
      const result = await page.evaluate(async front => {
        Math.random = () => 0.5
        const nativeTimeout = window.setTimeout
        const queued = []
        window.setTimeout = (fn, delay = 0, ...args) => {
          if (delay !== 0) return nativeTimeout(fn, delay, ...args)
          queued.push(() => fn(...args))
          return -queued.length
        }
        try {
          const qa = document.getElementById('qa')
          qa.innerHTML = front
          const root = document.getElementById('FrontSide')
          const hiddenBeforeScripts = getComputedStyle(root).visibility === 'hidden'
          for (const inert of [...qa.querySelectorAll('script')]) {
            const executable = document.createElement('script')
            executable.textContent = inert.textContent
            inert.replaceWith(executable)
          }
          const frames = []
          const capture = () => frames.push({
            visible: getComputedStyle(root).visibility === 'visible',
            initialized: window.__ankiTemplateContext?.root === root && !window.__ankiTemplateContext.isBack,
            labels: [...root.querySelectorAll('.SentKanji em')].map(el => el.textContent),
            geometry: [...root.querySelectorAll('.Question, .SentenceList, .SentKanji')].map(el => {
              const rect = el.getBoundingClientRect()
              return [rect.x, rect.y, rect.width, rect.height]
            }),
          })
          capture()
          for (let i = 0; i < 12; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve))
            capture()
          }
          return { frames, hiddenBeforeScripts }
        } finally {
          window.setTimeout = nativeTimeout
          queued.forEach(fn => fn())
        }
      }, front)
      assert.equal(result.hiddenBeforeScripts, true)
      assert.equal(result.frames.length, 13)
      for (const frame of result.frames) {
        assert.equal(frame.initialized, true, `jlpt/${width}: next front waited for a timer`)
        assert.equal(frame.visible, true, `jlpt/${width}: next front stayed hidden`)
        assert.deepEqual(frame.labels, [`［${type}］`])
        assert.deepEqual(frame.geometry, result.frames[0].geometry, 'next front moved between frames')
      }
      nextCount++
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(`Next front verified ${nextCount} JLPT slow-CPU transitions across 13 samples each with deferred tasks held.`)
} finally { await browser.close() }
