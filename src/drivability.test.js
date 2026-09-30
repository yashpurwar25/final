import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_DRIVABILITY, DRIVABILITY_COLORS, gridCellDrivability, gridDrivabilityArea } from './drivability.js'
import { layerColor } from './palette.js'

const cell = (cls, complexity = 0.1, confidence = 0.9, size = 0.4) => ({
  semantic_class: cls - 1, complexity, semantic_confidence: confidence,
  x_min: 0, x_max: size, y_min: 0, y_max: size,
})

test('LGF semantic classes map to profile-specific drivability', () => {
  const offRoad = { ...DEFAULT_DRIVABILITY, profile: 'off-road' }
  for (const cls of [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 16, 18, 19]) {
    assert.equal(gridCellDrivability(cell(cls)), 'blocked')
    assert.equal(gridCellDrivability(cell(cls), offRoad), 'blocked')
  }
  for (const cls of [9, 10]) assert.equal(gridCellDrivability(cell(cls)), 'drivable')
  for (const cls of [11, 12, 17]) {
    assert.equal(gridCellDrivability(cell(cls)), 'caution')
    assert.equal(gridCellDrivability(cell(cls), offRoad), 'drivable')
  }
  assert.equal(gridCellDrivability(cell(15)), 'blocked')
  assert.equal(gridCellDrivability(cell(15), offRoad), 'caution')
})

test('threshold boundaries and missing measurements never overstate drivable space', () => {
  assert.equal(gridCellDrivability(cell(9, 0.5)), 'caution')
  assert.equal(gridCellDrivability(cell(9, 0.8)), 'blocked')
  assert.equal(gridCellDrivability(cell(9, 0.1, 0.49)), 'caution')
  assert.equal(gridCellDrivability(cell(9, 0.1, 0.5)), 'drivable')
  assert.equal(gridCellDrivability({ ...cell(9), complexity: undefined }), 'unknown')
  assert.equal(gridCellDrivability(cell(9, NaN)), 'unknown')
  assert.equal(gridCellDrivability({ ...cell(9), complexity: undefined, terrain_complexity: 0.8 }), 'blocked')
  assert.equal(gridCellDrivability({ ...cell(9), complexity: undefined, terrain_complexity: 0.1 }), 'drivable')
  assert.equal(gridCellDrivability(null), 'unknown')
  assert.equal(gridCellDrivability(cell(20)), 'unknown')
})

test('legacy split-frame cells fall back to traversability when complexity is absent', () => {
  const legacyRoad = { ...cell(9), complexity: undefined, traversability: 0.95 }
  const legacySidewalk = { ...cell(11), complexity: undefined, traversability: 0.9 }
  const legacyObstacle = { ...cell(1), complexity: undefined, traversability: 0.9 }
  const legacyRoughRoad = { ...cell(9), complexity: undefined, traversability: 0.15 }

  assert.equal(gridCellDrivability(legacyRoad), 'drivable')
  assert.equal(gridCellDrivability(legacySidewalk), 'caution')
  assert.equal(gridCellDrivability(legacyObstacle), 'blocked')
  assert.equal(gridCellDrivability(legacyRoughRoad), 'blocked')
})

test('area totals use adaptive cell footprints and colors respond to live profile changes', () => {
  const cells = [cell(9), cell(11, 0.1, 0.9, 0.2), cell(1, 0.1, 0.9, 0.1)]
  const area = gridDrivabilityArea(cells)
  assert.ok(Math.abs(area.drivable - 0.16) < 1e-9)
  assert.ok(Math.abs(area.caution - 0.04) < 1e-9)
  assert.ok(Math.abs(area.blocked - 0.01) < 1e-9)
  assert.equal(area.unknown, 0)
  assert.equal(layerColor(cells[1], 'drivability'), DRIVABILITY_COLORS.caution)
  assert.equal(layerColor(cells[1], 'drivability', { ...DEFAULT_DRIVABILITY, profile: 'off-road' }), DRIVABILITY_COLORS.drivable)
})
