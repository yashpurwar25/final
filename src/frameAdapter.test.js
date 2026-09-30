import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { Worker as NodeWorker } from 'node:worker_threads'
import { Color, Object3D } from 'three'
import { decodeFrame, gunzipIfNeeded } from '../../dashbard_timesxript_drivability/decodeFrame.ts'
import { adaptFrame } from './frameAdapter.js'
import { loadFrames } from './data.js'
import { parseExport } from './uploadService.js'
import { decodePreparedFrame } from './frameDecode.js'
import { colorForClass } from './palette.js'

function fixture(change = () => {}) {
  const sections = [
    ['points.xyz_cm', new Int16Array([100, 200, -173, 300, 400, 20]), [2, 3]],
    ['points.intensity', new Uint8Array([255, 0]), [2]],
    ['points.class', new Uint8Array([1, 0]), [2]],
    ['points.confidence', new Uint8Array([255, 128]), [2]],
    ['cells.ixy', new Int16Array([10, -2, 3, 4]), [2, 2]],
    ['cells.level', new Uint8Array([0, 3]), [2]],
    ['cells.class', new Uint8Array([9, 0]), [2]],
    ['cells.z_cm', new Int16Array([-173, -170, -171, 0, 200, 100]), [2, 3]],
    ['cells.z_std_mm', new Uint16Array([12, 400]), [2]],
    ['cells.traversability', new Uint8Array([255, 0]), [2]],
    ['cells.complexity', new Uint8Array([0, 128]), [2]],
    ['cells.confidence', new Uint8Array([255, 128]), [2]],
    ['cells.point_count', new Uint16Array([4, 2]), [2]],
  ]
  let offset = 4096
  const header = {
    format: 'LGF1', version: 1, frame_id: '001500', source: 'precomputed',
    n_cells: 2, n_points_total: 8, point_stride: 4, sensor_height_m: 1.73,
    level_sizes_m: [0.4, 0.2, 0.1, 0.05],
    timing_ms: { salsanext_total: 40, grid_engine_total: 7, end_to_end: 48 },
    stats: { n_points_in: 8, n_points_used: 6 }, accuracy: null,
    sections: sections.map(([name, data, shape]) => {
      offset = Math.ceil(offset / 8) * 8
      const section = { name, dtype: data instanceof Int16Array ? 'int16' : data instanceof Uint16Array ? 'uint16' : 'uint8', shape, offset, bytes: data.byteLength }
      offset += data.byteLength
      return section
    }),
  }
  const buffer = new ArrayBuffer(offset)
  const bytes = new Uint8Array(buffer)
  bytes.set(new TextEncoder().encode('LGF1'))
  new DataView(buffer).setUint32(4, 4088, true)
  sections.forEach(([, data], index) => bytes.set(new Uint8Array(data.buffer), header.sections[index].offset))
  change(header, bytes)
  bytes.fill(32, 8, 4096)
  bytes.set(new TextEncoder().encode(JSON.stringify(header)), 8)
  return buffer
}

function mockWorker(t, implementation) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { value: implementation, configurable: true, writable: true })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Worker', original)
    else delete globalThis.Worker
  })
}

function exportedFixtureText() {
  const frame = adaptFrame(decodeFrame(fixture()))
  const pointAttributes = Object.fromEntries(Object.entries(frame.pointAttributes).map(([key, values]) => [key, values ? Array.from(values) : null]))
  return JSON.stringify({ ...frame, pointAttributes, schema: 'point-matrix-v1', points: Array.from(frame.points) })
}

test('LGF adapter preserves units, labels, observed heights and recorded timings', () => {
  const frame = adaptFrame(decodeFrame(fixture()), {}, 'lite')
  assert.equal(frame.grid[0].x_min, 4)
  assert.equal(frame.grid[0].y_min, -0.8)
  assert.equal(frame.grid[0].z_min, 0)
  assert.ok(Math.abs(frame.grid[0].elevation - 0.02) < 1e-9)
  assert.equal(frame.grid[0].semantic_class, 8)
  assert.equal(frame.grid[1].semantic_class, -1)
  assert.equal(frame.grid[1].traversability, -1)
  assert.deepEqual(Array.from(frame.points.slice(0, 4)), [1, 2, 0, 0])
  assert.equal(frame.meta.point_retention_pct, 75)
  assert.equal(frame.meta.processing_ms, 48)
  assert.deepEqual(frame.meta.resolution_distribution, { 0.4: 1, 0.05: 1 })
})

