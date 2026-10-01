import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import * as cssTree from 'css-tree'
import { generate, root, templates, build } from '../scripts/build.mjs'
import { cardHtml, sampleFields, session, render } from './helpers.mjs'

test('generated files match sources, contain valid JS/CSS and no obsolete references', async () => {
  await build(true)
  const outputs = await generate()
  for (const [name, content] of outputs) {
    assert.doesNotMatch(content, /zh-Hant|SourceHanSansTW|VocabDefTC|SentDefTC|:has\(/, name)
    assert.doesNotMatch(content, /<!-- @|@@INDEX@@|@@NUMBER@@/, name)
    if (name.endsWith('.css')) {
      const errors = []
      cssTree.parse(content, { onParseError: error => errors.push(error) })
      assert.deepEqual(errors, [], name)
    } else {
      for (const match of content.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        assert.doesNotMatch(match[1], /{{/, 'Anki fields must never be interpolated into JavaScript')
        new vm.Script(match[1], { filename: name })
      }
    }
  }
})

test('conditional fields produce balanced HTML without duplicate IDs', async () => {
  for (const { name } of templates) {
    for (const fields of [sampleFields, { ...sampleFields, Chinese1: '', SentKanji1: '', Example1: '' }, { ...sampleFields, Alt1: 'alternate' }]) {
      const html = (await cardHtml(name, 'back', fields)).replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '')
      const stack = []
      const ids = new Set()
      for (const match of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)) {
        const [, closing, tag, attrs] = match
        if (closing) {
          assert.equal(stack.pop(), tag, `${name}: mismatched closing ${tag}`)
        } else {
          const id = attrs.match(/\bid="([^"]+)"/)?.[1]
          if (id) { assert.ok(!ids.has(id), `${name}: duplicate ${id}`); ids.add(id) }
          if (!['hr', 'br', 'img', 'input', 'source'].includes(tag)) stack.push(tag)
        }
      }
      assert.deepEqual(stack, [], name)
    }
  }
})

test('all three templates initialize both sides and clean up on repeated card changes', async () => {
  for (const { name } of templates) {
    const front = await cardHtml(name, 'front')
    const back = await cardHtml(name, 'back')
    const app = session(front)
    try {
      assert.equal(app.window.__ankiTemplateContext.isBack, false, name)
      for (let i = 0; i < 5; i++) {
        app.show(back, i % 2 === 0)
        assert.equal(app.window.__ankiTemplateContext.isBack, true, name)
        app.show(front)
        assert.equal(app.window.__ankiTemplateContext.isBack, false, name)
        assert.ok(app.timers.size <= 1, `${name}: old timers survived`)
      }
      assert.deepEqual(app.errors, [], name)
    } finally { app.close() }
  }
})

