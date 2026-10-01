import assert from 'node:assert/strict'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { generate } from '../scripts/build.mjs'
import { cardHtml, sampleFields } from '../tests/helpers.mjs'
import { buildTestTemplates } from './build-jlpt.mjs'

// Use the installed Anki's actual reviewer and MathJax files. All card changes
// happen in an isolated browser, never in the user's Anki or collection.
const directory = fileURLToPath(new URL('./', import.meta.url))
const localPrograms = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'Programs/Anki/app_packages/_aqt/data/web')
  : null
const roots = process.env.ANKI_WEB_ROOT ? [process.env.ANKI_WEB_ROOT] : [
  'D:/application/Anki/app_packages/_aqt/data/web',
  localPrograms,
  'C:/Program Files/Anki/app_packages/_aqt/data/web',
].filter(Boolean)
let webRoot
for (const candidate of roots) {
  try { await access(path.join(candidate, 'js/reviewer.js')); webRoot = path.resolve(candidate); break } catch {}
}
if (!webRoot) throw new Error('Set ANKI_WEB_ROOT to the installed Anki web directory containing js/reviewer.js.')

const browserPaths = process.env.ANKI_BROWSER_PATH ? [process.env.ANKI_BROWSER_PATH] : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
let executablePath
for (const candidate of browserPaths) {
  try { await access(candidate); executablePath = candidate; break } catch {}
}
if (!executablePath) throw new Error('Set ANKI_BROWSER_PATH to an installed Chrome/Edge/Chromium browser.')

await buildTestTemplates()
const outputs = await generate()
const reviewer = await readFile(path.join(webRoot, 'js/reviewer.js'), 'utf8')
const legacyPattern = String.raw`\[[^\]]*\]|\([^)]*\)`
const correctedPattern = String.raw`\u005b[^\u005d]*\u005d|\u0028[^\u0029]*\u0029`
const browser = await chromium.launch({ executablePath, headless: true })
const report = {
  generatedAt: new Date().toISOString(), webRoot, browser: browser.version(),
  note: 'Installed Anki JavaScript in isolated Chromium; Qt, add-ons, real media, native playback and the click-to-display path are not measured. Timings are informational, not assertions.',
  scenarios: [],
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95: Number(sorted[Math.floor(sorted.length * .95)].toFixed(2)),
  }
}

