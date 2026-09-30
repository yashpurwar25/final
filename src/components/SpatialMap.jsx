import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Color, InstancedBufferAttribute, Object3D } from 'three'
import { layerColor, nameForClass } from '../palette'
import { cameraPosition, sceneBounds } from '../scene'
import { semanticGeometry } from '../semanticGeometry'
import { DRIVABILITY_COLORS, DRIVABILITY_LABELS, gridCellDrivability } from '../drivability'
import { bufferCapacity, preparedGridColors } from '../gridBuffers'

function ZoomControls({ framing, topDown, zoom, onZoomChange }) {
  const camera = useThree((state) => state.camera)
  const controls = useRef()
  useLayoutEffect(() => {
    const orbit = controls.current
    if (!orbit) return
    camera.position.sub(orbit.target).normalize().multiplyScalar(framing.distance / zoom).add(orbit.target)
    orbit.update()
  }, [camera, framing, zoom])

  return <OrbitControls ref={controls} makeDefault target={framing.target}
    enableRotate={!topDown} enableDamping={false}
    minDistance={framing.distance / 8} maxDistance={framing.distance / 0.5}
    maxPolarAngle={Math.PI / 2.05}
    onEnd={() => {
      const orbit = controls.current
      if (!orbit) return
      const value = framing.distance / camera.position.distanceTo(orbit.target)
      onZoomChange(Math.max(0.5, Math.min(8, Math.round(value * 100) / 100)))
    }} />
}

function MapCamera({ scene, topDown, zoom, onZoomChange }) {
  // Only an explicit framing/reset action remounts this camera. New playback
  // frames must not overwrite its position, orbit target, or reference scale.
  const [framing] = useState(() => {
    const position = cameraPosition(scene, topDown)
    const target = [...scene.target]
    return { position, target, distance: Math.hypot(...position.map((value, index) => value - target[index])) }
  })
  return <>
    <PerspectiveCamera makeDefault position={framing.position} fov={48} near={0.1} far={50000} />
    <ZoomControls framing={framing} topDown={topDown} zoom={zoom} onZoomChange={onZoomChange} />
  </>
}

