const percent = (value) => value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`
const ms = (value) => value == null ? 'Not recorded' : `${value.toFixed(2)} ms`

export default function ClipDetails({ frame, dataset, uploaded, onSeek }) {
  const timing = frame.meta.timing_ms ?? {}
  const summary = dataset?.manifest.summary ?? {}
  const rows = [
    ['Transfer', timing.upload], ['Projection', timing.salsa_project],
    ['SalsaNext model', timing.salsa_model], ['Postprocess', timing.salsa_post],
    ['GPU grid', timing.grid_gpu], ['Grid readback', timing.grid_to_cpu],
    ['Segmentation', timing.segmentation_ms], ['GPU wait', timing.gpu_wait_ms],
    ['CPU grid', timing.grid_engine_cpu_ms],
  ].filter(([, value]) => Number.isFinite(value))
  return <section className="clip-details" aria-label="Recorded clip details">
    <div className="clip-summary"><span className="eyebrow">{uploaded ? 'UPLOADED FRAME' : `SEMANTICKITTI / SEQUENCE ${dataset?.manifest.sequence ?? '--'}`}</span>
      <strong>{frame.meta.device || 'Device not recorded'}</strong>
      <p>{uploaded ? 'Processing measurements returned by the backend.' : `${dataset?.frameIds.length ?? 0} frames / ${dataset?.fps ?? 2} FPS source / ${summary.fp16 ? 'FP16' : 'FP32'}${summary.knn ? ' / KNN' : ''}`}</p>
      {!uploaded && <p>Clip mean accuracy {percent(summary.mean_accuracy)} / median total {ms(summary.median_end_to_end_ms)}</p>}
    </div>
    <div className="timing-breakdown"><h3>Recorded frame timings</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{ms(value)}</dd></div>)}</dl>{!rows.length && <p>No detailed timings available.</p>}</div>
    <div className="accuracy-summary"><h3>Ground-truth comparison</h3><dl>{[['Accuracy', frame.meta.accuracy?.accuracy], ['Car IoU', frame.meta.accuracy?.car_iou], ['Person IoU', frame.meta.accuracy?.person_iou]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{percent(value)}</dd></div>)}</dl>
      {!uploaded && <label>Jump to a highlight<select aria-label="Clip bookmark" value="" onChange={(event) => { if (event.target.value) onSeek(Number(event.target.value) - 1) }}><option value="">Choose recorded frame</option>{dataset?.manifest.bookmarks?.map((bookmark) => <option key={bookmark.label} value={bookmark.index + 1}>{bookmark.label} / {bookmark.frame}</option>)}</select></label>}
    </div>
  </section>
}
