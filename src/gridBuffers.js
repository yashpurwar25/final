import { Color } from 'three'
import { colorForClass, layerColor } from './palette.js'
import { DEFAULT_DRIVABILITY, DRIVABILITY_COLORS, gridCellDrivability } from './drivability.js'

export const bufferCapacity = (count) => 2 ** Math.ceil(Math.log2(Math.max(1, count)))

export function gridColors(cells, layer, options = DEFAULT_DRIVABILITY) {
  const colors = new Float32Array(cells.length * 3)
  const color = new Color()
  const palette = new Map()
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]
    if (layer === 'elevation') color.setHSL((240 - Math.max(0, Math.min(1, (cell.elevation + 3) / 8)) * 240) / 360, 0.9, 0.56, 'srgb')
    else if (layer === 'resolution') color.setHSL(202 / 360, 0.88, Math.max(25, 82 - cell.resolution * 105) / 100, 'srgb')
    else {
      const css = layer === 'semantic' ? colorForClass(cell.semantic_class)
        : layer === 'drivability' ? DRIVABILITY_COLORS[gridCellDrivability(cell, options)]
          : layerColor(cell, layer, options)
      if (!palette.has(css)) palette.set(css, new Color(css).toArray())
      colors.set(palette.get(css), index * 3)
      continue
    }
    color.toArray(colors, index * 3)
  }
  return colors
}

export function preparedGridColors(cells, renderData, layer, options = DEFAULT_DRIVABILITY) {
  const defaults = Object.keys(DEFAULT_DRIVABILITY).every((key) => options[key] === DEFAULT_DRIVABILITY[key])
  const cached = renderData?.[`${layer}CellColors`]
  return cached && (layer !== 'drivability' || defaults) ? cached : gridColors(cells, layer, options)
}

export function prepareGridBuffers(cells, base) {
  const gridMatrices = new Float32Array(cells.length * 16)
  const tileMatrices = new Float32Array(cells.length * 16)
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]
    const offset = index * 16
    const width = cell.x_max - cell.x_min
    const depth = cell.y_max - cell.y_min
    const x = (cell.x_min + cell.x_max) / 2
    const y = (cell.y_min + cell.y_max) / 2
    const bottom = cell.z_min ?? base
    const top = Math.max(bottom + 0.03, cell.z_max ?? cell.elevation)
    gridMatrices[offset] = width
    gridMatrices[offset + 5] = depth
    gridMatrices[offset + 10] = 1
    gridMatrices[offset + 12] = x
    gridMatrices[offset + 13] = y
    gridMatrices[offset + 15] = 1
    tileMatrices[offset] = width
    tileMatrices[offset + 5] = top - bottom
    tileMatrices[offset + 10] = depth
    tileMatrices[offset + 12] = x
    tileMatrices[offset + 13] = (bottom + top) / 2
    tileMatrices[offset + 14] = -y
    tileMatrices[offset + 15] = 1
  }
  return {
    gridMatrices, tileMatrices,
    semanticCellColors: gridColors(cells, 'semantic'),
    elevationCellColors: gridColors(cells, 'elevation'),
    resolutionCellColors: gridColors(cells, 'resolution'),
    drivabilityCellColors: gridColors(cells, 'drivability'),
  }
}
