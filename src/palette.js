import { DRIVABILITY_COLORS, gridCellDrivability } from './drivability.js'

export const KNOWN_CLASSES = {
  0: 'Car',
  1: 'Bicycle',
  2: 'Motorcycle',
  3: 'Truck',
  4: 'Other-vehicle',
  5: 'Person/Pedestrian',
  6: 'Bicyclist',
  7: 'Motorcyclist',
  8: 'Road',
  9: 'Parking',
  10: 'Sidewalk',
  11: 'Other-ground',
  12: 'Building',
  13: 'Fence',
  14: 'Vegetation',
  15: 'Trunk',
  16: 'Terrain',
  17: 'Pole',
  18: 'Traffic-sign',
}

const colors = [
  '#ed303b', '#e65db3', '#ffa329', '#ba382b', '#b94e46',
  '#35aaff', '#637aff', '#ac61ef', '#727f8a', '#5b6874',
  '#b8c2c8', '#b6a060', '#f3c62f', '#a67b35', '#269537',
  '#687b32', '#61ba4b', '#d266eb', '#f349df',
]

export function colorForClass(id) {
  const numericId = Number(id)
  if (numericId < 0) return '#648899'
  return colors[((numericId % colors.length) + colors.length) % colors.length]
}

export function nameForClass(id) {
  if (Number(id) < 0) return 'Unlabeled'
  return KNOWN_CLASSES[id] ?? `Class ${id}`
}

export function layerColor(cell, layer = 'semantic', drivabilityOptions) {
  if (layer === 'drivability') return DRIVABILITY_COLORS[gridCellDrivability(cell, drivabilityOptions)]
  if (layer === 'elevation') return `hsl(${240 - Math.max(0, Math.min(1, (cell.elevation + 3) / 8)) * 240}, 90%, 56%)`
  if (layer === 'traversability') return cell.traversability < 0 ? '#647888' : cell.traversability >= 0.5 ? '#35cf80' : '#f0525d'
  if (layer === 'resolution') return `hsl(202, 88%, ${Math.max(25, 82 - cell.resolution * 105)}%)`
  if (layer === 'density') return `hsl(${190 - Math.min(1, Math.log2(cell.point_count + 1) / 7) * 150}, 85%, 57%)`
  return colorForClass(cell.semantic_class)
}

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}