test('gzip frames decode with the provided browser decoder', async () => {
  const compressed = gzipSync(new Uint8Array(fixture()))
  const decoded = decodeFrame(await gunzipIfNeeded(compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)))
  assert.equal(decoded.cells.count, 2)
  assert.equal(decoded.points.xyzCm[2], -173)
})

test('truncated and corrupt LGF metadata is rejected before typed-array access', () => {
  assert.throws(() => decodeFrame(new ArrayBuffer(3)), /size/)
  assert.throws(() => decodeFrame(fixture().slice(0, 32)), /header/)
  assert.throws(() => decodeFrame(fixture((h) => { h.sections[0].offset = 0 })), /section/)
  assert.throws(() => decodeFrame(fixture((h) => { h.sections.pop() })), /missing section/)
  assert.throws(() => decodeFrame(fixture((h) => { h.sections[0].shape = [1, 3] })), /section/)
  assert.throws(() => decodeFrame(fixture((h) => { h.n_cells = 30 })), /counts/)
})

test('invalid semantic IDs and resolution levels are rejected', () => {
  for (const [name, value] of [['cells.class', 20], ['cells.level', 4]]) {
    assert.throws(() => decodeFrame(fixture((h, b) => { b[h.sections.find((s) => s.name === name).offset] = value })), /class or cell level/)
  }
})

test('manifest loading uses hosted lite/full URLs, coalesces requests and caches detail separately', async (t) => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url))
    if (String(url).endsWith('manifest.json')) return Response.json({
      format: 'LGF1-clip', fps: 10,
      frames: [{ id: '001500', lite: 'lite/001500.lgf.gz', full: 'full/001500.lgf.gz' }],
    })
    return new Response(fixture())
  })
  const clip = await loadFrames('https://example.test/clip/manifest.json')
  const [a, b] = await Promise.all([clip.loadFrame('001500'), clip.loadFrame('001500')])
  assert.equal(a, b)
  assert.equal(await clip.loadFrame('001500'), a)
  assert.notEqual(await clip.loadFrame('001500', 'full'), a)
  assert.deepEqual(urls, [
    'https://example.test/clip/manifest.json',
    'https://example.test/clip/lite/001500.lgf.gz',
    'https://example.test/clip/full/001500.lgf.gz',
  ])
  await assert.rejects(clip.loadFrame('missing'), /Unknown frame/)
})

test('a failed frame request can be retried', async (t) => {
  let attempts = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('manifest.json')) return Response.json({ format: 'LGF1-clip', frames: [{ id: '001500', lite: 'lite/001500.lgf.gz' }] })
    return ++attempts === 1 ? new Response('', { status: 503 }) : new Response(fixture())
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  await assert.rejects(clip.loadFrame('001500'), /503/)
  assert.equal((await clip.loadFrame('001500')).meta.frame_id, '001500')
})

test('prefetch prepares upcoming frames at the selected quality and reuses them', async (t) => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(String(url))
    if (String(url).endsWith('manifest.json')) return Response.json({
      format: 'LGF1-clip', frames: [
        { id: '001500', lite: 'lite/001500.lgf.gz', full: 'full/001500.lgf.gz' },
        { id: '001501', lite: 'lite/001501.lgf.gz', full: 'full/001501.lgf.gz' },
      ],
    })
    return new Response(fixture((header) => { header.frame_id = '001501' }))
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  await clip.prefetch(0, 'full')
  const frame = await clip.loadFrame('001501', 'full')
  assert.equal(frame.meta.quality, 'full')
  assert.ok(frame.renderData.positions instanceof Float32Array)
  assert.equal(await clip.loadFrame('001501', 'full'), frame)
  assert.deepEqual(urls, ['https://example.test/manifest.json', 'https://example.test/full/001501.lgf.gz'])
})

test('Point Matrix clip manifests load JSON frame files and alias quality requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('manifest.json')) return Response.json({
      format: 'point-matrix-v1-clip',
      fps: 12,
      frames: [{ id: '001500', file: 'frames/001500.json' }],
    })
    return new Response(exportedFixtureText())
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  const lite = await clip.loadFrame('001500', 'lite')
  const full = await clip.loadFrame('001500', 'full')
  assert.equal(clip.fps, 12)
  assert.equal(lite.meta.frame_id, '001500')
  assert.equal(lite.meta.quality, 'lite')
  assert.equal(full.meta.quality, 'full')
  assert.deepEqual(lite.grid, full.grid)
})

