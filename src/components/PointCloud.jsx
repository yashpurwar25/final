import { GizmoHelper, GizmoViewport, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color } from 'three'
import { colorForClass } from '../palette'
import { cameraPosition, sceneBounds } from '../scene'
import { bufferCapacity } from '../gridBuffers'

function Cloud({ interleaved, renderData, hiddenClasses, raw }) {
  const geometry = useRef()
  const { positions, colors } = useMemo(() => {
    if (renderData && (raw || hiddenClasses.size === 0)) {
      return { positions: renderData.positions, colors: raw ? renderData.rawColors : renderData.semanticColors }
    }
    let visibleCount = 0
    for (let index = 0; index < interleaved.length; index += 4) {
      if (raw || !hiddenClasses.has(Math.round(interleaved[index + 3]))) visibleCount += 1
    }
    const nextPositions = new Float32Array(visibleCount * 3)
    const nextColors = new Float32Array(visibleCount * 3)
    let visibleIndex = 0
    const color = new Color()
    for (let index = 0; index < interleaved.length / 4; index += 1) {
      const source = index * 4
      if (!raw && hiddenClasses.has(Math.round(interleaved[source + 3]))) continue
      const target = visibleIndex * 3
      nextPositions[target] = interleaved[source]
      nextPositions[target + 1] = interleaved[source + 2]
      nextPositions[target + 2] = -interleaved[source + 1]
      if (raw) color.setHSL((240 - Math.max(0, Math.min(1, (interleaved[source + 2] + 3) / 8)) * 240) / 360, 0.9, 0.56, 'srgb')
      else color.set(colorForClass(Math.round(interleaved[source + 3])))
      color.toArray(nextColors, target)
      visibleIndex += 1
    }
    return { positions: nextPositions, colors: nextColors }
  }, [interleaved, renderData, hiddenClasses, raw])
  const capacity = bufferCapacity(positions.length / 3)
  const buffers = useMemo(() => ({
    positions: new Float32Array(capacity * 3), colors: new Float32Array(capacity * 3),
  }), [capacity])
  useLayoutEffect(() => {
    geometry.current.attributes.position.array.set(positions)
    geometry.current.attributes.color.array.set(colors)
    geometry.current.attributes.position.needsUpdate = true
    geometry.current.attributes.color.needsUpdate = true
    geometry.current.setDrawRange(0, positions.length / 3)
    geometry.current.boundingSphere = null
  }, [positions, colors, buffers])

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometry}>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={1.7} sizeAttenuation={false} vertexColors toneMapped={false} />
    </points>
  )
}

function GroundGrid({ scene }) {
  return (
    <gridHelper args={[scene.radius * 2.5, 24, '#244352', '#102633']} position={[scene.target[0], scene.base - 0.1, scene.target[2]]} />
  )
}

function EgoMarker({ groundZ }) {
  return (
    <group position={[0, groundZ, 0]}>
      <mesh>
        <boxGeometry args={[2.1, 0.4, 4.2]} />
        <meshBasicMaterial color="#49dcb1" wireframe transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 0.1, -2.7]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.65, 1.5, 3]} />
        <meshBasicMaterial color="#49dcb1" wireframe />
      </mesh>
    </group>
  )
}

function CloudCamera({ scene, topDown, linked, focus, onFocusChange }) {
  const controlsRef = useRef(null)
  const [framing] = useState(() => ({ position: cameraPosition(scene, topDown), target: [...scene.target] }))
  useEffect(() => {
    if (!linked || !controlsRef.current) return
    const target = controlsRef.current.target
    if (Math.abs(target.x - focus.x) < 0.01 && Math.abs(target.z + focus.y) < 0.01) return
    target.set(focus.x, -1, -focus.y)
    controlsRef.current.update()
  }, [focus, linked])

  return <>
      <PerspectiveCamera makeDefault position={framing.position} fov={46} far={50000} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        enableRotate={!topDown}
        dampingFactor={0.08}
        target={framing.target}
        onChange={(event) => {
          if (!linked) return
          const target = event.target.target
          onFocusChange({ x: target.x, y: -target.z })
        }}
      />
  </>
}

export default memo(function PointCloud({ points, renderData, hiddenClasses, linked, focus, onFocusChange, raw = false, topDown = false, groundZ = -2.85, playing = false, resetKey = 0 }) {
  const scene = useMemo(() => renderData?.pointScene ?? sceneBounds(points, true), [points, renderData])
  return (
    <Canvas dpr={playing ? 1 : [1, 2]} gl={{ antialias: true }}>
      <CloudCamera key={`${topDown}-${resetKey}`} scene={scene} topDown={topDown} linked={linked} focus={focus} onFocusChange={onFocusChange} />
      <color attach="background" args={['#06121c']} />
      <Cloud interleaved={points} renderData={renderData} hiddenClasses={hiddenClasses} raw={raw} />
      <GroundGrid scene={scene} />
      <EgoMarker groundZ={groundZ} />
      <GizmoHelper alignment="bottom-left" margin={[58, 58]}>
        <GizmoViewport axisColors={['#ff6b47', '#49dcb1', '#4eb9ff']} labelColor="#d9e7e3" />
      </GizmoHelper>
    </Canvas>
  )
})