function blockEdges(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBlock;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlock = position;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBlock;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = abs(vBlock);
      float edge = max(min(p.x, p.y), max(min(p.y, p.z), min(p.x, p.z)));
      float line = smoothstep(0.485 - fwidth(edge), 0.485, edge);
      diffuseColor.rgb *= 1.0 - line * 0.34;`)
}

function SemanticBlocks({ parts, renderData, hiddenClasses, boundaries, onSelect }) {
  const mesh = useRef()
  const visible = useMemo(() => parts.filter((part) => !hiddenClasses.has(part.cell.semantic_class)), [parts, hiddenClasses])
  useLayoutEffect(() => {
    if (renderData?.semanticMatrices && hiddenClasses.size === 0) {
      mesh.current.instanceMatrix.array.set(renderData.semanticMatrices)
      if (!mesh.current.instanceColor) {
        mesh.current.instanceColor = new InstancedBufferAttribute(new Float32Array(bufferCapacity(parts.length) * 3), 3)
      }
      mesh.current.instanceColor.array.set(renderData.blockColors)
    } else {
      const object = new Object3D()
      const color = new Color()
      visible.forEach((part, index) => {
        object.position.fromArray(part.position)
        object.scale.fromArray(part.scale)
        object.updateMatrix()
        mesh.current.setMatrixAt(index, object.matrix)
        mesh.current.setColorAt(index, color.set(part.color))
      })
    }
    mesh.current.count = visible.length
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    // Raycasting computes bounds on demand; playback does not need a per-instance scan.
    mesh.current.boundingSphere = null
  }, [visible, parts.length, renderData, hiddenClasses])
  return <instancedMesh ref={mesh} args={[null, null, bufferCapacity(parts.length)]} frustumCulled={false}
    onClick={(event) => { event.stopPropagation(); onSelect(visible[event.instanceId]?.cell) }}>
    <boxGeometry />
    <meshStandardMaterial key={String(boundaries)} roughness={0.92} metalness={0}
      onBeforeCompile={boundaries ? blockEdges : undefined} />
  </instancedMesh>
}

function Tiles({ cells, renderData, hiddenClasses, layer, boundaries, elevation, base, onSelect, drivabilityOptions }) {
  const mesh = useRef()
  const visible = useMemo(() => hiddenClasses.size ? cells.filter((cell) => !hiddenClasses.has(cell.semantic_class)) : cells, [cells, hiddenClasses])
  const capacity = bufferCapacity(cells.length)
  const colors = useMemo(() => preparedGridColors(visible, visible === cells ? renderData : null, layer, drivabilityOptions), [visible, cells, renderData, layer, drivabilityOptions])
  useLayoutEffect(() => {
    if (renderData?.tileMatrices && elevation && visible === cells) {
      mesh.current.instanceMatrix.array.set(renderData.tileMatrices)
    } else {
    const object = new Object3D()
    for (let index = 0; index < visible.length; index += 1) {
      const cell = visible[index]
      const bottom = elevation ? (cell.z_min ?? base) : base
      const top = elevation ? Math.max(bottom + 0.03, cell.z_max ?? cell.elevation) : base + 0.03
      const height = Math.max(0.03, top - bottom)
      object.position.set((cell.x_min + cell.x_max) / 2, bottom + height / 2, -(cell.y_min + cell.y_max) / 2)
      object.scale.set(cell.x_max - cell.x_min, height, cell.y_max - cell.y_min)
      object.updateMatrix()
      mesh.current.setMatrixAt(index, object.matrix)
    }
    }
    if (!mesh.current.instanceColor) mesh.current.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    mesh.current.instanceColor.array.set(colors)
    mesh.current.count = visible.length
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.boundingSphere = null
  }, [cells, visible, renderData, capacity, colors, elevation, base])
  return (
    <instancedMesh ref={mesh} args={[null, null, capacity]} frustumCulled={false} onClick={(event) => { event.stopPropagation(); onSelect(visible[event.instanceId]) }}>
      <boxGeometry args={[1, 1, 1]} />
      {layer === 'drivability' ? <meshBasicMaterial toneMapped={false} /> : <meshStandardMaterial key={String(boundaries)} roughness={0.85} metalness={0.05} onBeforeCompile={boundaries ? blockEdges : undefined} />}
    </instancedMesh>
  )
}

export default memo(function SpatialMap({ cells, renderData, hiddenClasses, layer, boundaries, elevation, topDown, resetKey, objects = false, drivabilityOptions, playing = false }) {
  const [selected, setSelected] = useState(null)
  const [overview, setOverview] = useState(false)
  const [zoom, setZoom] = useState(1)
  const scene = useMemo(() => renderData?.gridScene ?? sceneBounds(cells), [cells, renderData])
  const view = overview ? scene : { ...scene, radius: Math.min(scene.radius, 32) }
  const illustrated = objects && elevation && layer === 'semantic'
  const parts = useMemo(() => illustrated ? (renderData?.semanticParts ?? semanticGeometry(cells, scene.base)) : [], [cells, scene.base, illustrated, renderData])
  const current = selected?.cells === cells ? selected.cell : null
  return (
    <div className="spatial-map">
      <Canvas dpr={playing ? 1 : [1, 2]} gl={{ antialias: true }} onPointerMissed={() => setSelected(null)}>
        <color attach="background" args={[layer === 'drivability' ? DRIVABILITY_COLORS.unknown : '#081824']} />
        <MapCamera key={`${topDown}-${resetKey}-${overview}`} scene={view} topDown={topDown} zoom={zoom} onZoomChange={setZoom} />
        <ambientLight intensity={0.65} />
        <hemisphereLight args={['#d6efff', '#394534', 1.1]} />
        <directionalLight position={[-30, 60, 25]} intensity={2.3} />
        {illustrated ? <SemanticBlocks parts={parts} renderData={renderData} hiddenClasses={hiddenClasses} boundaries={boundaries} onSelect={(cell) => setSelected({ cells, cell })} />
          : <Tiles cells={cells} renderData={renderData} hiddenClasses={hiddenClasses} layer={layer} boundaries={boundaries} elevation={elevation} base={scene.base} drivabilityOptions={drivabilityOptions} onSelect={(cell) => setSelected({ cells, cell })} />}
        <gridHelper args={[scene.radius * 3, 40, '#244453', '#102837']} position={[scene.target[0], scene.base - 0.05, scene.target[2]]} />
        <GizmoHelper alignment="top-right" margin={[40, 45]}>
          <GizmoViewport axisColors={['#f56b72', '#4fdbad', '#45b9ef']} labelColor="#d6edf6" />
        </GizmoHelper>
      </Canvas>
      <div className="map-navigation">
        <div className="map-framing segmented-control"><button className={!overview ? 'selected' : ''} aria-pressed={!overview} onClick={() => { setOverview(false); setZoom(1) }}>Local detail</button><button className={overview ? 'selected' : ''} aria-pressed={overview} onClick={() => { setOverview(true); setZoom(1) }}>Fit scan</button></div>
        <label className="map-zoom"><span>Zoom</span><input type="range" aria-label="Semantic map zoom" aria-valuetext={`${zoom.toFixed(2)} times`} min="0.5" max="8" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><output>{zoom.toFixed(2)}x</output></label>
      </div>
      <div className="map-coordinate">{illustrated ? 'SEMANTIC BLOCK VIEW' : 'MEASURED CELL VIEW'}<span>{illustrated ? 'GROUPED SCAN CELLS / VEHICLE PROXIES' : 'LOCAL SENSOR FRAME / METRES'}</span></div>
      {current && <div className="cell-inspector">
        <button aria-label="Close cell inspector" onClick={() => setSelected(null)}>×</button>
        <strong><i style={{ background: layerColor(current, layer, drivabilityOptions) }} />{nameForClass(current.semantic_class)}</strong>
        {illustrated && <p className="inspector-caption">Source cell measurements</p>}
        <dl>
          <dt>Center (X, Y)</dt><dd>{((current.x_min + current.x_max) / 2).toFixed(2)}, {((current.y_min + current.y_max) / 2).toFixed(2)} m</dd>
          <dt>Resolution</dt><dd>{(current.resolution * 100).toFixed(1)} cm</dd>
          <dt>Elevation</dt><dd>{current.elevation.toFixed(2)} m</dd>
          {current.z_min != null && <><dt>Height range</dt><dd>{current.z_min.toFixed(2)} to {current.z_max.toFixed(2)} m</dd><dt>Height deviation</dt><dd>{current.z_std.toFixed(3)} m</dd><dt>Complexity</dt><dd>{(current.complexity * 100).toFixed(0)}%</dd></>}
          <dt>Points</dt><dd>{current.point_count}</dd>
          <dt>Confidence</dt><dd>{current.semantic_class < 0 ? 'Unavailable' : `${(current.semantic_confidence * 100).toFixed(1)}%`}</dd>
          <dt>Traversability</dt><dd>{current.traversability < 0 ? 'Unavailable' : `${(current.traversability * 100).toFixed(0)}%`}</dd>
          <dt>Drivability</dt><dd>{DRIVABILITY_LABELS[gridCellDrivability(current, drivabilityOptions)]}</dd>
        </dl>
      </div>}
      <div className="canvas-hint">DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A CELL TO INSPECT</div>
    </div>
  )
})