test('grammar hides the front on the answer even when Chinese translations are absent', async () => {
  const app = session(await cardHtml('ja_grammar', 'back', { ...sampleFields, Chinese1: '' }))
  try {
    assert.equal(app.window.document.getElementById('FrontSide').hidden, true)
    assert.equal(app.window.document.querySelector('#BackSide .exampleback [lang="ja"]:last-child').textContent, '文法を学ぶ')
    assert.equal(app.window.document.querySelectorAll('#BackSide .right-side .replay-button').length, 1)
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})

test('JLPT uses actual field indexes when an earlier sentence is absent', async () => {
  const app = session(await cardHtml('jlpt', 'back', {
    ...sampleFields, SentKanji1: '', SentKanji3: '習う', SentFurigana3: '習う', SentType3: '関',
    SentDefSC3: '学习', VocabPoS: '動詞 "引用" `記号`',
  }))
  try {
    const sentence = app.window.document.querySelector('#BackSide [data-index="3"]')
    assert.equal(sentence.querySelector('em').textContent, '［関］')
    assert.equal(sentence.querySelector('.synonym').textContent, '習う')
    assert.equal(app.window.document.querySelector('.VocabPoS em').textContent, '［動詞"引用"`記号`］')
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})

test('pet sizes come from CSS and pets/styles/timers are removed on card replacement', async () => {
  const css = 'body .pet { --pet-size: 90px; }'
  const front = await cardHtml('cet', 'front')
  const app = session(front, css)
  try {
    app.window.Math.random = () => 0
    app.advance(15000)
    const pet = app.window.document.querySelector('.pet')
    assert.ok(pet)
    assert.match(pet.style.transform, /-90px/)
    assert.equal(app.window.document.head.querySelectorAll('style').length, 2)
    pet.dispatchEvent(new app.window.Event('click', { bubbles: true }))
    pet.dispatchEvent(new app.window.Event('click', { bubbles: true }))
    assert.equal(app.window.document.head.querySelectorAll('style').length, 2, 'cancelled animation styles leaked')
    app.show(front)
    assert.equal(app.window.document.querySelector('.pet'), null)
    assert.equal(app.window.document.head.querySelectorAll('style').length, 1)
    assert.equal(app.timers.size, 1)
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})

test('removing a card without a successor also disposes its runtime', async () => {
  const app = session(await cardHtml('cet', 'front'))
  try {
    app.window.document.getElementById('qa').innerHTML = ''
    await Promise.resolve()
    assert.equal(app.window.__ankiTemplateContext, undefined)
    assert.equal(app.timers.size, 0)
  } finally { app.close() }
})

test('font priorities retain separate Chinese, Japanese, display and number stacks', async () => {
  const tokens = await readFile(path.join(root, 'src/shared/tokens.css'), 'utf8')
  const ast = cssTree.parse(tokens)
  const declarations = {}
  cssTree.walk(ast, node => {
    if (node.type === 'Declaration') declarations[node.property] = cssTree.generate(node.value).trim()
  })
  assert.match(declarations['--font-cn'], /^'Source Han Sans CN'/)
  assert.match(declarations['--font-ja'], /^'Source Han Sans JP'/)
  assert.match(declarations['--font-display'], /^'KleeOne'/)
  assert.match(declarations['--font-number'], /^'Source Han Sans JP',\s*'KleeOne'/)
  const grammar = await readFile(path.join(root, 'src/ja_grammar/card.css'), 'utf8')
  assert.match(grammar, /\.grammar-card \.num\s*{\s*font-family: var\(--grammar-font-number\)/)
})

test('all nineteen grammar examples and their independent translation conditions are generated', async () => {
  const outputs = await generate()
  const back = outputs.get('ja_grammar/back.html')
  for (let i = 1; i <= 19; i++) {
    const html = render(back, { [`Example${i}`]: '例', [`Chinese${i}`]: '' })
    assert.match(html, /class="exampleback"/)
    assert.doesNotMatch(html, /class="cnote"/)
    assert.ok(back.includes(`{{Audio${i}}}`))
  }
})

test('AnkiWeb audio buttons initialize once and only the vocabulary is force-played', async () => {
  const html = await cardHtml('jlpt', 'back', {
    ...sampleFields, VocabAudio: '<audio src="vocab.mp3" controls></audio>',
    SentAudio1: '<audio src="sentence.mp3" controls></audio>',
  })
  const app = session(html, '', '', true)
  try {
    const vocabulary = app.window.document.querySelector('.VocabAudio audio')
    assert.equal(vocabulary.dataset.plays, '1')
    assert.equal(app.window.document.querySelector('.SentAudio audio').dataset.plays, undefined)
    assert.equal(app.window.document.querySelectorAll('.VocabAudio .replay-button').length, 1)
    app.window.document.querySelector('.SentAudio .replay-button').click()
    assert.equal(app.window.document.querySelector('.SentAudio audio').dataset.plays, '1')
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})

test('JLPT kana/kanji/example-display settings still apply on front and Android back', async () => {
  for (const display of ['kana', 'kanji']) {
    const front = (await cardHtml('jlpt', 'front')).replace('"display": "default"', `"display": "${display}"`)
      .replace('"frontExamples": "all"', '"frontExamples": "none"')
    const app = session(front, '', 'android')
    try {
      const document = app.window.document
      assert.equal(document.querySelector('#FrontSide .SentenceList').style.display, 'none')
      if (display === 'kana') assert.equal(document.querySelector('.VocabKanji [lang="ja"]').textContent, 'まなぶ')
      else assert.equal(document.querySelector('.VocabKanji rt').style.display, 'none')
      app.show((await cardHtml('jlpt', 'back')).replaceAll('"display": "default"', `"display": "${display}"`), false)
      assert.notEqual(document.querySelector('.VocabKanji rt').style.display, 'none')
      assert.deepEqual(app.errors, [])
    } finally { app.close() }
  }
})

test('Anki shown hooks do not double-play or survive a card replacement', async () => {
  const front = await cardHtml('jlpt', 'front')
  const back = await cardHtml('jlpt', 'back')
  const app = session(front)
  try {
    app.window.onShownHook = []
    app.show(back)
    const button = app.window.document.querySelector('.VocabAudio .replay-button')
    let clicks = 0
    button.addEventListener('click', () => clicks++)
    assert.equal(app.window.onShownHook.length, 1)
    app.window.onShownHook.forEach(fn => fn())
    assert.equal(clicks, 0, 'already-played vocabulary must not play again')
    app.show(front)
    assert.equal(app.window.onShownHook.length, 0)
    assert.deepEqual(app.errors, [])
  } finally { app.close() }
})
