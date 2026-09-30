import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

export default function Stats({ meta }) {
  const chartData = Object.entries(meta.resolution_distribution).map(([resolution, count]) => ({
    resolution: `${resolution}m`,
    count,
  }))
  return (
    <section className="stats-strip">
      <Metric label="Source returns" value={compact.format(meta.total_input_points)} detail="classified LiDAR points" />
      <Metric label="Rendered" value={compact.format(meta.exported_points)} detail="Viewport Render Limit" />
      <Metric label="Adaptive cells" value={compact.format(meta.total_cells)} detail="occupied leaf nodes" />
      <div className="chart-block">
        <div className="chart-heading"><span>Cell resolution</span><small>distribution by leaf count</small></div>
        <ResponsiveContainer width="100%" height={82}>
          <BarChart data={chartData} margin={{ top: 17, right: 0, bottom: 0, left: -23 }}>
            <CartesianGrid vertical={false} stroke="#58736b" strokeOpacity={0.18} />
            <XAxis dataKey="resolution" tick={{ fill: '#78908a', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact.format} tick={{ fill: '#57706a', fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#ffffff08' }} contentStyle={{ background: '#0b1715', border: '1px solid #28423c', borderRadius: 4, fontSize: 11 }} formatter={(value) => [value.toLocaleString(), 'Cells']} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {chartData.map((item, index) => <Cell key={item.resolution} fill={index === 0 ? '#49dcb1' : index === 1 ? '#60b9b0' : index === 2 ? '#48827c' : '#31534e'} />)}
              <LabelList dataKey="count" position="top" formatter={compact.format} fill="#819b94" fontSize={9} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
