import { decodeFrame, gunzipIfNeeded } from '../../dashbard_timesxript_drivability/decodeFrame.ts'
import { adaptFrame } from './frameAdapter.js'
import { prepareFrame } from './framePreparation.js'
import { parsePointMatrixJson } from './pointMatrixJson.js'

export async function decodePreparedFrame(bytes, entry, quality) {
  const decoded = decodeFrame(await gunzipIfNeeded(bytes))
  if (decoded.header.frame_id !== entry.id) throw new Error(`Frame ID mismatch for ${entry.id}`)
  return prepareFrame(adaptFrame(decoded, entry, quality))
}

export async function decodePreparedJsonFrame(text, entry = {}) {
  const frame = prepareFrame(parsePointMatrixJson(text))
  if (entry.id != null && frame.meta.frame_id !== entry.id) throw new Error(`Frame ID mismatch for ${entry.id}`)
  return frame
}
