import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const templates = [
  { name: 'cet', front: 'front.html', back: 'back.html', fonts: false },
  { name: 'jlpt', front: 'ja-zh_front.html', back: 'ja-zh_back.html', fonts: true },
  { name: 'ja_grammar', front: 'front.html', back: 'back.html', fonts: true },
]
const read = async name => (await readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n').trimEnd()
const jsHeader = '// Generated from src; edit source files, then run npm run build.\n'
const htmlHeader = '<!-- 自动生成：请修改 src 并运行 npm run build。 -->\n'
const cssHeader = '/* 自动生成：请修改 src 并运行 npm run build。 */\n'

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

export async function generate() {
  const outputs = new Map()
  const petConfig = JSON.parse(await read('src/shared/pet-config.json'))
  const sharedRuntime = await read('src/shared/runtime.js')
  const petRuntime = await read('src/shared/pet.js')
  for (const template of templates) {
    const { name } = template
    const settings = name === 'jlpt' ? JSON.parse(await read(`src/${name}/config.json`)) : {}
    const cardRuntime = await read(`src/${name}/card.js`)
    // The delayed initializer sees BackSide after FrontSide has finished parsing.
    // Both sides include it to cover clients that do not execute FrontSide scripts.
    const runtime = `<script>\n${jsHeader};(function () {\n${sharedRuntime}\n${petRuntime}\n` +
      `const petConfig = ${JSON.stringify(petConfig, null, 2)}\n` +
      `const settings = ${JSON.stringify(settings, null, 2)}\n` +
      `setTimeout(() => {\n  const context = createContext()\n  if (!context) return\n  try {\n${cardRuntime}\n` +
      `  } catch (error) {\n    context.dispose()\n    console.error(error)\n  }\n}, 0)\n})()\n</script>`
    for (const side of ['front', 'back']) {
      let html = await expandPartials(await read(`src/${name}/${side}.html`), name)
      html = html.replace('<!-- @runtime -->', runtime)
      if (/<!-- @|@@\w+@@/.test(html)) throw new Error(`Unresolved directive in ${name}/${side}`)
      outputs.set(`${name}/${template[side]}`, htmlHeader + html + '\n')
    }
    const css = [await read('src/shared/tokens.css')]
    if (template.fonts) css.push(await read('src/shared/fonts.css'))
    css.push(await read(`src/${name}/card.css`), await read('src/shared/pet.css'))
    outputs.set(`${name}/style.css`, cssHeader + css.join('\n\n') + '\n')
  }
  return outputs
}

export async function build(check = false) {
  const outputs = await generate()
  const stale = []
  for (const [name, content] of outputs) {
    const filename = path.join(root, name)
    if (check) {
      let actual = ''
      try { actual = (await readFile(filename, 'utf8')).replace(/\r\n/g, '\n') } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (actual !== content) stale.push(name)
    } else {
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, content, 'utf8')
    }
  }
  if (stale.length) throw new Error(`Generated templates are stale: ${stale.join(', ')}. Run npm run build.`)
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
