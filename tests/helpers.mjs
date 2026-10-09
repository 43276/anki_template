import { JSDOM, VirtualConsole } from 'jsdom'
import { generate, templates } from '../scripts/build.mjs'

// Render Anki conditionals before replacing fields. Filters are provided by the
// fixture, not emulated: the tests exercise HTML structure and runtime behavior.
export function render(template, fields) {
  const pattern = /{{([^{}]+)}}/g
  const stack = [true]
  let result = ''
  let offset = 0
  for (const match of template.matchAll(pattern)) {
    if (stack.every(Boolean)) result += template.slice(offset, match.index)
    const tag = match[1]
    if (tag.startsWith('#') || tag.startsWith('^')) {
      const value = !!fields[tag.slice(1)]
      stack.push(tag[0] === '#' ? value : !value)
    } else if (tag.startsWith('/')) {
      if (stack.length === 1) throw new Error(`Unexpected closing tag: ${tag}`)
      stack.pop()
    } else if (stack.every(Boolean)) {
      result += fields[tag] ?? fields[tag.split(':').at(-1)] ?? ''
    }
    offset = match.index + match[0].length
  }
  if (stack.length !== 1) throw new Error('Unclosed Anki condition')
  return result + template.slice(offset)
}

export const sampleFields = {
  '正面': 'learn', '英语发音': '<a class="replay-button">▶</a>', '音标': '/lɜːn/',
  '解释': '学习', '词根': '词根', '近义词': 'study', '例句': 'We learn.', '权威例句': 'Learn every day.',
  Word: '文法', 'furigana:Word': '<ruby>文法<rt>ぶんぽう</rt></ruby>', Example1: ' 文法 を 学ぶ ', Chinese1: '学习语法', Audio1: '<a class="replay-button">▶</a>',
  ConnectiveType1: '名詞', Explain1: '解説', Note1: '注意', Image1: '<img src="sample.png">',
  VocabKanji: '学ぶ', 'text:kanji:VocabKanji': '学ぶ', VocabFurigana: 'まなぶ', VocabPoS: '動詞',
  'furigana:VocabKanji': '<ruby><rb>学</rb><rt>まな</rt></ruby>ぶ',
  VocabDefSC: '学习', VocabPlus: '補足', VocabAudio: '<a class="replay-button">▶</a>',
  SentKanji1: '文法を学ぶ', SentFurigana1: '文法を学ぶ', SentDefSC1: '学习语法', SentType1: '例',
  SentAudio1: '<a class="replay-button">▶</a>',
}

export async function cardHtml(name, side, fields = sampleFields, options = {}) {
  const outputs = await generate(options)
  const template = templates.find(item => item.name === name)
  const front = render(outputs.get(`${name}/${template.front}`), fields)
  return side === 'front' ? front : render(outputs.get(`${name}/${template.back}`), { ...fields, FrontSide: front })
}

export function session(html, css = '', classes = '', ankiWeb = false) {
  const errors = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', error => errors.push(error))
  virtualConsole.on('error', error => errors.push(error))
  const container = ankiWeb ? '<div id="quiz"><div id="qa"></div></div>' : '<div id="qa"></div>'
  const dom = new JSDOM(`<html class="${classes}"><head><style>${css}</style></head><body class="card">${container}</body></html>`, {
    runScripts: 'outside-only', virtualConsole,
  })
  const { window } = dom
  // Keep probabilistic fly-throughs out of unrelated layout/audio assertions.
  window.Math.random = () => 0.5
  window.HTMLMediaElement.prototype.play = function () {
    this.dataset.plays = String(Number(this.dataset.plays || 0) + 1)
    return Promise.resolve()
  }
  window.HTMLMediaElement.prototype.pause = function () {}
  let clock = 0
  let nextId = 0
  const timers = new Map()
  window.setTimeout = (callback, delay = 0) => {
    const id = ++nextId
    timers.set(id, { callback, due: clock + delay })
    return id
  }
  window.clearTimeout = id => timers.delete(id)
  function advance(milliseconds) {
    const end = clock + milliseconds
    while (true) {
      const next = [...timers.entries()].filter(([, value]) => value.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0]
      if (!next) break
      timers.delete(next[0])
      clock = next[1].due
      next[1].callback()
    }
    clock = end
  }
  function show(content, executeFront = true, initialize = true) {
    const scripts = [...content.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
    window.document.getElementById('qa').innerHTML = content.replace(/<script>[\s\S]*?<\/script>/g, '')
    for (const script of executeFront ? scripts : scripts.slice(-1)) window.eval(script)
    if (initialize) advance(0)
  }
  show(html)
  return {
    dom, window, errors, timers, show, advance,
    close() { window.__ankiTemplateContext?.dispose(); dom.window.close() },
  }
}
