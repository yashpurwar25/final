import { DEFAULT_DRIVABILITY, DRIVABILITY_COLORS, DRIVABILITY_LABELS, gridDrivabilityArea } from '../drivability'

export function DrivabilityLegend() {
  return <div className="drivability-legend">{Object.entries(DRIVABILITY_LABELS).map(([state, label]) =>
    <span key={state}><i style={{ background: DRIVABILITY_COLORS[state] }} />{label}</span>)}</div>
}

export default function DrivabilityControls({ cells, options, onChange, unavailable }) {
  const area = gridDrivabilityArea(cells, options)
  const update = (key, value) => onChange((previous) => {
    const next = { ...previous, [key]: value }
    if (key === 'roughCaution') next.roughBlocked = Math.max(value, next.roughBlocked)
    if (key === 'roughBlocked') next.roughCaution = Math.min(value, next.roughCaution)
    return next
  })
  return <div className="drivability-controls">
    <div className="drivability-summary">
      <p>Legend</p>
      <DrivabilityLegend />
    </div>
    <label>Vehicle profile<select aria-label="Vehicle profile" value={options.profile} disabled={unavailable} onChange={(event) => update('profile', event.target.value)}><option value="on-road">On-road</option><option value="off-road">Off-road</option></select></label>
    {[['roughCaution', 'Caution complexity'], ['roughBlocked', 'Blocked complexity'], ['minConfidence', 'Minimum confidence']].map(([key, label]) =>
      <label key={key}><span>{label} <output>{Math.round(options[key] * 100)}%</output></span><input type="range" aria-label={label} min="0" max="1" step="0.01" value={options[key]} disabled={unavailable} onChange={(event) => update(key, Number(event.target.value))} /></label>)}
    <button disabled={unavailable} onClick={() => onChange({ ...DEFAULT_DRIVABILITY })}>Reset drivability</button>
    {!unavailable && <dl className="drivability-area">{Object.entries(area).map(([state, value]) => <div key={state}><dt><i style={{ background: DRIVABILITY_COLORS[state] }} />{DRIVABILITY_LABELS[state]}</dt><dd>{value.toFixed(1)} m²</dd></div>)}</dl>}
    <p>{unavailable ? 'Drivability requires semantic output.' : 'Areas cover all measured cells, including hidden classes. Gaps have no LiDAR data and remain unknown; their area is not counted.'}</p>
  </div>
}
