import { colorForClass } from './palette.js'

const SURFACES = new Set([8, 9, 10, 11, 16])
const VEHICLES = new Set([0, 3, 4])

// The presentation groups observed cells only. Source cells remain unchanged
// for analysis, exports, class filtering, and inspection.
export function semanticGeometry(cells, base) {
  const ground = cells.filter((cell) => cell.semantic_class === 8).map((cell) => cell.elevation).sort((a, b) => a - b)
  const floor = ground.length ? ground[Math.floor(ground.length / 2)] : base
  const parts = []
  const grouped = new Map()
  const vehicles = new Map()
  const add = (cell, x, z, width, depth, bottom, height, color = colorForClass(cell.semantic_class)) => {
    parts.push({ cell, position: [x, bottom + height / 2, -z], scale: [width, height, depth], color })
  }
  for (const cell of cells) {
    const id = cell.semantic_class
    const x = (cell.x_min + cell.x_max) / 2
    const y = (cell.y_min + cell.y_max) / 2
    if (VEHICLES.has(id)) {
      const key = `${id}:${Math.floor(x / 0.8)}:${Math.floor(y / 0.8)}`
      if (!vehicles.has(key)) vehicles.set(key, [])
      vehicles.get(key).push(cell)
    } else if (id === 12 || id === 14 || id === 13 || id === 15) {
      const size = id === 12 ? 1 : id === 14 ? 0.65 : 0.35
      const key = `${id}:${Math.floor(x / size)}:${Math.floor(y / size)}`
      const group = grouped.get(key)
      if (group) {
        group.top = Math.max(group.top, cell.z_max ?? cell.elevation)
        if (cell.elevation > group.cell.elevation) group.cell = cell
      } else grouped.set(key, { cell, x: (Math.floor(x / size) + 0.5) * size, y: (Math.floor(y / size) + 0.5) * size, size, top: cell.z_max ?? cell.elevation })
    } else {
      const surface = SURFACES.has(id)
      const height = surface ? 0.12 : Math.max(0.12, cell.elevation - floor)
      add(cell, x, y, cell.x_max - cell.x_min, cell.y_max - cell.y_min,
        surface ? cell.elevation - height : Math.min(floor, cell.elevation - height), height)
    }
  }
  for (const { cell, x, y, size, top } of grouped.values()) {
    const bottom = Math.min(floor, top - 0.15)
    const height = Math.max(0.15, top - bottom)
    add(cell, x, y, size, size, bottom, height)
    if (cell.semantic_class === 14 && height > 1) {
      add(cell, x, y, size * 0.72, size * 0.72, top, Math.min(0.35, height * 0.12), '#32aa35')
    }
  }
  // Connected occupied bins produce vehicle proxies; no objects are inserted
  // where the scan has no vehicle-class evidence.
  while (vehicles.size) {
    const start = vehicles.keys().next().value
    const queue = [start]
    const cluster = []
    const visited = new Set([start])
    for (let index = 0; index < queue.length; index += 1) {
      const key = queue[index]
      const bucket = vehicles.get(key)
      if (!bucket) continue
      cluster.push(...bucket)
      vehicles.delete(key)
      const [id, x, y] = key.split(':').map(Number)
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        const neighbor = `${id}:${x + dx}:${y + dy}`
        if (vehicles.has(neighbor) && !visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor) }
      }
    }
    const cell = cluster[0]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, top = -Infinity, bottom = Infinity
    for (const item of cluster) {
      minX = Math.min(minX, item.x_min); maxX = Math.max(maxX, item.x_max)
      minY = Math.min(minY, item.y_min); maxY = Math.max(maxY, item.y_max)
      top = Math.max(top, item.z_max ?? item.elevation); bottom = Math.min(bottom, item.z_min ?? item.elevation)
    }
    const width = maxX - minX, depth = maxY - minY
    if (cluster.length < 4 || Math.max(width, depth) > 12 || Math.min(width, depth) < 0.4) {
      for (const item of cluster) add(item, (item.x_min + item.x_max) / 2, (item.y_min + item.y_max) / 2,
        item.x_max - item.x_min, item.y_max - item.y_min, item.elevation - 0.2, 0.2)
      continue
    }
    const x = (minX + maxX) / 2, y = (minY + maxY) / 2
    const height = Math.max(0.45, top - bottom)
    add(cell, x, y, width, depth, bottom, height * 0.55)
    add(cell, x, y, width * (width > depth ? 0.56 : 0.85), depth * (width > depth ? 0.85 : 0.56),
      bottom + height * 0.55, height * 0.34, '#243d49')
    add(cell, x, y, width * 0.58, depth * 0.58, bottom + height * 0.89, height * 0.11)
    const alongX = width > depth
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      add(cell, x + width * (alongX ? end * 0.31 : side * 0.46),
        y + depth * (alongX ? side * 0.46 : end * 0.31),
        alongX ? width * 0.15 : width * 0.14, alongX ? depth * 0.14 : depth * 0.15,
        bottom - 0.06, height * 0.26, '#14202a')
    }
  }
  return parts
}
