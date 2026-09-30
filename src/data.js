import { decodeInBackground, parseJsonInBackground } from './frameDecoder.js'
import { MANIFEST_URL } from './config.js'

const DEFAULT_FPS = 2
const LOCAL_ARCHIVE_FPS = 10
const GRID_FIELDS = [
  'x_min',
  'x_max',
  'y_min',
  'y_max',
  'resolution',
  'elevation',
  'semantic_class',
  'semantic_confidence',
  'occupancy',
  'traversability',
  'point_count',
]

function baseUrl(url) {
  return new URL('.', new URL(url, globalThis.location?.href ?? url)).href
}

async function loadClipManifest(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`manifest: ${response.status} ${response.statusText} for ${url}`)
  return { ...(await response.json()), baseUrl: baseUrl(url) }
}

function resolveUrl(manifest, path) {
  return new URL(path, manifest.baseUrl).href
}

function cacheValue(map, key, value, limit) {
  map.set(key, value)
  while (map.size > limit) map.delete(map.keys().next().value)
  return value
}

function cloneQuality(frame, quality) {
  if (frame.meta.quality === quality) return frame
  return { ...frame, meta: { ...frame.meta, quality } }
}

function createSingleQualityDataset({ manifest, frameIds, prepareBaseFrame, fps }) {
  const indexes = new Map(frameIds.map((id, index) => [id, index]))
  if (indexes.size !== frameIds.length) throw new Error('Manifest contains duplicate frame IDs.')
  const loaded = new Map()
  const prepared = new Map()
  const pending = new Map()
  const downloads = new Map()
  let downloadQueue = []
  const pumpDownloads = () => {
    while (downloadQueue.length && downloads.size < 6) {
      const id = downloadQueue.shift()
      if (!prepared.has(id) && !downloads.has(id)) ensureBaseFrame(id).catch(() => {})
    }
  }
  const ensureBaseFrame = (id) => {
    if (prepared.has(id)) return Promise.resolve(prepared.get(id))
    if (downloads.has(id)) return downloads.get(id)
    const request = prepareBaseFrame(id)
      .then((frame) => cacheValue(prepared, id, frame, 8))
      .finally(() => { downloads.delete(id); pumpDownloads() })
    downloads.set(id, request)
    return request
  }
  const loadFrame = (id, quality = 'full') => {
    if (!['lite', 'full'].includes(quality)) return Promise.reject(new Error('Unknown frame quality'))
    if (!indexes.has(id)) return Promise.reject(new Error(`Unknown frame ${id}`))
    const key = `${id}:${quality}`
    if (loaded.has(key)) {
      const frame = loaded.get(key)
      loaded.delete(key)
      loaded.set(key, frame)
      return Promise.resolve(frame)
    }
    if (pending.has(key)) return pending.get(key)
    const request = ensureBaseFrame(id)
      .then((frame) => cacheValue(loaded, key, cloneQuality(frame, quality), 8))
      .finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
  return {
    manifest,
    frameIds,
    fps,
    loadFrame,
    getFrame: (id, quality = 'full') => loaded.get(`${id}:${quality}`),
    prefetch(index, quality = 'full', lookAhead = 4) {
      const requests = []
      for (let offset = 1; offset <= 4 && offset < frameIds.length; offset += 1) {
        const id = frameIds[(index + offset) % frameIds.length]
        const key = `${id}:${quality}`
        if (!loaded.has(key) && (pending.has(key) || pending.size < 5)) {
          requests.push(loadFrame(id, quality).catch(() => {}))
        }
      }
      downloadQueue = []
      for (let offset = 1; offset <= Math.min(120, lookAhead) && offset < frameIds.length; offset += 1) {
        downloadQueue.push(frameIds[(index + offset) % frameIds.length])
      }
      pumpDownloads()
      return Promise.all(requests)
    },
  }
}

function decodeGridMatrix(buffer, fields) {
  const matrix = new Float32Array(buffer)
  if (matrix.length % fields.length) throw new Error('Grid binary size does not match manifest fields.')
  const grid = new Array(matrix.length / fields.length)
  for (let row = 0; row < grid.length; row += 1) {
    const record = {}
    for (let column = 0; column < fields.length; column += 1) {
      const value = matrix[row * fields.length + column]
      const field = fields[column]
      record[field] = field === 'semantic_class' ? Math.round(value) : value
    }
    grid[row] = record
  }
  return grid
}

async function loadLegacySplitFrame(manifest, id) {
  const [metaResponse, pointsResponse, gridResponse] = await Promise.all([
    fetch(resolveUrl(manifest, `meta/${id}_meta.json`), { signal: AbortSignal.timeout(60000) }),
    fetch(resolveUrl(manifest, `points/${id}_points.bin`), { signal: AbortSignal.timeout(60000) }),
    fetch(resolveUrl(manifest, `grid/${id}_grid.${manifest.grid_format === 'json' ? 'json' : 'bin'}`), { signal: AbortSignal.timeout(60000) }),
  ])
  if (!metaResponse.ok) throw new Error(`meta: ${metaResponse.status} ${metaResponse.statusText}`)
  if (!pointsResponse.ok) throw new Error(`points: ${pointsResponse.status} ${pointsResponse.statusText}`)
  if (!gridResponse.ok) throw new Error(`grid: ${gridResponse.status} ${gridResponse.statusText}`)
  const [meta, pointsBuffer, grid] = await Promise.all([
    metaResponse.json(),
    pointsResponse.arrayBuffer(),
    manifest.grid_format === 'json' ? gridResponse.json() : gridResponse.arrayBuffer().then((buffer) => decodeGridMatrix(buffer, manifest.grid_fields ?? GRID_FIELDS)),
  ])
  const points = Array.from(new Float32Array(pointsBuffer))
  const semanticAvailable = grid.some((cell) => Number.isInteger(cell.semantic_class) && cell.semantic_class >= 0)
  return parseJsonInBackground(JSON.stringify({
    schema: 'point-matrix-v1',
    grid,
    points,
    meta: {
      ...meta,
      frame_id: meta.frame_id ?? id,
      filename: meta.filename ?? id,
      source: meta.source ?? 'Local frame archive',
      source_format: meta.source_format ?? `Point Matrix split ${manifest.grid_format === 'json' ? 'JSON' : 'binary'} clip`,
      coordinate_frame: meta.coordinate_frame ?? 'sensor XY / ground-relative Z',
      quality: 'full',
      mode: meta.mode ?? 'Precomputed adaptive grid',
      semantic_available: meta.semantic_available ?? semanticAvailable,
    },
  }), { id })
}

function framePath(frame) {
  return frame.file ?? frame.path ?? frame.url
}

function createLgfDataset(manifest) {
  if (!manifest.frames?.length) throw new Error('Expected an LGF1 clip manifest with frame entries.')
  const indexes = new Map(manifest.frames.map((frame, index) => [frame.id, index]))
  if (indexes.size !== manifest.frames.length) throw new Error('Manifest contains duplicate frame IDs.')
  const loaded = new Map()
  const pending = new Map()
  const compressed = new Map()
  const downloads = new Map()
  let compressedBytes = 0
  let downloadQueue = []
  const pumpDownloads = () => {
    while (downloadQueue.length && downloads.size < 6) {
      const [id, quality] = downloadQueue.shift()
      const key = `${id}:${quality}`
      if (!compressed.has(key) && !loaded.has(key) && !downloads.has(key)) {
        downloadFrame(id, quality).catch(() => {})
      }
    }
  }
  const downloadFrame = (id, quality) => {
    const key = `${id}:${quality}`
    if (compressed.has(key)) return Promise.resolve(compressed.get(key))
    if (downloads.has(key)) return downloads.get(key)
    const index = indexes.get(id)
    const path = quality === 'lite' ? manifest.frames[index].lite : manifest.frames[index].full
    const request = fetch(resolveUrl(manifest, path), { signal: AbortSignal.timeout(60000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`LGF1: ${response.status} ${response.statusText}`)
        const bytes = await response.arrayBuffer()
        compressed.set(key, bytes)
        compressedBytes += bytes.byteLength
        while (compressed.size > 120 || compressedBytes > 64 * 1024 * 1024) {
          const oldest = compressed.keys().next().value
          compressedBytes -= compressed.get(oldest).byteLength
          compressed.delete(oldest)
        }
        return bytes
      }).finally(() => { downloads.delete(key); pumpDownloads() })
    downloads.set(key, request)
    return request
  }
  const loadFrame = (id, quality = 'lite') => {
    const index = indexes.get(id)
    if (index == null) return Promise.reject(new Error(`Unknown frame ${id}`))
    if (!['lite', 'full'].includes(quality)) return Promise.reject(new Error('Unknown frame quality'))
    const key = `${id}:${quality}`
    if (loaded.has(key)) {
      const frame = loaded.get(key)
      loaded.delete(key)
      loaded.set(key, frame)
      return Promise.resolve(frame)
    }
    if (pending.has(key)) return pending.get(key)
    const request = downloadFrame(id, quality)
      .then((bytes) => decodeInBackground(bytes, manifest.frames[index], quality))
      .then((frame) => cacheValue(loaded, key, frame, 8))
      .catch((error) => {
        compressedBytes -= compressed.get(key)?.byteLength ?? 0
        compressed.delete(key)
        throw error
      }).finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
  return {
    manifest,
    frameIds: manifest.frames.map((frame) => frame.id),
    fps: Number.isFinite(manifest.fps) && manifest.fps > 0 ? manifest.fps : DEFAULT_FPS,
    loadFrame,
    getFrame: (id, quality = 'lite') => loaded.get(`${id}:${quality}`),
    prefetch(index, quality = 'lite', lookAhead = 4) {
      const requests = []
      for (let offset = 1; offset <= 4 && offset < manifest.frames.length; offset += 1) {
        const id = manifest.frames[(index + offset) % manifest.frames.length].id
        const key = `${id}:${quality}`
        if (!loaded.has(key) && (pending.has(key) || pending.size < 5)) {
          requests.push(loadFrame(id, quality).catch(() => {}))
        }
      }
      downloadQueue = []
      for (let offset = 1; offset <= Math.min(120, lookAhead) && offset < manifest.frames.length; offset += 1) {
        downloadQueue.push([manifest.frames[(index + offset) % manifest.frames.length].id, quality])
      }
      pumpDownloads()
      return Promise.all(requests)
    },
  }
}

export async function loadFrames(url = MANIFEST_URL) {
  const manifest = await loadClipManifest(url)
  if (manifest.format === 'LGF1-clip') return createLgfDataset(manifest)
  if (manifest.format === 'point-matrix-v1-clip') {
    if (!manifest.frames?.length) throw new Error('Expected a Point Matrix clip manifest with frame entries.')
    const frameIds = manifest.frames.map((frame) => frame.id)
    return createSingleQualityDataset({
      manifest,
      frameIds,
      fps: Number.isFinite(manifest.fps) && manifest.fps > 0 ? manifest.fps : DEFAULT_FPS,
      prepareBaseFrame: async (id) => {
        const entry = manifest.frames.find((frame) => frame.id === id)
        const path = framePath(entry)
        if (!path) throw new Error(`Point Matrix clip entry ${id} is missing a file path.`)
        const response = await fetch(resolveUrl(manifest, path), { signal: AbortSignal.timeout(60000) })
        if (!response.ok) throw new Error(`frame: ${response.status} ${response.statusText}`)
        return parseJsonInBackground(await response.text(), entry)
      },
    })
  }
  if (Array.isArray(manifest.frames) && manifest.frames.every((frame) => typeof frame === 'string')) {
    return createSingleQualityDataset({
      manifest,
      frameIds: manifest.frames,
      fps: Number.isFinite(manifest.fps) && manifest.fps > 0 ? manifest.fps : LOCAL_ARCHIVE_FPS,
      prepareBaseFrame: (id) => loadLegacySplitFrame(manifest, id),
    })
  }
  throw new Error('Expected an LGF1 or Point Matrix clip manifest.')
}
