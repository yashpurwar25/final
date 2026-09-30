import { API_BASE, HF_SPACE, LOCAL_API, apiUrl } from './config.js'
import { decodeFrame, gunzipIfNeeded, loadFrame } from '../../dashbard_timesxript_drivability/decodeFrame.ts'
import { adaptFrame } from './frameAdapter.js'
import { parsePointMatrixJson } from './pointMatrixJson.js'

async function readResponse(response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Processing service is unavailable.')
  return body
}

async function probeHealth() {
  const health = await readResponse(await fetch(apiUrl('/api/health'), {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  }))
  return { ...health, kind: 'fastapi', processing_available: health.processing_available !== false }
}

export async function getService() {
  if (API_BASE || LOCAL_API || typeof window !== 'undefined') {
    try {
      return await probeHealth()
    } catch { /* Try the configured Space or dataset-only fallback below. */ }
  }
  if (HF_SPACE) return { kind: 'gradio', space: HF_SPACE, processing_available: true, mode: 'SalsaNext + adaptive grid', message: `${HF_SPACE} / KITTI BIN uploads; GPU processing starts when you submit.` }
  return { kind: 'files', processing_available: false, mode: 'BIN processing not connected', message: 'Configure a Hugging Face Space to process KITTI .bin scans. Existing LGF1 or JSON results can still be opened.' }
}

export function validateUploadFile(file, service) {
  if (!file) throw new Error('Choose a KITTI .bin scan.')
  const processed = /\.json$|\.lgf(\.gz)?$/i.test(file.name)
  if (!processed && !/\.bin$/i.test(file.name)) throw new Error('Choose a KITTI .bin scan, or reopen an LGF1 / Point Matrix JSON result.')
  const limit = processed ? 64 : 16
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > limit * 1024 * 1024)
    throw new Error(`Choose a nonempty file up to ${limit} MiB.`)
  if (!processed) {
    if (file.size % 16) throw new Error('KITTI .bin scans must contain float32 X, Y, Z, intensity rows (16 bytes per point).')
    if (service?.kind === 'fastapi' && file.size / 16 > 250_000) throw new Error('This processing backend supports up to 250,000 points per scan.')
    if (!service?.processing_available) throw new Error('BIN processing is not connected. Configure a Hugging Face Space to process your scan.')
  }
}

export async function validateBinContents(file) {
  const bytes = await file.arrayBuffer()
  const view = new DataView(bytes)
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    if (!Number.isFinite(view.getFloat32(offset, true)))
      throw new Error('The BIN scan contains nonfinite values. Expected float32 X, Y, Z, intensity rows.')
  }
}

export function parseExport(text) {
  return parsePointMatrixJson(text)
}

export async function processUpload(file, { service, signal, onProgress }) {
  validateUploadFile(file, service)
  signal.throwIfAborted()
  if (/\.json$/i.test(file.name)) {
    onProgress({ status: 'exporting', message: 'Reading processed JSON output' })
    const frame = parseExport(await file.text())
    signal.throwIfAborted()
    return frame
  }
  if (/\.lgf(\.gz)?$/i.test(file.name)) {
    onProgress({ status: 'exporting', message: 'Decoding LGF1 output' })
    const decoded = decodeFrame(await gunzipIfNeeded(await file.arrayBuffer()))
    signal.throwIfAborted()
    return adaptFrame(decoded)
  }
  await validateBinContents(file)
  signal.throwIfAborted()
  if (!service?.processing_available) throw new Error('Raw scans need a configured processing backend. The hosted dataset manifest supports playback only.')
  if (service.kind === 'gradio') {
    if (!/\.bin$/i.test(file.name)) throw new Error('The Hugging Face /infer endpoint accepts KITTI .bin scans.')
    onProgress({ status: 'initializing', message: 'Connecting to Hugging Face; a sleeping Space may take a moment.' })
    const { Client, handle_file } = await import('@gradio/client')
    const client = await Client.connect(service.space || HF_SPACE, { events: ['status', 'data'] })
    if (signal.aborted) client.close()
    signal.throwIfAborted()
    const job = client.submit('/infer', { scan_file: handle_file(file) })
    const cancel = () => { job.cancel().catch(() => {}) }
    signal.addEventListener('abort', cancel, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; cancel() }, 15 * 60 * 1000)
    try {
      let output = null
      for await (const event of job) {
        signal.throwIfAborted()
        if (event.type === 'status') {
          if (event.stage === 'error') throw new Error(event.message || 'The Space could not process this scan.')
          onProgress({ status: event.stage === 'pending' ? 'queued' : 'segmenting', message: event.message || 'Running segmentation and adaptive grid on Hugging Face' })
        }
        if (event.type === 'data') output = event.data
      }
      if (timedOut) throw new Error('The Space exceeded 15 minutes. Try again after checking its status.')
      if (!output?.[0]?.url) throw new Error('The Space did not return an LGF1 file URL.')
      onProgress({ status: 'exporting', message: 'Downloading processed frame' })
      const frame = adaptFrame(await loadFrame(output[0].url, { signal }))
      frame.meta.filename = file.name
      frame.meta.space_summary = output[1] ?? null
      return frame
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
      client.close()
    }
  }
  const form = new FormData()
  form.append('file', file)
  let job = await readResponse(await fetch(apiUrl('/api/jobs'), { method: 'POST', body: form, signal }))
  const deadline = Date.now() + 15 * 60 * 1000
  while (job.status !== 'complete') {
    signal.throwIfAborted()
    onProgress(job)
    if (job.status === 'failed') throw new Error(job.message)
    if (Date.now() > deadline) throw new Error('Processing exceeded 15 minutes.')
    await new Promise((resolve) => setTimeout(resolve, 800))
    job = await readResponse(await fetch(apiUrl(`/api/jobs/${job.id}`), { signal }))
  }
  const frame = await readResponse(await fetch(apiUrl(`/api/jobs/${job.id}/result`), { signal }))
  return { ...frame, points: new Float32Array(frame.points), jobId: job.id }
}
