import { decodePreparedFrame } from './frameDecode.js'
import { decodePreparedJsonFrame } from './frameDecode.js'

let worker
let unavailable = false
let nextRequestId = 0
const pending = new Map()

function stopWorker() {
  unavailable = true
  worker?.terminate()
  worker = undefined
  for (const request of pending.values()) request.fallback()
  pending.clear()
}

export function decodeInBackground(bytes, entry, quality) {
  if (typeof Worker === 'undefined' || unavailable) return decodePreparedFrame(bytes, entry, quality)
  return runInBackground({ bytes, entry, quality }, () => decodePreparedFrame(bytes, entry, quality))
}

export function parseJsonInBackground(text, entry) {
  if (typeof Worker === 'undefined' || unavailable) return decodePreparedJsonFrame(text, entry)
  return runInBackground({ text, entry }, () => decodePreparedJsonFrame(text, entry))
}

function runInBackground(payload, fallback) {
  if (!worker) {
    try {
      worker = new Worker(new URL('./frameWorker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.requestId)
        if (!request) return
        pending.delete(data.requestId)
        if (data.error) request.reject(new Error(data.error))
        else request.resolve(data.frame)
      }
      worker.onerror = stopWorker
      worker.onmessageerror = stopWorker
    } catch {
      unavailable = true
      return fallback()
    }
  }
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId++
    pending.set(requestId, {
      resolve, reject,
      fallback: () => fallback().then(resolve, reject),
    })
    try {
      if (payload.bytes != null) {
        // Keep cached compressed bytes intact while transferring the worker's copy.
        const copy = payload.bytes.slice(0)
        worker.postMessage({ requestId, bytes: copy, entry: payload.entry, quality: payload.quality }, [copy])
      } else {
        worker.postMessage({ requestId, text: payload.text, entry: payload.entry })
      }
    } catch {
      stopWorker()
    }
  })
}

if (import.meta.hot) import.meta.hot.dispose(stopWorker)
