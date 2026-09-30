import assert from 'node:assert/strict'
import test from 'node:test'
import { processUpload, validateUploadFile } from './uploadService.js'

const service = { kind: 'fastapi', processing_available: true }
const options = () => ({ service, signal: new AbortController().signal, onProgress() {} })
const scan = (values = [1, 2, 3, 0.5]) => {
  const bytes = new ArrayBuffer(values.length * 4)
  const view = new DataView(bytes)
  values.forEach((value, index) => view.setFloat32(index * 4, value, true))
  return new File([bytes], 'scan.bin')
}

test('raw uploads require BIN rows and enforce service and file limits', () => {
  assert.doesNotThrow(() => validateUploadFile(scan(), service))
  assert.throws(() => validateUploadFile({ name: 'scan.npy', size: 16 }, service), /KITTI/)
  assert.throws(() => validateUploadFile({ name: 'scan.bin', size: 0 }, service), /nonempty/)
  assert.throws(() => validateUploadFile({ name: 'scan.bin', size: 17 }, service), /16 bytes/)
  assert.throws(() => validateUploadFile({ name: 'scan.bin', size: 16 * 1024 * 1024 + 16 }, service), /16 MiB/)
  assert.throws(() => validateUploadFile({ name: 'scan.bin', size: 250_001 * 16 }, service), /250,000/)
  assert.throws(() => validateUploadFile(scan(), { processing_available: false }), /not connected/)
  assert.doesNotThrow(() => validateUploadFile({ name: 'result.lgf.gz', size: 64 }, null))
})

test('nonfinite BIN data is rejected before any network request', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Invalid input must not reach the backend') })
  await assert.rejects(processUpload(scan([1, NaN, 3, 0.5]), options()), /nonfinite/)
  await assert.rejects(processUpload(scan([1, Infinity, 3, 0.5]), options()), /nonfinite/)
})

test('valid BIN is uploaded unchanged and the processed result is loaded', async (t) => {
  const file = scan()
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url)
    if (url === '/api/jobs') {
      assert.equal(init.method, 'POST')
      assert.deepEqual(await init.body.get('file').arrayBuffer(), await file.arrayBuffer())
      return Response.json({ id: 'test-job', status: 'complete' })
    }
    return Response.json({ points: [1, 2, 3, 8], grid: [], meta: { frame_id: 'scan', semantic_available: true } })
  })
  const frame = await processUpload(file, options())
  assert.deepEqual(calls, ['/api/jobs', '/api/jobs/test-job/result'])
  assert.ok(frame.points instanceof Float32Array)
  assert.equal(frame.meta.frame_id, 'scan')
})
