import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const templates = [
  { name: 'cet', front: 'front.html', back: 'back.html', fonts: false,
    petObstacles: '.cet-card__section, .cet-card__audio' },
  { name: 'jlpt', front: 'ja-zh_front.html', back: 'ja-zh_back.html', fonts: true,
    petObstacles: '.VocabKanji, .VocabFurigana, .VocabDef, .VocabPoS, .VocabPlus, .SentKanji, .SentFurigana, .SentDef, .VocabPitch, .VocabAudio, .SentAudio' },
  { name: 'ja_grammar', front: 'front.html', back: 'back.html', fonts: true,
    petObstacles: '.grammar-card .word, .grammar-card .content, .grammar-card .footer, .grammar-card .right-side' },
]
const read = async name => (await readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n').trimEnd()

async function expandPartials(html, name) {
  const pattern = /<!-- @repeat ([\w-]+\.html) (\d+) -->/g
  for (const match of [...html.matchAll(pattern)]) {
    const partial = await read(`src/${name}/partials/${match[1]}`)
    const expanded = Array.from({ length: Number(match[2]) }, (_, index) => partial
      .replaceAll('@@INDEX@@', String(index + 1))
      .replaceAll('@@NUMBER@@', String.fromCodePoint(0x2460 + index))).join('\n')
    html = html.replace(match[0], expanded)
  }
  return html
}

export async function generate({ command = 'npm run build', pets = true } = {}) {
  const jsHeader = `// Generated from src; edit source files, then run ${command}.\n`
  const htmlHeader = `<!-- 自动生成：请修改 src 并运行 ${command}。 -->\n`
  const cssHeader = `/* 自动生成：请修改 src 并运行 ${command}。 */\n`
  const outputs = new Map()
  const sharedRuntime = await read('src/shared/runtime.js')
  const petRuntime = pets ? await read('src/shared/pet.js') : ''
  const petConfig = pets ? JSON.parse(await read('src/shared/pet-config.json')) : null
  const petCss = pets ? await read('src/shared/pet.css') : ''
  for (const template of templates) {
    const { name } = template
    const settings = name === 'jlpt' ? JSON.parse(await read(`src/${name}/config.json`)) : {}
    const cardRuntime = await read(`src/${name}/card.js`)
    // Standalone JLPT fronts and backs prepare layout synchronously. Only the
    // front embedded in an unfinished answer defers to its back initializer.
    const petPrefix = pets ? `${petRuntime}\nconst petConfig = ${JSON.stringify(petConfig, null, 2)}\n` : ''
    const runtimePrefix = `<script>\n${jsHeader};(function () {\n${sharedRuntime}\n${petPrefix}` +
      `const settings = ${JSON.stringify(settings, null, 2)}\n`
    const reveal = name === 'jlpt' ?
      `\n  finally {\n    const frontPending = document.getElementById('jlpt-front-layout-pending')\n    if (frontPending) frontPending.remove()\n    if (context.isBack) {\n      const pending = document.getElementById('jlpt-layout-pending')\n      if (pending) pending.remove()\n    }\n  }` : ''
    const petInitializer = pets ? `setupPet(context, petConfig, ${JSON.stringify(template.petObstacles)})\n` : ''
    const initializeBody = `  const context = createContext()\n  if (!context) return\n  try {\n${cardRuntime}\n${petInitializer}` +
      `  } catch (error) {\n    context.dispose()\n    console.error(error)\n  }${reveal}\n`
    for (const side of ['front', 'back']) {
      const invoke = side === 'back' ? 'initialize()' :
        `if (document.getElementById('jlpt-layout-pending')) {\n  setTimeout(initialize, 0)\n} else {\n  initialize()\n}`
      const initializer = name === 'jlpt' ? `function initialize() {\n${initializeBody}}\n${invoke}\n` :
        `setTimeout(() => {\n${initializeBody}}, 0)\n`
      const runtime = runtimePrefix + initializer + `})()\n</script>`
      let html = await expandPartials(await read(`src/${name}/${side}.html`), name)
      html = html.replace('<!-- @runtime -->', runtime)
      if (/<!-- @|@@\w+@@/.test(html)) throw new Error(`Unresolved directive in ${name}/${side}`)
      outputs.set(`${name}/${template[side]}`, htmlHeader + html + '\n')
    }
    const css = [await read('src/shared/tokens.css')]
    if (template.fonts) css.push(await read('src/shared/fonts.css'))
    css.push(await read(`src/${name}/card.css`))
    if (pets) css.push(petCss)
    outputs.set(`${name}/style.css`, cssHeader + css.join('\n\n') + '\n')
  }
  return outputs
}

export async function build(check = false, { outputDir = '', command = 'npm run build', pets = true } = {}) {
  const outputs = await generate({ command, pets })
  const stale = []
  for (const [name, content] of outputs) {
    const outputName = path.join(outputDir, name)
    const filename = path.join(root, outputName)
    if (check) {
      let actual = ''
      try { actual = (await readFile(filename, 'utf8')).replace(/\r\n/g, '\n') } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (actual !== content) stale.push(outputName)
    } else {
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, content, 'utf8')
    }
  }
  if (stale.length) throw new Error(`Generated templates are stale: ${stale.join(', ')}. Run ${command}.`)
  return outputs.size
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`${process.argv.includes('--check') ? 'Checked' : 'Built'} ${await build(process.argv.includes('--check'))} template files.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
