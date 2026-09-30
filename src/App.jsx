import { useEffect, useRef, useState } from 'react'
import GridView from './components/GridView'
import PointCloud from './components/PointCloud'
import SpatialMap from './components/SpatialMap'
import UploadScan from './components/UploadScan'
import ClipDetails from './components/ClipDetails'
import { loadFrames } from './data'
import { colorForClass, nameForClass } from './palette'
import { getService } from './uploadService'
import DrivabilityControls, { DrivabilityLegend } from './components/DrivabilityControls'
import { DEFAULT_DRIVABILITY } from './drivability'
import { nextPlaybackIndex, scheduleNextFrame } from './playback'

const number = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString('en', { maximumFractionDigits: 1 })
const millis = (value) => value == null ? 'Not recorded' : `${number(value)} ms`
const EMPTY = new Set()
const PLAYBACK_SPEEDS = [1, 2, 4, 6]
const PLAYBACK_MODES = { continuous: 'Continuous', sequential: 'Sequential' }
const layers = { semantic: 'Semantic classes', elevation: 'Elevation', drivability: 'Drivability', resolution: 'Cell resolution', density: 'Point density' }

function Panel({ index, title, detail, className = '', tools, children }) {
  const [expanded, setExpanded] = useState(false)
  const expandButton = useRef(null)
  useEffect(() => {
    if (!expanded) return undefined
    const close = (event) => { if (event.key === 'Escape') { setExpanded(false); expandButton.current?.focus() } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [expanded])
  return <section className={`panel ${className} ${expanded ? 'panel-expanded' : ''}`}>
    <header className="panel-heading"><h2><span>{String(index).padStart(2, '0')}</span>{title}</h2><div className="panel-actions">{detail && <small>{detail}</small>}<button ref={expandButton} className="expand-panel" aria-label={`${expanded ? 'Restore' : 'Expand'} ${title}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d={expanded ? 'M6 1v5H1m14 4h-5v5M10 6l5-5M6 10l-5 5' : 'M1 6V1h5m4 14h5v-5M1 1l5 5m4 4 5 5'} stroke="currentColor" strokeWidth="1.3" /></svg></button></div></header>
    {tools && <div className="panel-tools">{tools}</div>}
    <div className="panel-content">{children}</div>
  </section>
}

function ViewToggle({ value, onChange }) {
  return <div className="segmented-control"><button aria-pressed={!value} className={!value ? 'selected' : ''} onClick={() => onChange(false)}>Perspective</button><button aria-pressed={value} className={value ? 'selected' : ''} onClick={() => onChange(true)}>Top-down</button></div>
}

function Metrics({ frame, frameIndex, total, uploaded }) {
  const meta = frame.meta
  const groups = [
    ['INPUT / LIDAR', [['Points in scan', number(meta.total_input_points)], ['Displayed points', number(meta.exported_points)], ['Source', meta.source ?? 'Uploaded scan'], ['Frame', `${frameIndex + 1} / ${total}`]]],
    ['SEMANTIC MODEL', [['Model', meta.mode?.startsWith('SalsaNext') ? 'SalsaNext' : meta.semantic_available ? 'Supplied labels' : 'Not connected'], ['Inference', millis(meta.inference_ms)], ['Classes present', new Set(frame.grid.filter((c) => c.semantic_class >= 0).map((c) => c.semantic_class)).size]]],
    ['ADAPTIVE GRID ENGINE', [['Processing', millis(meta.grid_ms)], ['Final cells', number(meta.total_cells)], ['Points per cell', frame.grid.length ? number(frame.grid.reduce((n, c) => n + c.point_count, 0) / frame.grid.length) : '0'], ['Point retention', meta.point_retention_pct == null ? 'Not recorded' : `${number(meta.point_retention_pct)}%`]]],
    ['PIPELINE', [['Total processing', millis(meta.processing_ms)], ['Status', uploaded ? 'Processed' : 'Archive playback'], ['Unlabeled dropped', meta.unlabeled_dropped == null ? 'Not recorded' : number(meta.unlabeled_dropped)]]],
  ]
  return <div className="metrics-groups">{groups.map(([title, values]) => <div className="metrics-group" key={title}><h3>{title}</h3><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>)}</div>
}

function Distribution({ distribution }) {
  const entries = Object.entries(distribution ?? {}).sort(([a], [b]) => Number(a) - Number(b))
  const total = entries.reduce((n, [, count]) => n + count, 0)
  const colors = ['#b4e8ff', '#51c9fa', '#1593e6', '#2060bc', '#394e87']
  let sum = 0
  const stops = entries.map(([, count], index) => { const from = sum; sum += count / Math.max(total, 1) * 100; return `${colors[index % colors.length]} ${from}% ${sum}%` })
  return <div className="distribution"><div className="donut" style={{ background: stops.length ? `conic-gradient(${stops.join(',')})` : '#243744' }}><div><strong>{number(total)}</strong><span>cells</span></div></div>
    <ul>{entries.map(([resolution, count], index) => <li key={resolution}><i style={{ background: colors[index % colors.length] }} /><span>{number(Number(resolution) * 100)} cm</span><strong>{(count / Math.max(total, 1) * 100).toFixed(1)}%</strong></li>)}</ul>
  </div>
}

function PlaybackBar({
  className = '',
  uploaded,
  dataset,
  frameIndex,
  total,
  displayedIndex,
  playing,
  setPlaying,
  setFrameIndex,
  speed,
  setSpeed,
  quality,
  setQuality,
  playbackMode,
  setPlaybackMode,
  actualFps,
  changeSpeed,
  exportMap,
}) {
  return <footer className={`playback-bar ${className}`.trim()}>
    <strong>FRAME PLAYBACK</strong>
    <div className="playback-buttons">
      <button disabled={!!uploaded || !dataset || frameIndex === 0} aria-label="Previous frame" onClick={() => { setPlaying(false); setFrameIndex((i) => Math.max(0, i - 1)) }}>▏◀</button>
      <button className="play-button" disabled={!!uploaded || !dataset} aria-label={playing ? 'Pause playback' : 'Play frames'} onClick={() => setPlaying((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
      <button disabled={!!uploaded || !dataset || frameIndex >= total - 1} aria-label="Next frame" onClick={() => { setPlaying(false); setFrameIndex((i) => Math.min(total - 1, i + 1)) }}>▶▕</button>
    </div>
    <input aria-label="Frame timeline" type="range" min="0" max={Math.max(0, total - 1)} value={uploaded ? 0 : frameIndex} disabled={!!uploaded || !dataset} onChange={(e) => { setPlaying(false); setFrameIndex(Number(e.target.value)) }} />
    <span className="frame-counter">{displayedIndex + 1} <span>/ {number(total)}</span></span>
    <div className="playback-speed" role="group" aria-label="Playback speed controls">
      <label htmlFor={`playback-speed-${className || 'default'}`}>Speed</label>
      <button aria-label="Decrease playback speed" title="Slower playback" disabled={!!uploaded || !dataset || speed === PLAYBACK_SPEEDS[0]} onClick={() => changeSpeed(-1)}>-</button>
      <select id={`playback-speed-${className || 'default'}`} aria-label="Playback speed" value={speed} disabled={!!uploaded || !dataset} onChange={(event) => setSpeed(Number(event.target.value))}>{PLAYBACK_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select>
      <button aria-label="Increase playback speed" title="Faster playback" disabled={!!uploaded || !dataset || speed === PLAYBACK_SPEEDS.at(-1)} onClick={() => changeSpeed(1)}>+</button>
    </div>
    <label className="playback-select" htmlFor={`playback-mode-${className || 'default'}`}>
      <span>Mode</span>
      <select id={`playback-mode-${className || 'default'}`} aria-label="Playback mode" value={playbackMode} disabled={!!uploaded || !dataset} onChange={(event) => setPlaybackMode(event.target.value)}>
        {Object.entries(PLAYBACK_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <span className="playback-mode" title={playbackMode === 'continuous' ? 'Continuous mode keeps the clip on time and may skip ahead after stalls.' : 'Sequential mode shows every frame in order and will wait after stalls instead of skipping ahead.'}>{playbackMode === 'continuous' ? 'Time-locked playback' : 'Every frame in order'}{playing && actualFps > 0 ? ` / ${number(actualFps)} FPS` : ''}</span>
    <select aria-label="Frame detail" value={quality} disabled={!!uploaded} onChange={(event) => setQuality(event.target.value)}><option value="auto">Auto detail</option><option value="lite">Lite frames</option><option value="full">Full frames</option></select>
    <button className="export-button" onClick={exportMap}>↓ Export map</button>
  </footer>
}

export default function App() {
  const [dataset, setDataset] = useState(null)
  const [frame, setFrame] = useState(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [uploaded, setUploaded] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [playbackMode, setPlaybackMode] = useState('continuous')
  const [quality, setQuality] = useState('auto')
  const [error, setError] = useState('')
  const [buffering, setBuffering] = useState(true)
  const [actualFps, setActualFps] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [service, setService] = useState(null)
  const [hiddenClasses, setHiddenClasses] = useState(() => new Set())
  const [rawTop, setRawTop] = useState(false)
  const [semanticTop, setSemanticTop] = useState(false)
  const [mapTop, setMapTop] = useState(false)
  const [layer, setLayer] = useState('semantic')
  const [drivabilityOptions, setDrivabilityOptions] = useState({ ...DEFAULT_DRIVABILITY })
  const [elevation, setElevation] = useState(true)
  const [boundaries, setBoundaries] = useState(true)
  const [objects, setObjects] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const uploadButton = useRef()
  const playbackClock = useRef(0)
  const playbackStats = useRef({ at: 0, count: 0 })
  const frameQuality = quality === 'auto' ? (playing ? 'lite' : 'full') : quality
  const changeSpeed = (direction) => setSpeed((previous) => {
    const index = PLAYBACK_SPEEDS.indexOf(previous)
    return PLAYBACK_SPEEDS[Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, index + direction))]
  })

  useEffect(() => {
    let active = true
    loadFrames().then((data) => { if (active) setDataset(data) }).catch((e) => { if (active) { setError(e.message); setBuffering(false) } })
    getService().then((data) => { if (active) setService(data) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (uploaded || !dataset) return
    let active = true
    setError('')
    dataset.prefetch(frameIndex, quality === 'auto' ? 'lite' : quality, Math.ceil(dataset.fps * (playing ? speed : 1) * 2))
    const cached = dataset.getFrame(dataset.frameIds[frameIndex], frameQuality)
    if (cached) {
      setFrame(cached)
      setBuffering(false)
      return
    }
    setBuffering(true)
    dataset.loadFrame(dataset.frameIds[frameIndex], frameQuality).then((next) => {
      if (active) { setFrame(next); setBuffering(false) }
    }).catch((e) => { if (active) { setError(e.message); setBuffering(false); setPlaying(false) } })
    return () => { active = false }
  }, [dataset, frameIndex, uploaded, frameQuality, quality, playing, speed])

  useEffect(() => {
    playbackClock.current = performance.now()
    playbackStats.current = { at: performance.now(), count: 0 }
    setActualFps(0)
  }, [playing, speed, dataset, uploaded, frameQuality, playbackMode])

  useEffect(() => {
    if (!playing || !dataset || uploaded || buffering || dataset.frameIds.length <= 1) return
    if (frame?.meta.frame_id !== dataset.frameIds[frameIndex] || frame?.meta.quality !== frameQuality) return
    return scheduleNextFrame((now, steps = 1) => {
      const interval = 1000 / (dataset.fps * speed)
      playbackClock.current = playbackMode === 'continuous'
        ? Math.max(playbackClock.current + interval * steps, now)
        : Math.max(playbackClock.current + interval, now - interval)
      const nextIndex = nextPlaybackIndex(frameIndex, dataset.frameIds.length, steps)
      const cached = dataset.getFrame(dataset.frameIds[nextIndex], frameQuality)
      if (cached) setFrame(cached)
      setFrameIndex(nextIndex)
      const stats = playbackStats.current
      stats.count += steps
      if (now - stats.at >= 1000) {
        setActualFps(stats.count * 1000 / (now - stats.at))
        playbackStats.current = { at: now, count: 0 }
      }
    }, { fps: dataset.fps, speed, startedAt: playbackClock.current, mode: playbackMode })
  }, [playing, speed, playbackMode, dataset, uploaded, buffering, frameIndex, frame, frameQuality])

  const current = uploaded ?? frame
  const total = uploaded ? 1 : dataset?.frameIds.length ?? 0
  const classes = current ? [...new Set(current.grid.map((cell) => cell.semantic_class))].sort((a, b) => a - b) : []
  const unavailable = current?.meta.semantic_available === false
  const displayedIndex = current && !uploaded ? Math.max(0, dataset?.frameIds.indexOf(current.meta.frame_id) ?? 0) : 0
  const toggleClass = (id) => setHiddenClasses((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const closeUpload = () => { setShowUpload(false); requestAnimationFrame(() => uploadButton.current?.focus()) }
  const exportMap = () => {
    const pointAttributes = current.pointAttributes ? Object.fromEntries(Object.entries(current.pointAttributes).map(([key, value]) => [key, value ? Array.from(value) : null])) : undefined
    const blob = new Blob([JSON.stringify({ grid: current.grid, meta: current.meta, pointAttributes, points: Array.from(current.points), schema: 'point-matrix-v1', class_id_convention: 'zero-based: -1 unlabeled, 0 car, 18 traffic-sign', ground_truth_convention: 'SalsaNext: 0 unlabeled, 1 car, 19 traffic-sign' })], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `point-matrix-${current.meta.frame_id}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <main className="app-shell">
    <header className="topbar">
      <a href="/" className="brand" aria-label="Point Matrix home"><svg viewBox="0 0 40 40" fill="none"><path d="m20 4 16 9-16 9L4 13 20 4Zm-16 16 16 9 16-9M4 27l16 9 16-9M12 13l8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.7" /></svg><strong>POINT<span>MATRIX</span></strong></a>
      <div className="title-block">Adaptive 2.5D semantic mapping<span>PERCEPTION / SPATIAL INTELLIGENCE</span></div>
      <div className="header-status"><i />{uploaded ? 'SCAN WORKSPACE' : 'HUGGING FACE CLIP'}</div>
      <button ref={uploadButton} className="primary-button" onClick={() => { setPlaying(false); setShowUpload(true) }}><span>↑</span> Upload scan</button>
    </header>
    <div className="workspace-bar"><div><span className="live-dot" />{uploaded ? uploaded.meta.filename : 'RANBYDIPZ / SIH-LIDAR-CLIP'}<span className="workspace-badge">{uploaded ? uploaded.meta.mode : `${current?.meta.quality?.toUpperCase() ?? 'LGF1'} / HUGGING FACE`}</span></div><span>{current ? `FRAME ${current.meta.frame_id}` : 'CONNECTING TO DATASET'}<span className="bar-divider">/</span>{current?.meta.coordinate_frame ?? 'LOCAL COORDINATES'}</span></div>
    {current && <PlaybackBar
      className="playback-bar-top"
      uploaded={uploaded}
      dataset={dataset}
      frameIndex={frameIndex}
      total={total}
      displayedIndex={displayedIndex}
      playing={playing}
      setPlaying={setPlaying}
      setFrameIndex={setFrameIndex}
      speed={speed}
      setSpeed={setSpeed}
      playbackMode={playbackMode}
      setPlaybackMode={setPlaybackMode}
      quality={quality}
      setQuality={setQuality}
      actualFps={actualFps}
      changeSpeed={changeSpeed}
      exportMap={exportMap}
    />}
    {uploaded && <div className={`notice ${unavailable ? 'warning' : ''}`}><span>{unavailable ? 'Geometry preview only. Connect a CUDA GPU and SalsaNext checkpoint for semantic segmentation and drivability.' : `Loaded ${uploaded.meta.source ?? 'processed scan'} output.`}</span><button onClick={() => { setUploaded(null); setHiddenClasses(new Set()); setLayer('semantic'); setResetKey((n) => n + 1); setError('') }}>Return to clip ↗</button></div>}
    {error && <div role="alert" className="notice warning">{error}<button onClick={() => window.location.reload()}>Retry</button></div>}
    {!current ? <div className="empty-workspace"><div className="radar" /><p className="eyebrow">POINT MATRIX / WORKSPACE</p><h1>{error ? 'Bring your own perspective.' : 'Loading the spatial model.'}</h1><p>{error ? 'The sample archive could not load. You can still upload a scan.' : 'Preparing synchronized point clouds and adaptive grid layers.'}</p><button className="primary-button" onClick={() => setShowUpload(true)}>Upload a scan</button></div> : <>
      <div className={`dashboard-grid ${buffering && !uploaded ? 'is-buffering' : ''}`}>
        <Panel index={1} title="Raw LiDAR point cloud" detail={`${number(current.meta.exported_points)} shown`} className="raw-panel" tools={<><ViewToggle value={rawTop} onChange={setRawTop} /><span>COLOR / HEIGHT (Z)</span></>}>
          <PointCloud points={current.points} renderData={current.renderData} hiddenClasses={EMPTY} raw topDown={rawTop} playing={playing} resetKey={resetKey} groundZ={current.meta.sensor_height_m != null ? 0.2 : -2.85} />
          <div className="cloud-label">{uploaded ? 'UPLOADED XYZ' : current.meta.quality === 'full' ? 'FULL POINT CLOUD' : `PLAYBACK / 1 IN ${current.meta.point_stride} POINTS`}</div><div className="height-scale"><span>+5 m</span><i /><span>−3 m</span></div>
        </Panel>
        <Panel index={2} title="Semantic segmentation" detail={unavailable ? 'Unavailable' : `${classes.filter((id) => id >= 0).length} classes`} className="semantic-panel" tools={<><ViewToggle value={semanticTop} onChange={setSemanticTop} /><span>COLOR / SEMANTIC CLASS</span></>}>
          {unavailable ? <div className="unavailable"><span>MODEL NOT CONNECTED</span><strong>Semantic output will appear here.</strong><p>Your geometry maps are ready. SalsaNext needs a CUDA GPU and pretrained weights.</p></div> : <PointCloud points={current.points} renderData={current.renderData} hiddenClasses={hiddenClasses} topDown={semanticTop} playing={playing} resetKey={resetKey} groundZ={current.meta.sensor_height_m != null ? 0.2 : -2.85} />}
        </Panel>
        <Panel index={3} title="Adaptive 2.5D map" detail={`${number(current.meta.total_cells)} cells`} className="main-map-panel" tools={<><ViewToggle value={mapTop} onChange={setMapTop} /><label className="map-layer-select"><span>Layer</span><select aria-label="Map layer" value={layer} onChange={(e) => setLayer(e.target.value)}>{Object.entries(layers).map(([id, label]) => <option key={id} value={id} disabled={unavailable && ['semantic', 'drivability'].includes(id)}>{label}</option>)}</select></label><button className="reset-button" onClick={() => setResetKey((n) => n + 1)}>↺ Reset</button></>}>
          <SpatialMap cells={current.grid} renderData={current.renderData} hiddenClasses={layer === 'drivability' ? EMPTY : hiddenClasses} layer={layer} boundaries={boundaries} elevation={elevation} topDown={mapTop} resetKey={resetKey} objects={objects} drivabilityOptions={drivabilityOptions} playing={playing} />
          {layer === 'drivability' && <div className="map-drivability-legend"><DrivabilityLegend /></div>}
          {!unavailable && layer !== 'drivability' && <div className="map-legend"><h3>Semantic classes <span>{classes.length}</span></h3>{classes.map((id) => <button key={id} className={hiddenClasses.has(id) ? 'muted' : ''} aria-pressed={!hiddenClasses.has(id)} onClick={() => toggleClass(id)}><i style={{ background: colorForClass(id) }} />{nameForClass(id)}</button>)}</div>}
          {buffering && !uploaded && <span className="buffer-indicator">Loading frame {dataset?.frameIds[frameIndex]}…</span>}
        </Panel>
        <aside className="sidebar">
          <Panel index={4} title="System metrics"><Metrics frame={current} frameIndex={displayedIndex} total={total} uploaded={uploaded} /></Panel>
          <Panel index={5} title="Layer controls" className="controls-panel"><div className="layer-controls">
            <label><input type="checkbox" checked={elevation} onChange={(e) => setElevation(e.target.checked)} />Extrude elevation (2.5D)</label>
            <label><input type="checkbox" checked={objects} disabled={!elevation || layer !== 'semantic'} onChange={(e) => setObjects(e.target.checked)} />Semantic blocks and vehicles</label>
            <label><input type="checkbox" checked={boundaries} onChange={(e) => setBoundaries(e.target.checked)} />Show cell boundaries</label>
            <p>Map color</p>{Object.entries(layers).map(([id, label]) => <label key={id}><input type="radio" name="layer" checked={layer === id} disabled={unavailable && ['semantic', 'drivability'].includes(id)} onChange={() => setLayer(id)} />{label}</label>)}
          </div><DrivabilityControls cells={current.grid} options={drivabilityOptions} onChange={setDrivabilityOptions} unavailable={unavailable} /></Panel>
          <Panel index={9} title="Resolution distribution"><Distribution distribution={current.meta.resolution_distribution} /></Panel>
        </aside>
        <div className="diagnostic-row">
          {[['elevation', 'Elevation map', 'HEIGHT / METRES'], ['drivability', 'Drivability map', ''], ['resolution', 'Adaptive resolution', 'SMALL → LARGE CELLS']].map(([id, title, hint], index) => <Panel key={id} index={index + 6} title={title} className={`diagnostic ${id}`}>
            {unavailable && id === 'drivability' ? <div className="unavailable compact"><strong>Awaiting semantic model</strong><p>Drivability is unavailable for raw geometry.</p></div> : <GridView cells={current.grid} renderData={current.renderData} hiddenClasses={id === 'drivability' ? EMPTY : hiddenClasses} layer={id} boundaries drivabilityOptions={drivabilityOptions} playing={playing} />}
            <div className="mini-legend">{id === 'drivability' ? <DrivabilityLegend /> : <><i /><span>{id === 'elevation' ? '-3 m / HEIGHT / +5 m' : hint}</span></>}</div>
          </Panel>)}
        </div>
      </div>
      <ClipDetails frame={current} dataset={dataset} uploaded={uploaded} onSeek={(index) => { setPlaying(false); setFrameIndex(index) }} />
      <div className="bottom-note"><span>POINT MATRIX <i /> SPATIAL PERCEPTION WORKSPACE</span><span>{uploaded ? 'Processed scan' : `${dataset?.fps ?? 10} FPS source / ${number((dataset?.fps ?? 10) * speed)} FPS requested / ${playbackMode} playback`} / 5, 10, 20, 40 cm grid</span></div>
    </>}
    {showUpload && <UploadScan service={service} onClose={closeUpload} onResult={(result) => { setUploaded(result); setPlaying(false); setHiddenClasses(new Set()); setLayer(result.meta.semantic_available ? 'semantic' : 'elevation'); setResetKey((n) => n + 1); setError(''); closeUpload() }} />}
  </main>
}
