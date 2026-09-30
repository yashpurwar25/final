import {
  Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderer,
} from 'three'
import { bufferCapacity, prepareGridBuffers, preparedGridColors } from './gridBuffers.js'
import { DRIVABILITY_COLORS } from './drivability.js'

function cellEdges(shader) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 cellUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ncellUv = uv;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 cellUv;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 pixels = fwidth(cellUv);
      vec2 edge = min(cellUv, 1.0 - cellUv);
      if (pixels.x < 0.333 && min(edge.x / pixels.x, edge.y / pixels.y) < 0.5) diffuseColor.rgb *= 0.5;`)
}

// One instanced draw replaces tens of thousands of Canvas2D rectangles per panel.
export class GridRenderer {
  constructor(canvas) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.scene = new Scene()
    this.camera = new OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.geometry = new PlaneGeometry(1, 1)
    this.material = new MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false })
    this.mesh = null
    this.capacity = 0
    this.cells = null
  }

  draw({ cells, renderData, hiddenClasses, layer, options, boundaries, bounds, scale, originX, originY, width, height, dpr }) {
    if (this.renderer.getContext().isContextLost()) return false
    const capacity = bufferCapacity(cells.length)
    if (!this.mesh || capacity > this.capacity) {
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose() }
      this.capacity = capacity
      this.mesh = new InstancedMesh(this.geometry, this.material, capacity)
      this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage)
      this.mesh.frustumCulled = false
      this.scene.add(this.mesh)
      this.cells = null
    }
    if (this.cells !== cells || this.hiddenClasses !== hiddenClasses || this.layer !== layer || this.options !== options) {
      const matrices = renderData?.gridMatrices ?? prepareGridBuffers(cells, 0).gridMatrices
      this.mesh.instanceMatrix.array.set(matrices)
      if (hiddenClasses.size) {
        for (let index = 0; index < cells.length; index += 1) {
          if (hiddenClasses.has(cells[index].semantic_class)) {
            this.mesh.instanceMatrix.array[index * 16] = 0
            this.mesh.instanceMatrix.array[index * 16 + 5] = 0
          }
        }
      }
      this.mesh.instanceColor.array.set(preparedGridColors(cells, renderData, layer, options))
      this.mesh.instanceMatrix.needsUpdate = true
      this.mesh.instanceColor.needsUpdate = true
      this.mesh.count = cells.length
      this.cells = cells
      this.hiddenClasses = hiddenClasses
      this.layer = layer
      this.options = options
    }
    if (this.boundaries !== boundaries) {
      this.material.onBeforeCompile = boundaries ? cellEdges : () => {}
      this.material.customProgramCacheKey = () => String(boundaries)
      this.material.needsUpdate = true
      this.boundaries = boundaries
    }
    if (this.width !== width || this.height !== height || this.dpr !== dpr) {
      this.renderer.setPixelRatio(dpr)
      this.renderer.setSize(width, height, false)
      this.width = width
      this.height = height
      this.dpr = dpr
    }
    this.camera.left = bounds.minX - originX / scale
    this.camera.right = this.camera.left + width / scale
    this.camera.top = bounds.maxY + originY / scale
    this.camera.bottom = this.camera.top - height / scale
    this.camera.updateProjectionMatrix()
    this.scene.background = new Color(layer === 'drivability' ? DRIVABILITY_COLORS.unknown : '#06121c')
    this.renderer.render(this.scene, this.camera)
    return true
  }

  dispose() {
    this.mesh?.dispose()
    this.geometry.dispose()
    this.material.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
