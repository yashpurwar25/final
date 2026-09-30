import { cellInfo } from '../../dashbard_timesxript_drivability/decodeFrame.ts'

// LGF uses 0 = unlabeled, 1 = car. The existing renderers use -1 and 0.
export function adaptFrame(frame, entry = {}, quality = 'full') {
  const { header, cells, points } = frame
  const height = header.sensor_height_m
  const grid = new Array(cells.count)
  const distribution = {}
  for (let i = 0; i < cells.count; i += 1) {
    const c = cellInfo(frame, i)
    grid[i] = {
      x_min: c.xMin, x_max: c.xMax, y_min: c.yMin, y_max: c.yMax,
      resolution: c.size, elevation: c.zMean + height,
      z_min: c.zMin + height, z_max: c.zMax + height, z_std: c.zStd,
      semantic_class: c.cls - 1, semantic_confidence: c.confidence,
      traversability: c.cls === 0 ? -1 : c.traversability,
      complexity: c.complexity, point_count: c.pointCount, occupancy: 1,
    }
    distribution[c.size] = (distribution[c.size] ?? 0) + 1
  }
  const interleaved = new Float32Array(points.count * 4)
  for (let i = 0; i < points.count; i += 1) {
    interleaved[i * 4] = points.xyzCm[i * 3] / 100
    interleaved[i * 4 + 1] = points.xyzCm[i * 3 + 1] / 100
    interleaved[i * 4 + 2] = points.xyzCm[i * 3 + 2] / 100 + height
    interleaved[i * 4 + 3] = points.cls[i] - 1
  }
  const timing = header.timing_ms ?? entry.timing_ms ?? {}
  const stats = header.stats ?? entry.stats ?? {}
  const live = header.source === 'live'
  return {
    grid, points: interleaved,
    pointAttributes: { intensity: points.intensity, confidence: points.confidence, groundTruth: points.gtClass },
    meta: {
      frame_id: header.frame_id, filename: header.frame_id, sequence: header.sequence,
      source: live ? 'Hugging Face Space' : 'Hugging Face dataset',
      source_format: 'LGF1', quality, sensor_height_m: height,
      coordinate_frame: 'sensor XY / ground-relative Z',
      total_input_points: header.n_points_total, exported_points: points.count,
      total_cells: cells.count, resolution_distribution: distribution,
      inference_ms: timing.salsanext_total ?? timing.segmentation_ms,
      grid_ms: timing.grid_engine_total ?? timing.grid_engine_cpu_ms,
      processing_ms: timing.end_to_end ?? null,
      point_retention_pct: stats.n_points_in > 0 ? stats.n_points_used / stats.n_points_in * 100 : null,
      unlabeled_dropped: stats.n_unlabeled_dropped,
      semantic_available: true, mode: 'SalsaNext + adaptive grid',
      accuracy: header.accuracy ?? entry.accuracy, timing_ms: timing, stats,
      device: header.device, point_stride: header.point_stride,
    },
  }
}
