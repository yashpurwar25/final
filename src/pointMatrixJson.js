export function normalizePointMatrixFrame(frame) {
  if (frame.schema !== 'point-matrix-v1' || !Array.isArray(frame.points) ||
      frame.points.length % 4 || frame.points.length > 4_000_000 ||
      !Array.isArray(frame.grid) || frame.grid.length > 1_000_000 || !frame.meta ||
      !frame.points.every(Number.isFinite)) throw new Error('Expected a Point Matrix JSON export.')
  if (typeof frame.meta.frame_id !== 'string') throw new Error('JSON export has no frame ID.')
  for (const key of ['filename', 'source', 'mode', 'device', 'quality', 'coordinate_frame', 'source_format']) {
    if (frame.meta[key] != null && typeof frame.meta[key] !== 'string') throw new Error(`Invalid JSON metadata: ${key}`)
  }
  for (const key of ['timing_ms', 'accuracy', 'stats']) {
    const values = frame.meta[key]
    if (values != null && (typeof values !== 'object' || Array.isArray(values) ||
        !Object.values(values).every((value) => value == null || Number.isFinite(value))))
      throw new Error(`Invalid JSON metadata: ${key}`)
  }
  for (const cell of frame.grid) {
    if (!['x_min', 'x_max', 'y_min', 'y_max', 'resolution', 'elevation', 'semantic_class', 'semantic_confidence', 'traversability', 'point_count'].every((key) => Number.isFinite(cell[key])) ||
        cell.x_min >= cell.x_max || cell.y_min >= cell.y_max || cell.resolution <= 0 ||
        !Number.isInteger(cell.semantic_class) || cell.semantic_class < -1 || cell.semantic_class > 18)
      throw new Error('JSON export contains an invalid grid cell.')
    if (cell.z_min != null && (!['z_min', 'z_max', 'z_std', 'complexity'].every((key) => Number.isFinite(cell[key])) ||
        cell.z_min > cell.z_max || cell.z_std < 0))
      throw new Error('JSON export contains invalid cell height data.')
  }
  for (let index = 3; index < frame.points.length; index += 4) {
    if (!Number.isInteger(frame.points[index]) || frame.points[index] < -1 || frame.points[index] > 18)
      throw new Error('JSON export contains an invalid point class.')
  }
  const distribution = {}
  frame.grid.forEach((cell) => { distribution[cell.resolution] = (distribution[cell.resolution] ?? 0) + 1 })
  const pointAttributes = frame.pointAttributes
  if (pointAttributes != null) {
    for (const key of ['intensity', 'confidence', 'groundTruth']) {
      const values = pointAttributes[key]
      const max = key === 'groundTruth' ? 19 : 255
      if (values != null && (!Array.isArray(values) || values.length !== frame.points.length / 4 ||
          !values.every((value) => Number.isInteger(value) && value >= 0 && value <= max)))
        throw new Error(`JSON export contains invalid ${key} values.`)
    }
  }
  return {
    ...frame,
    points: new Float32Array(frame.points),
    meta: {
      ...frame.meta,
      total_cells: frame.grid.length,
      exported_points: frame.points.length / 4,
      resolution_distribution: distribution,
    },
  }
}

export function parsePointMatrixJson(text) {
  return normalizePointMatrixFrame(JSON.parse(text))
}
