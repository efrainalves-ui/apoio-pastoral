import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const requiredFiles = [
  'dist/index.html',
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/icons/icon-192.png',
  'dist/icons/icon-512.png',
  'dist/icons/icon-maskable-512.png',
]

await Promise.all(requiredFiles.map((file) => access(resolve(file))))

const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'))
if (manifest.name !== 'Apoio Pastoral') throw new Error('Nome do manifesto inválido.')
if (manifest.display !== 'standalone') throw new Error('A PWA precisa usar display standalone.')
if (!Array.isArray(manifest.icons) || manifest.icons.length < 3) throw new Error('Ícones da PWA incompletos.')

const index = await readFile('dist/index.html', 'utf8')
if (!index.includes('rel="manifest"')) throw new Error('Manifesto não foi injetado no HTML.')
if (/fonts\.googleapis|googletagmanager|analytics/iu.test(index)) throw new Error('Dependência externa não autorizada no shell offline.')

const worker = await readFile('dist/sw.js', 'utf8')
if (worker.length < 100) throw new Error('Service worker vazio.')

process.stdout.write(`PWA verificada: ${requiredFiles.length} artefatos, manifesto standalone e service worker.\n`)
