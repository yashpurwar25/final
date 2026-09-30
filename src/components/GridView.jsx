import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { layerColor, nameForClass } from '../palette'
import { sceneBounds } from '../scene'
import { DRIVABILITY_COLORS, DRIVABILITY_LABELS, gridCellDrivability } from '../drivability'
import { GridRenderer } from '../gridRenderer'

export default memo(function GridView({ cells, renderData, hiddenClasses, linked, focus, onFocusChange, layer = 'semantic', boundaries = false, drivabilityOptions, playing = false }) {
  const canvasRef = useRef(null)
  const gpuCanvasRef = useRef(null)
  const rendererRef = useRef(null)
  const viewRef = useRef({ zoom: 1, focusX: 0, focusY: 0 })
  const dragRef = useRef(null)
  const transformRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  useLayoutEffect(() => {
    try { rendererRef.current = new GridRenderer(gpuCanvasRef.current) } catch { /* Canvas2D fallback below. */ }
    return () => { rendererRef.current?.dispose(); rendererRef.current = null }
  }, [])

  useEffect(() => {
    if (!linked) {
      const scene = sceneBounds(cells)
      viewRef.current = { zoom: 1, focusX: scene.target[0], focusY: -scene.target[2] }
    }
    setHovered(null)
  }, [cells, linked])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')

    const draw = () => {
      if (!cells.length) {
        context.clearRect(0, 0, canvas.width, canvas.height)
        transformRef.current = null
        return
      }
      const bounds = cells.reduce(
        (acc, cell) => ({
          minX: Math.min(acc.minX, cell.x_min),
          maxX: Math.max(acc.maxX, cell.x_max),
          minY: Math.min(acc.minY, cell.y_min),
          maxY: Math.max(acc.maxY, cell.y_max),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      )
      const dpr = playing ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)

      const padding = 24
      const baseScale = Math.min(
        (rect.width - padding * 2) / Math.max(0.1, bounds.maxX - bounds.minX),
        (rect.height - padding * 2) / Math.max(0.1, bounds.maxY - bounds.minY),
      )
      const view = viewRef.current
      const scale = baseScale * view.zoom
      const originX = rect.width / 2 - (view.focusX - bounds.minX) * scale
      const originY = rect.height / 2 - (bounds.maxY - view.focusY) * scale
      transformRef.current = { bounds, scale, originX, originY }

      const rendered = rect.width > 0 && rect.height > 0 && rendererRef.current?.draw({
        cells, renderData, hiddenClasses, layer, options: drivabilityOptions, boundaries,
        bounds, scale, originX, originY, width: rect.width, height: rect.height, dpr,
      })
      gpuCanvasRef.current.style.visibility = rendered ? 'visible' : 'hidden'
      if (!rendered) {
        context.fillStyle = layer === 'drivability' ? DRIVABILITY_COLORS.unknown : '#06121c'
        context.fillRect(0, 0, rect.width, rect.height)
      }
      context.strokeStyle = '#183344'
      context.lineWidth = 0.5
      const gridStep = Math.max(20, 5 * scale)
      context.beginPath()
      for (let x = originX % gridStep; x < rect.width; x += gridStep) {
        context.moveTo(x, 0); context.lineTo(x, rect.height)
      }
      for (let y = originY % gridStep; y < rect.height; y += gridStep) {
        context.moveTo(0, y); context.lineTo(rect.width, y)
      }
      context.stroke()
      if (!rendered) for (const cell of cells) {
        if (hiddenClasses.has(cell.semantic_class)) continue
        const x = originX + (cell.x_min - bounds.minX) * scale
        const y = originY + (bounds.maxY - cell.y_max) * scale
        const width = (cell.x_max - cell.x_min) * scale
        const height = (cell.y_max - cell.y_min) * scale
        context.globalAlpha = 1
        context.fillStyle = layerColor(cell, layer, drivabilityOptions)
        context.fillRect(x, y, width, height)
        if (boundaries && width > 3) {
          context.strokeStyle = '#06121c80'
          context.lineWidth = 0.5
          context.strokeRect(x, y, width, height)
        }
      }
      context.globalAlpha = 1

      const egoX = originX + (0 - bounds.minX) * scale
      const egoY = originY + (bounds.maxY - 0) * scale
      context.save()
      context.translate(egoX, egoY)
      context.rotate(Math.PI / 2)
      context.beginPath()
      context.moveTo(0, -9)
      context.lineTo(6, 7)
      context.lineTo(-6, 7)
      context.closePath()
      context.fillStyle = '#07100f'
      context.fill()
      context.strokeStyle = '#49dcb1'
      context.lineWidth = 1.5
      context.stroke()
      context.restore()

      const desiredLength = rect.width * 0.2 / scale
      const magnitude = 10 ** Math.floor(Math.log10(desiredLength))
      const barMeters = [1, 2, 5, 10].map((value) => value * magnitude).findLast((value) => value <= desiredLength) ?? magnitude
      const barLength = barMeters * scale
      const barX = 21
      const barY = rect.height - 28
      context.strokeStyle = '#b3c9c3'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(barX, barY - 4)
      context.lineTo(barX, barY)
      context.lineTo(barX + barLength, barY)
      context.lineTo(barX + barLength, barY - 4)
      context.stroke()
      context.fillStyle = '#78908a'
      context.font = '9px Courier New'
      context.fillText(`${Number(barMeters.toPrecision(2))} m`, barX, barY - 8)
    }

    draw()
    canvas.drawGrid = draw
    return () => { canvas.drawGrid = null }
  }, [cells, renderData, hiddenClasses, layer, boundaries, linked, drivabilityOptions, playing])

  useEffect(() => {
    const canvas = canvasRef.current
    const observer = new ResizeObserver(() => canvas.drawGrid?.())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!linked) return
    viewRef.current.focusX = focus.x
    viewRef.current.focusY = focus.y
    canvasRef.current?.drawGrid?.()
  }, [focus, linked])

  const cellAt = (event) => {
    const transform = transformRef.current
    if (!transform) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const worldX = transform.bounds.minX + (screenX - transform.originX) / transform.scale
    const worldY = transform.bounds.maxY - (screenY - transform.originY) / transform.scale
    return cells.findLast?.(
      (cell) => !hiddenClasses.has(cell.semantic_class) && worldX >= cell.x_min && worldX <= cell.x_max && worldY >= cell.y_min && worldY <= cell.y_max,
    ) ?? cells.find(
      (cell) => !hiddenClasses.has(cell.semantic_class) && worldX >= cell.x_min && worldX <= cell.x_max && worldY >= cell.y_min && worldY <= cell.y_max,
    )
  }

  const onPointerMove = (event) => {
    if (dragRef.current && transformRef.current) {
      const view = viewRef.current
      const transform = transformRef.current
      view.focusX = dragRef.current.focusX - (event.clientX - dragRef.current.x) / transform.scale
      view.focusY = dragRef.current.focusY + (event.clientY - dragRef.current.y) / transform.scale
      canvasRef.current.drawGrid?.()
      if (linked) onFocusChange({ x: view.focusX, y: view.focusY })
      setHovered(null)
      return
    }
    const cell = cellAt(event)
    const rect = canvasRef.current.getBoundingClientRect()
    setHovered(cell ? { cell, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
  }

  const onWheel = (event) => {
    event.preventDefault()
    viewRef.current.zoom = Math.max(0.55, Math.min(8, viewRef.current.zoom * Math.exp(-event.deltaY * 0.001)))
    canvasRef.current.drawGrid?.()
  }

  return (
    <div className="grid-wrap">
      <canvas className="grid-gpu" ref={gpuCanvasRef} aria-hidden="true" />
      <canvas aria-label={`${layer} map`}
        ref={canvasRef}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = { x: event.clientX, y: event.clientY, ...viewRef.current }
        }}
        onPointerUp={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}
        onPointerLeave={() => { dragRef.current = null; setHovered(null) }}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
      />
      {hovered && (
        <div className="cell-tooltip" style={{ left: hovered.x + 14, top: hovered.y + 14 }}>
          <strong>{nameForClass(hovered.cell.semantic_class)}</strong>
          <span>{hovered.cell.resolution} m cell</span>
          <span>Elevation {hovered.cell.elevation.toFixed(2)} m</span>
          <span>Drivability {DRIVABILITY_LABELS[gridCellDrivability(hovered.cell, drivabilityOptions)]}</span>
        </div>
      )}
      <div className="canvas-hint">DRAG TO PAN · SCROLL TO ZOOM</div>
    </div>
  )
})
