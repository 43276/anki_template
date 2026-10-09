import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { generate as generateTemplates, build as buildTemplates } from './build.mjs'

// The shared sources already omit pets; AnkiDroid manages them in the app.
const options = { outputDir: 'no_pets', command: 'npm run build:no-pets' }

export const generate = () => generateTemplates(options)
export const build = (check = false) => buildTemplates(check, options)

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const check = process.argv.includes('--check')
    console.log(`${check ? 'Checked' : 'Built'} ${await build(check)} template files in no_pets/.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
