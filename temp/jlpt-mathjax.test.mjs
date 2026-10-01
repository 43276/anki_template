import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { generate, root } from '../scripts/build.mjs'
import { cardHtml, sampleFields, session } from '../tests/helpers.mjs'

// Anki scans the complete HTML, including scripts, before showing a card.
// Source: https://github.com/ankitects/anki/blob/main/ts/reviewer/index.ts
const mathjaxPattern = /\\\[(.*?)\\\]|\\\((.*?)\\\)/su
const source = (await readFile(path.join(root, 'src/jlpt/card.js'), 'utf8')).replace(/\r\n/g, '\n')
const declaration = source.match(/function cleanWord\([^]*?\n}/)?.[0]
assert.ok(declaration, 'cleanWord declaration must be present')
const cleanWord = vm.runInNewContext(`(${declaration})`, {
  readField: name => {
    assert.equal(name, 'kanji')
    return ' 学ぶ[まなぶ](動詞)12 '
  },
})

function legacyCleanWord(word) {
  return word.replace(/\[[^\]]*\]|\([^)]*\)|[0-9!@#$%^&*()_+\-='":\\|,.<>/?~～〜\s]+/g, '')
}

test('regression control: Anki mistakes the legacy cleanup script for mathematics', () => {
  const legacyScript = `<script>${legacyCleanWord.toString()}</script>`
  assert.equal(mathjaxPattern.test(legacyScript), true)
})

test('cleanWord preserves bracket, annotation, whitespace and punctuation cleanup', () => {
  const cases = [
    ['', ''],
    ['学ぶ', '学ぶ'],
    ['学ぶ[まなぶ]', '学ぶ'],
    ['学ぶ(動詞)', '学ぶ'],
    [' 学ぶ[まなぶ](動詞)12 ', '学ぶ'],
    // Preserve the legacy result when the punctuation branch consumes a space
    // and an opening parenthesis together. This change does not fix that quirk.
    [' 学ぶ[まなぶ] (動詞) 12 ', '学ぶ動詞'],
    ['アルバム[album] (名詞) ０', 'アルバム名詞０'],
    ['a l b u m 0!@#$%^&*()_+-=\'":\\|,.<>/?~～〜', 'album'],
    ['\t学\nぶ\r\u3000', '学ぶ'],
    ['語[一][二](三)(四)', '語'],
    ['語[]()', '語'],
    ['語[未閉じ', '語[未閉じ'],
    ['語(未閉じ', '語未閉じ'],
    ['語[内[側]外]', '語外]'],
    ['語(内(側)外)', '語外'],
    ['（名）［注］①;・語😀', '（名）［注］①;・語😀'],
  ]
  for (const [input, expected] of cases) {
    assert.equal(legacyCleanWord(input), expected, `legacy expectation: ${input}`)
    assert.equal(cleanWord(input), expected, `corrected cleanup: ${input}`)
  }
})

test('cleanWord still reads its default value from the kanji field', () => {
  assert.equal(cleanWord(), '学ぶ')
})

test('corrected cleanup is equivalent to the legacy regex on a deterministic mixed corpus', () => {
  const pieces = ['学', 'ぶ', '漢字', 'かな', 'アルバム', 'abc', '12', '[注]', '(名)', '[', ']', '(', ')', '（全角）', '［注］', '①', '😀', '\n', '\t', ' ', '\u3000', '~', '〜', '+', '/', '\\', '"', "'", ';', '\u0000']
  let seed = 0x12345678
  for (let i = 0; i < 1000; i++) {
    let input = ''
    for (let j = 0; j < 12; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      input += pieces[seed % pieces.length]
    }
    assert.equal(cleanWord(input), legacyCleanWord(input), input)
  }
})

test('JLPT generated front and back scripts do not trigger Anki MathJax detection', async () => {
  const outputs = await generate()
  for (const filename of ['jlpt/ja-zh_front.html', 'jlpt/ja-zh_back.html']) {
    const html = outputs.get(filename)
    assert.equal(mathjaxPattern.test(html), false, filename)
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      assert.equal(mathjaxPattern.test(match[1]), false, `${filename}: script`)
      new vm.Script(match[1], { filename })
    }
  }
})

test('complete rendered JLPT cards do not look like formulas for ordinary fields', async () => {
  const full = { ...sampleFields }
  for (let i = 2; i <= 4; i++) {
    for (const prefix of ['SentKanji', 'SentFurigana', 'SentDefSC', 'SentType', 'SentAudio']) {
      full[prefix + i] = sampleFields[prefix + 1]
    }
  }
  for (const fields of [sampleFields, full, { ...full, SentKanji1: '' }, {}, { Alt1: 'alternate' }]) {
    for (const side of ['front', 'back']) {
      assert.equal(mathjaxPattern.test(await cardHtml('jlpt', side, fields)), false, side)
    }
  }
})

test('real inline and display mathematics in note fields are still detected', async () => {
  for (const formula of [String.raw`\(x + 1\)`, String.raw`\[x^2\]`]) {
    const fields = { ...sampleFields, SentKanji1: formula, SentFurigana1: formula }
    for (const side of ['front', 'back']) {
      assert.equal(mathjaxPattern.test(await cardHtml('jlpt', side, fields)), true, side)
    }
  }
})

test('cleaned annotated vocabulary still highlights words and replaces example placeholders', async () => {
  const fields = {
    ...sampleFields,
    'text:kanji:VocabKanji': ' 学ぶ[まなぶ](動詞)12 ',
    SentKanji1: '文法を学ぶ。〜', SentFurigana1: '文法を学ぶ。〜',
  }
  const app = session(await cardHtml('jlpt', 'front', fields))
  try {
    assert.deepEqual([...app.window.document.querySelectorAll('#FrontSide .SentKanji strong')].map(el => el.textContent), ['学ぶ', '学ぶ'])
    app.show(await cardHtml('jlpt', 'back', fields))
    assert.deepEqual([...app.window.document.querySelectorAll('#BackSide .SentFurigana strong')].map(el => el.textContent), ['学ぶ', '学ぶ'])
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})

test('iPad automatic copy still uses cleaned vocabulary after revealing the answer', async () => {
  const fields = { ...sampleFields, 'text:kanji:VocabKanji': ' 学ぶ[まなぶ](動詞)12 ' }
  const app = session(await cardHtml('jlpt', 'front', fields), '', 'ipad')
  const copied = []
  Object.defineProperty(app.window.navigator, 'clipboard', {
    configurable: true, value: { writeText: async word => { copied.push(word) } },
  })
  try {
    assert.deepEqual(copied, [])
    app.show(await cardHtml('jlpt', 'back', fields))
    await Promise.resolve()
    assert.deepEqual(copied, ['学ぶ'])
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})
