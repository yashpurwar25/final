import { cellDrivability, DEFAULT_DRIVABILITY, DRIVABILITY_COLORS } from '../../dashbard_timesxript_drivability/drivability.ts'

export { DEFAULT_DRIVABILITY, DRIVABILITY_COLORS }
export const DRIVABILITY_LABELS = { drivable: 'Drivable', caution: 'Caution', blocked: 'Blocked', unknown: 'No data' }

export function gridCellDrivability(cell, options = DEFAULT_DRIVABILITY) {
  if (!cell) return 'unknown'
  // Restore the LGF class convention before applying the supplied rules.
  const cls = cell.semantic_class + 1
  if (!Number.isInteger(cls) || cls < 0 || cls > 19) return 'unknown'
  const validFraction = (value) => Number.isFinite(value) && value >= 0 && value <= 1
  const measuredComplexity = cell.complexity ?? cell.terrain_complexity
  const derivedComplexity = validFraction(measuredComplexity) ? measuredComplexity
    // Legacy split-frame archives expose traversability but not terrain complexity.
    : validFraction(cell.traversability) ? 1 - cell.traversability : undefined
  const complete = validFraction(derivedComplexity) && validFraction(cell.semantic_confidence)
  const state = cellDrivability(cls, validFraction(derivedComplexity) ? derivedComplexity : 0,
    validFraction(cell.semantic_confidence) ? cell.semantic_confidence : 0, options)
  // Legacy geometry exports may lack terrain measurements. Never infer free space.
  return !complete && state !== 'blocked' ? 'unknown' : state
}

export function gridDrivabilityArea(cells, options = DEFAULT_DRIVABILITY) {
  const area = { drivable: 0, caution: 0, blocked: 0, unknown: 0 }
  for (const cell of cells) {
    area[gridCellDrivability(cell, options)] += (cell.x_max - cell.x_min) * (cell.y_max - cell.y_min)
  }
  return area
}
