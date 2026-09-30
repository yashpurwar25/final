import { Color, Object3D } from 'three'
import { colorForClass } from './palette.js'
import { sceneBounds } from './scene.js'
import { prepareGridBuffers } from './gridBuffers.js'
import { semanticGeometry } from './semanticGeometry.js'

export function prepareFrame(frame) {
  const points = frame.points
  const count = points.length / 4
  const positions = new Float32Array(count * 3)
  const rawColors = new Float32Array(count * 3)
  const semanticColors = new Float32Array(count * 3)
  const palette = new Map()
  const color = new Color()
  for (let index = 0; index < count; index += 1) {
    const source = index * 4
    const target = index * 3
    positions[target] = points[source]
    positions[target + 1] = points[source + 2]
    positions[target + 2] = -points[source + 1]
    color.setHSL((240 - Math.max(0, Math.min(1, (points[source + 2] + 3) / 8)) * 240) / 360, 0.9, 0.56, 'srgb')
    color.toArray(rawColors, target)
    const id = Math.round(points[source + 3])
    if (!palette.has(id)) palette.set(id, new Color(colorForClass(id)).toArray())
    semanticColors.set(palette.get(id), target)
  }
  const gridScene = sceneBounds(frame.grid)
  const semanticParts = semanticGeometry(frame.grid, gridScene.base)
  const semanticMatrices = new Float32Array(semanticParts.length * 16)
  const object = new Object3D()
  semanticParts.forEach((part, index) => {
    object.position.fromArray(part.position)
    object.scale.fromArray(part.scale)
    object.updateMatrix()
    semanticMatrices.set(object.matrix.elements, index * 16)
  })
  frame.renderData = {
    positions, rawColors, semanticColors,
    pointScene: sceneBounds(points, true),
    gridScene,
    semanticParts,
    semanticMatrices,
    ...prepareGridBuffers(frame.grid, gridScene.base),
  }
  return frame
}