test('legacy split manifests load local frame archives', async (t) => {
  const grid = new Float32Array([
    4, 4.4, -0.8, -0.4, 0.4, 0.02, 8, 1, 1, 1, 4,
    0.15, 0.2, 0.2, 0.25, 0.05, 0.03, -1, 0.5, 1, -1, 2,
  ])
  const points = new Float32Array([1, 2, 0, 0, 3, 4, 1.75, 8])
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url)
    if (value.endsWith('manifest.json')) return Response.json({
      fps: 5,
      frames: ['001500'],
      grid_format: 'binary',
      grid_fields: ['x_min', 'x_max', 'y_min', 'y_max', 'resolution', 'elevation', 'semantic_class', 'semantic_confidence', 'occupancy', 'traversability', 'point_count'],
    })
    if (value.endsWith('meta/001500_meta.json')) return Response.json({ frame_id: '001500', total_input_points: 8, exported_points: 2, total_cells: 2 })
    if (value.endsWith('points/001500_points.bin')) return new Response(points.buffer.slice(0))
    if (value.endsWith('grid/001500_grid.bin')) return new Response(grid.buffer.slice(0))
    throw new Error(`Unexpected URL ${value}`)
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  const frame = await clip.loadFrame('001500', 'lite')
  assert.equal(clip.fps, 5)
  assert.equal(frame.meta.frame_id, '001500')
  assert.equal(frame.meta.quality, 'lite')
  assert.equal(frame.meta.source, 'Local frame archive')
  assert.equal(frame.grid[0].semantic_class, 8)
  assert.equal(frame.grid[1].semantic_class, -1)
  assert.ok(frame.renderData.positions instanceof Float32Array)
})

test('legacy split manifests default local archive playback to 10 FPS', async (t) => {
  const grid = new Float32Array([4, 4.4, -0.8, -0.4, 0.4, 0.02, 8, 1, 1, 1, 4])
  const points = new Float32Array([1, 2, 0, 0])
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url)
    if (value.endsWith('manifest.json')) return Response.json({
      frames: ['001500'],
      grid_format: 'binary',
      grid_fields: ['x_min', 'x_max', 'y_min', 'y_max', 'resolution', 'elevation', 'semantic_class', 'semantic_confidence', 'occupancy', 'traversability', 'point_count'],
    })
    if (value.endsWith('meta/001500_meta.json')) return Response.json({ frame_id: '001500', total_input_points: 4, exported_points: 1, total_cells: 1 })
    if (value.endsWith('points/001500_points.bin')) return new Response(points.buffer.slice(0))
    if (value.endsWith('grid/001500_grid.bin')) return new Response(grid.buffer.slice(0))
    throw new Error(`Unexpected URL ${value}`)
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  assert.equal(clip.fps, 10)
})

test('failed background preparation is retryable when the frame is requested', async (t) => {
  let attempts = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('manifest.json')) return Response.json({
      format: 'LGF1-clip', frames: [{ id: '001500', lite: '0' }, { id: '001501', lite: '1' }],
    })
    return new Response(++attempts === 1 ? 'corrupt frame' : fixture((header) => { header.frame_id = '001501' }))
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  await clip.prefetch(0)
  assert.equal((await clip.loadFrame('001501')).meta.frame_id, '001501')
  assert.equal(attempts, 2)
})

test('rolling prefetch loads a bounded window and serves consecutive frames without redownloading', async (t) => {
  const frameIds = Array.from({ length: 10 }, (_, index) => String(1500 + index).padStart(6, '0'))
  const requested = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('manifest.json')) return Response.json({
      format: 'LGF1-clip', frames: frameIds.map((id) => ({ id, lite: `${id}.lgf.gz` })),
    })
    const id = String(url).match(/(\d+)\.lgf/)[1]
    requested.push(id)
    return new Response(fixture((header) => { header.frame_id = id }))
  })
  const clip = await loadFrames('https://example.test/manifest.json')
  await clip.loadFrame(frameIds[0])
  await clip.prefetch(0)
  assert.deepEqual(requested, frameIds.slice(0, 5))
  const displayed = [frameIds[0]]
  for (let index = 1; index <= 5; index += 1) {
    displayed.push((await clip.loadFrame(frameIds[index])).meta.frame_id)
    await clip.prefetch(index)
  }
  assert.deepEqual(displayed, frameIds.slice(0, 6))
  assert.deepEqual(requested, frameIds)
})

