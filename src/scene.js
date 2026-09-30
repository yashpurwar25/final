export function sceneBounds(values, pointCloud = false) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let index = 0; index < values.length; index += pointCloud ? 4 : 1) {
    const cell = pointCloud ? null : values[index]
    const x = pointCloud ? values[index] : cell.x_min
    const y = pointCloud ? values[index + 1] : cell.y_min
    const z = pointCloud ? values[index + 2] : cell.elevation
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, pointCloud ? x : cell.x_max)
    maxY = Math.max(maxY, pointCloud ? y : cell.y_max)
    maxZ = Math.max(maxZ, z)
  }
  if (!values.length) return { target: [0, 0, 0], radius: 20, base: -3.5 }
  return {
    target: [(minX + maxX) / 2, (minZ + maxZ) / 2, -(minY + maxY) / 2],
    radius: Math.max(2, (maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2),
    base: minZ - 0.1,
  }
}

export function cameraPosition(scene, topDown) {
  const [x, y, z] = scene.target
  const r = scene.radius
  return topDown ? [x, y + r * 2.7, z + 0.001] : [x + r * 1.3, y + r * 1.5, z + r * 1.9]
}
