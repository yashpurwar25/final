import { mkdir, readFile, stat, rename } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const source = value('--manifest', 'https://huggingface.co/datasets/ranbyDipz/sih-lidar-clip/resolve/main/manifest.json')
const destination = resolve(value('--out', '../.cache/hf-clip'))
const quality = value('--quality', 'all')
const limit = Number(value('--limit', '1000'))
if (!['lite', 'full', 'all'].includes(quality) || !Number.isInteger(limit) || limit < 1) throw new Error('Use --quality lite|full|all and a positive --limit.')

async function download(url, file, bytes) {
  if (bytes && await stat(file).then((s) => s.size === bytes).catch(() => false)) return
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.partial`
  await new Promise((accept, reject) => {
    const child = spawn('curl', ['-fLsS', '--retry', '4', '--retry-delay', '2', '--max-time', '120', url, '-o', temporary], { stdio: ['ignore', 'ignore', 'inherit'] })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? accept() : reject(new Error(`Download failed: ${url}`)))
  })
  if (bytes && (await stat(temporary)).size !== bytes) throw new Error(`Size mismatch: ${file}`)
  await rename(temporary, file)
}

await download(source, resolve(destination, 'manifest.json'))
const manifest = JSON.parse(await readFile(resolve(destination, 'manifest.json'), 'utf8'))
if (manifest.format !== 'LGF1-clip') throw new Error('Not an LGF1 manifest')
const jobs = manifest.frames.slice(0, limit).flatMap((frame) =>
  (quality === 'all' ? ['lite', 'full'] : [quality]).map((kind) => {
    if (!new RegExp(`^${kind}/[a-zA-Z0-9_-]+\\.lgf\\.gz$`).test(frame[kind])) throw new Error('Unsafe manifest path')
    return { url: new URL(frame[kind], source).href, file: resolve(destination, frame[kind]), bytes: frame[`${kind}_bytes`] }
  }))
let next = 0, complete = 0
await Promise.all(Array.from({ length: 12 }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++]
    await download(job.url, job.file, job.bytes)
    complete += 1
    if (complete % 100 === 0 || complete === jobs.length) console.log(`${complete}/${jobs.length} files verified`)
  }
}))
console.log(`Clip downloaded to ${destination}`)
