import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from '../scripts/build.mjs'

// Full Anki templates, not rendered sample cards. No Anki installation needed.
export async function buildTestTemplates() {
  const directory = fileURLToPath(new URL('./', import.meta.url))
  const outputs = await generate()
  await mkdir(directory, { recursive: true })
  for (const filename of ['ja-zh_front.html', 'ja-zh_back.html', 'style.css']) {
    await writeFile(path.join(directory, filename), outputs.get(`jlpt/${filename}`), 'utf8')
  }
  return directory
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built complete JLPT test templates in ${await buildTestTemplates()}`)
}