function contentType(filename) {
  const types = { '.js': 'application/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
  return types[path.extname(filename)] || 'application/octet-stream'
}

async function verifyScenario(width, rate, variant) {
  const fields = { ...sampleFields }
  for (let i = 2; i <= 4; i++) {
    for (const prefix of ['SentKanji', 'SentFurigana', 'SentDefSC', 'SentAudio', 'SentType']) {
      fields[prefix + i] = sampleFields[prefix + 1]
    }
  }
  if (variant === 'real-formula') {
    fields.SentKanji1 = fields.SentFurigana1 = String.raw`\(x + 1\)`
  }
  let front = await cardHtml('jlpt', 'front', fields)
  let back = await cardHtml('jlpt', 'back', fields)
  if (variant === 'legacy-control') {
    assert.ok(front.includes(correctedPattern) && back.includes(correctedPattern))
    front = front.replaceAll(correctedPattern, legacyPattern)
    back = back.replaceAll(correctedPattern, legacyPattern)
  }
  front = `<style>${outputs.get('jlpt/style.css')}</style>${front}`
  back = `<style>${outputs.get('jlpt/style.css')}</style>${back}`
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  try {
    const errors = []
    const mathRequests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().includes('/mathjax')) mathRequests.push(request.url())
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.route('http://anki.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/') {
        return route.fulfill({ contentType: 'text/html', body: '<html><head></head><body class="card"><div id="qa"></div><div id="_flag" hidden></div><div id="_mark" hidden></div></body></html>' })
      }
      if (!pathname.startsWith('/_anki/')) return route.fulfill({ status: 404, body: '' })
      const filename = path.resolve(webRoot, decodeURIComponent(pathname.slice('/_anki/'.length)))
      const relative = path.relative(webRoot, filename)
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return route.fulfill({ status: 404, body: '' })
      }
      try {
        return route.fulfill({ body: await readFile(filename), contentType: contentType(filename) })
      } catch { return route.fulfill({ status: 404, body: '' }) }
    })
    await page.goto('http://anki.test/')
    await page.evaluate(() => {
      window.bridgeCommand = () => {}
      window.pycmd = () => {}
      Math.random = () => .5
    })
    await page.addScriptTag({ content: reviewer })
    const result = await page.evaluate(async ({ front, back }) => {
      if (typeof window._updateQA !== 'function') throw new Error('Installed reviewer does not expose _updateQA.')
      const start = performance.now()
      await window._updateQA(front, null, () => {}, () => {})
      const initialFrontMs = performance.now() - start
      const mathLoaded = typeof window.MathJax?.typesetPromise === 'function'
      let typesets = 0
      let typesetMs = 0
      if (mathLoaded) {
        const original = window.MathJax.typesetPromise.bind(window.MathJax)
        window.MathJax.typesetPromise = async (...args) => {
          const start = performance.now()
          typesets++
          try { return await original(...args) } finally { typesetMs += performance.now() - start }
        }
      }
      const runs = []
      for (let i = 0; i < 20; i++) {
        await window._updateQA(front, null, () => {}, () => {})
        const previousTypesets = typesets
        typesetMs = 0
        const start = performance.now()
        await window._updateQA(back, null, () => {}, () => {})
        const totalMs = performance.now() - start
        const qa = document.getElementById('qa')
        const root = document.getElementById('BackSide')
        if (i >= 5) runs.push({
          totalMs, typesetMs, typesets: typesets - previousTypesets,
          ready: window.__ankiTemplateContext?.root === root && !!window.__ankiTemplateContext.isBack,
          visible: getComputedStyle(qa).opacity === '1' && getComputedStyle(root).visibility === 'visible',
          labels: [...root.querySelectorAll('.SentFurigana em')].map(el => el.textContent),
          vocabularyButton: !!qa.querySelector('#FrontSide .VocabAudio .replay-button'),
          formulaContainers: root.querySelectorAll('mjx-container').length,
        })
      }
      return { initialFrontMs, mathLoaded, runs }
    }, { front, back })
    assert.deepEqual(errors, [], `${variant}/${width}/${rate}: browser errors`)
    assert.equal(result.runs.length, 15)
    assert.equal(result.mathLoaded, variant !== 'corrected')
    if (variant === 'corrected') assert.equal(mathRequests.length, 0, 'ordinary JLPT must not load MathJax')
    else assert.ok(mathRequests.length > 0, 'control must exercise real MathJax loading')
    for (const run of result.runs) {
      assert.equal(run.ready, true)
      assert.equal(run.visible, true)
      assert.equal(run.vocabularyButton, true)
      assert.deepEqual(run.labels, ['［例］', '［例］', '［例］', '［例］'])
      assert.equal(run.typesets, variant === 'corrected' ? 0 : 1)
      if (variant === 'real-formula') assert.ok(run.formulaContainers > 0, 'real mathematics must still render')
    }
    const summary = {
      variant, width, cpuRate: rate, samples: result.runs.length,
      initialFrontMs: Number(result.initialFrontMs.toFixed(2)),
      backUpdateMs: stats(result.runs.map(run => run.totalMs)),
      mathjaxTypesetMs: stats(result.runs.map(run => run.typesetMs)),
      mathLoaded: result.mathLoaded, mathRequestCount: mathRequests.length,
      typesetsPerBack: result.runs[0].typesets,
    }
    report.scenarios.push(summary)
    console.log(JSON.stringify(summary))
  } finally { await page.close() }
}

try {
  for (const width of [375, 1280]) {
    for (const rate of [1, 6]) {
      for (const variant of ['legacy-control', 'corrected']) await verifyScenario(width, rate, variant)
    }
  }
  await verifyScenario(375, 1, 'real-formula')
  const reportPath = path.join(directory, 'jlpt-mathjax-report.json')
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Anki reviewer verified ${report.scenarios.length} scenarios. Report: ${reportPath}`)
} finally { await browser.close() }
