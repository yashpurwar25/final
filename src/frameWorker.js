import { decodePreparedFrame, decodePreparedJsonFrame } from './frameDecode.js'

self.onmessage = async ({ data: { requestId, bytes, text, entry, quality } }) => {
  try {
    const frame = text == null
      ? await decodePreparedFrame(bytes, entry, quality)
      : await decodePreparedJsonFrame(text, entry)
    const buffers = new Set([frame.points.buffer])
    for (const value of Object.values(frame.renderData)) {
      if (ArrayBuffer.isView(value)) buffers.add(value.buffer)
    }
    for (const value of Object.values(frame.pointAttributes ?? {})) {
      if (value) buffers.add(value.buffer)
    }
    self.postMessage({ requestId, frame }, [...buffers])
  } catch (error) {
    self.postMessage({ requestId, error: error.message })
  }
}
