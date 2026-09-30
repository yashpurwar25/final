const BENCHMARKS = [
  {
    index: '01',
    title: 'Data compression',
    value: '99.54%',
    label: 'cell reduction',
    detail: 'vs. uniform grid',
    secondary: '21,267',
    secondaryLabel: 'avg. cells / frame',
    progress: 99.54,
  },
  {
    index: '02',
    title: 'Processing speed',
    value: '94ms',
    label: 'engine latency / frame',
    detail: 'batch average',
    secondary: '11.2',
    secondaryLabel: 'FPS',
    progress: 65.78,
  },
  {
    index: '03',
    title: 'Information retention',
    value: '99.804%',
    label: 'average retention',
    detail: '123,011,936 raw points processed',
    secondary: '123M',
    secondaryLabel: 'source returns',
    progress: 99.804,
  },
  {
    index: '04',
    title: 'Resolution mix',
    value: '26.0%',
    label: '50cm terrain cells',
    detail: 'low-resolution map area',
    secondary: '0.0%',
    secondaryLabel: '6cm cells',
    progress: 26,
  },
]

export default function Benchmarks() {
  return (
    <section className="benchmark-section">
      <header className="benchmark-header">
        <div>
          <p className="eyebrow">GLOBAL BATCH METRICS</p>
          <h2>System benchmark</h2>
        </div>
        <div className="benchmark-scope"><i /> VERIFIED SCOPE <strong>1,000 FRAMES</strong></div>
      </header>
      <div className="benchmark-grid">
        {BENCHMARKS.map((benchmark) => (
          <article className="benchmark-card" key={benchmark.title}>
            <div className="benchmark-card-heading"><span>{benchmark.index}</span><h3>{benchmark.title}</h3></div>
            <div className="benchmark-values">
              <div><strong>{benchmark.value}</strong><span>{benchmark.label}</span></div>
              <div className="benchmark-secondary"><strong>{benchmark.secondary}</strong><span>{benchmark.secondaryLabel}</span></div>
            </div>
            <div className="benchmark-track"><i style={{ width: `${benchmark.progress}%` }} /></div>
            <small>{benchmark.detail}</small>
          </article>
        ))}
      </div>
      <p className="benchmark-note">SOURCE · GLOBAL BATCH METRICS REPORT · VALUES SHOWN AS REPORTED</p>
    </section>
  )
}
