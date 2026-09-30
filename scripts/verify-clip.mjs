import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { decodeFrame, gunzipIfNeeded } from '../../dashbard_timesxript_drivability/decodeFrame.ts'

const root = resolve(process.argv[2] || '../.cache/hf-clip')
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
let verified = 0
for (const entry of manifest.frames) {
  for (const quality of ['lite', 'full']) {
    const file = resolve(root, entry[quality])
    assert.equal((await stat(file)).size, entry[`${quality}_bytes`], file)
    const bytes = await readFile(file)
    const frame = decodeFrame(await gunzipIfNeeded(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
    assert.equal(frame.header.frame_id, entry.id, file)
    assert.equal(frame.cells.count, entry.n_cells, file)
    assert.equal(frame.header.n_points_total, entry.n_points, file)
    assert.equal(frame.points.count, Math.ceil(entry.n_points / frame.header.point_stride), file)
    assert.deepEqual(frame.header.timing_ms, entry.timing_ms, file)
    assert.deepEqual(frame.header.accuracy, entry.accuracy, file)
    verified += 1
  }
  if (verified % 200 === 0) console.log(`${verified} frames decoded and verified`)
}
console.log(`Verified ${verified} files against the hosted JSON manifest`)