test('prepared geometry preserves displayed point positions, colors, and map transforms', async () => {
  const frame = await decodePreparedFrame(fixture(), { id: '001500' }, 'lite')
  const render = frame.renderData
  assert.deepEqual(Array.from(render.positions.slice(0, 3)), [1, 0, -2])
  assert.deepEqual(render.semanticColors.slice(0, 3), new Float32Array(new Color(colorForClass(0)).toArray()))
  assert.deepEqual(render.rawColors.slice(0, 3), new Float32Array(new Color().setHSL(150 / 360, 0.9, 0.56, 'srgb').toArray()))
  render.semanticParts.forEach((part, index) => {
    assert.ok(frame.grid.includes(part.cell))
    const object = new Object3D()
    object.position.fromArray(part.position)
    object.scale.fromArray(part.scale)
    object.updateMatrix()
    assert.deepEqual(render.semanticMatrices.slice(index * 16, index * 16 + 16), new Float32Array(object.matrix.elements))
  })
})

test('worker transfers prepared frames, rejects corrupt input, and remains usable', { timeout: 10000 }, async (t) => {
  const threads = []
  class BrowserWorker {
    constructor(url) {
      this.thread = new NodeWorker(`
        const { parentPort, workerData } = require('node:worker_threads');
        globalThis.self = { postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
        import(workerData).then(() => parentPort.on('message', data => self.onmessage({ data })));
      `, { eval: true, workerData: url.href })
      threads.push(this.thread)
      this.thread.on('message', (data) => this.onmessage?.({ data }))
      this.thread.on('error', (error) => this.onerror?.(error))
    }
    postMessage(data, transfer) { this.thread.postMessage(data, transfer) }
    terminate() { this.thread.terminate() }
  }
  mockWorker(t, BrowserWorker)
  t.after(() => Promise.all(threads.map((thread) => thread.terminate())))
  const { decodeInBackground } = await import('./frameDecoder.js?worker-test')
  const bytes = fixture()
  const [frame, other] = await Promise.all([
    decodeInBackground(bytes, { id: '001500' }, 'lite'),
    decodeInBackground(bytes, { id: '001500' }, 'full'),
  ])
  assert.equal(frame.meta.quality, 'lite')
  assert.equal(other.meta.quality, 'full')
  assert.ok(bytes.byteLength > 0, 'Cached compressed data must not be detached')
  assert.deepEqual(frame, await decodePreparedFrame(fixture(), { id: '001500' }, 'lite'))
  assert.ok(frame.grid.includes(frame.renderData.semanticParts[0].cell))
  await assert.rejects(decodeInBackground(new ArrayBuffer(0), { id: '001500' }, 'lite'), /LGF1/)
  await assert.rejects(decodeInBackground(bytes, { id: 'different' }, 'lite'), /mismatch/)
  assert.equal((await decodeInBackground(bytes, { id: '001500' }, 'lite')).meta.frame_id, '001500')
})

test('worker startup failure falls back to local preparation', async (t) => {
  mockWorker(t, class { constructor() { throw new Error('Worker unavailable') } })
  const { decodeInBackground } = await import('./frameDecoder.js?fallback-test')
  const frame = await decodeInBackground(fixture(), { id: '001500' }, 'lite')
  assert.equal(frame.meta.frame_id, '001500')
  assert.ok(frame.renderData.positions instanceof Float32Array)
})

test('worker runtime failure settles all pending frames and keeps playback usable', { timeout: 1000 }, async (t) => {
  let starts = 0
  mockWorker(t, class {
    constructor() { starts += 1 }
    postMessage() { queueMicrotask(() => this.onerror?.(new Error('Worker stopped'))) }
    terminate() {}
  })
  const { decodeInBackground } = await import('./frameDecoder.js?runtime-fallback-test')
  const [a, b] = await Promise.all([
    decodeInBackground(fixture(), { id: '001500' }, 'lite'),
    decodeInBackground(fixture(), { id: '001500' }, 'full'),
  ])
  assert.equal(a.meta.quality, 'lite')
  assert.equal(b.meta.quality, 'full')
  assert.equal((await decodeInBackground(fixture(), { id: '001500' }, 'lite')).meta.frame_id, '001500')
  assert.equal(starts, 1)
})

test('JSON output round trips without changing source classes or cell measurements', () => {
  const frame = adaptFrame(decodeFrame(fixture()))
  const text = exportedFixtureText()
  const imported = parseExport(text)
  assert.deepEqual(imported.grid, frame.grid)
  assert.deepEqual(imported.points, frame.points)
  assert.throws(() => parseExport('{"points":[]}'), /JSON export/)
  const bad = JSON.parse(text)
  bad.meta.device = { unexpected: 'object' }
  assert.throws(() => parseExport(JSON.stringify(bad)), /metadata/)
})
