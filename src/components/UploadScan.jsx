import { useEffect, useRef, useState } from 'react'
import { processUpload, validateUploadFile } from '../uploadService'

const stages = ['queued', 'initializing', 'segmenting', 'gridding', 'exporting', 'complete']

export default function UploadScan({ onResult, onClose, service }) {
  const [file, setFile] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef()
  const close = useRef()
  const controller = useRef()
  useEffect(() => {
    close.current?.focus()
    return () => controller.current?.abort()
  }, [])

  const choose = (next) => {
    if (!next) return
    setError('')
    setFile(null)
    setJob(null)
    try {
      validateUploadFile(next, service)
      setFile(next)
    } catch (failure) { setError(failure.message) }
  }
  const submit = async () => {
    setBusy(true)
    setError('')
    controller.current = new AbortController()
    const { signal } = controller.current
    try {
      const result = await processUpload(file, { service, signal, onProgress: setJob })
      if (!signal.aborted) onResult(result)
    } catch (failure) {
      if (failure.name !== 'AbortError') setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop" onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key === 'Tab') {
        const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter((el) => !el.hidden)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}>
      <section className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <button ref={close} className="dialog-close" onClick={onClose} disabled={busy} aria-label="Close upload">×</button>
        <p className="eyebrow">SCAN WORKSPACE</p>
        <h2 id="upload-title">Upload a BIN scan.</h2>
        <p>Send your KITTI .bin scan for segmentation and adaptive mapping, then inspect its drivability.</p>
        <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) choose(event.dataTransfer.files[0]) }}>
          <svg viewBox="0 0 40 40" fill="none"><path d="M20 27V7m-7 7 7-7 7 7M8 25v8h24v-8" stroke="currentColor" strokeWidth="1.5" /></svg>
          <strong>{file?.name ?? 'Drop your .bin scan here'}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MiB` : 'KITTI BIN / X, Y, Z, INTENSITY'}</span>
          <button disabled={busy} onClick={() => input.current.click()}>{file ? 'Choose another file' : 'Browse files'}</button>
          <input ref={input} hidden type="file" accept=".bin,.lgf,.lgf.gz,.json" onChange={(event) => { choose(event.target.files[0]); event.target.value = '' }} />
        </div>
        <p className="format-note">BIN format: little-endian float32 X, Y, Z (metres) and intensity, 16 bytes per point, up to 16 MiB{service?.kind === 'fastapi' ? ' and 250,000 points' : ''}. You can also reopen processed LGF1 or Point Matrix JSON results up to 64 MiB locally.</p>
        <div className={`service-note ${service?.processing_available ? 'ready' : ''}`}>
          <strong>{service?.mode ?? 'Service unavailable'}</strong>
          <span>{service?.message ?? 'Start the processing backend to upload scans.'}</span>
        </div>
        {job && <div className="job-progress" aria-live="polite">
          <div><strong>{job.status}</strong><span>{job.message}</span></div>
          <progress max={stages.length} value={Math.max(1, stages.indexOf(job.status) + 1)} />
        </div>}
        {error && <p role="alert" className="error-message">{error}</p>}
        <footer><span>Export your processed map to keep a copy.</span><button className="primary-button" disabled={!file || busy} onClick={submit}>{busy ? 'Processing…' : /\.bin$/i.test(file?.name ?? '') ? 'Process BIN scan →' : 'Open result →'}</button></footer>
      </section>
    </div>
  )
}
