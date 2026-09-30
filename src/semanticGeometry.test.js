import assert from 'node:assert/strict'
import test from 'node:test'
import { semanticGeometry } from './semanticGeometry.js'

const cell = (x, y, semanticClass, elevation = -1) => Object.freeze({
  x_min: x, x_max: x + 0.4, y_min: y, y_max: y + 0.4,
  semantic_class: semanticClass, elevation, resolution: 0.4,
})

test('empty scans produce no synthetic objects', () => {
  assert.deepEqual(semanticGeometry([], -3), [])
})

test('road slabs retain measured elevations even on sloped ground', () => {
  const cells = [-2.5, -2, -1.5].map((height, index) => cell(index, 0, 8, height))
  const parts = semanticGeometry(cells, -3)
  assert.equal(parts.length, cells.length)
  parts.forEach((part) => assert.ok(Math.abs(part.position[1] + part.scale[1] / 2 - part.cell.elevation) < 1e-9))
})

test('separate vehicle observations stay separate and retain source references', () => {
  const cars = [0, 10].flatMap((offset) =>
    Array.from({ length: 16 }, (_, index) => cell(offset + Math.floor(index / 4) * 0.4, index % 4 * 0.4, 0)))
  const parts = semanticGeometry(cars, -3)
  const cabins = parts.filter((part) => part.color === '#243d49')
  assert.equal(cabins.length, 2)
  assert.ok(Math.abs(cabins[0].position[0] - cabins[1].position[0]) > 8)
  parts.forEach((part) => {
    assert.ok(cars.includes(part.cell))
    assert.ok(part.scale.every((size) => Number.isFinite(size) && size > 0))
  })
})

test('isolated vehicle labels and unlabeled cells do not become complete cars', () => {
  const cells = [cell(0, 0, 0), cell(20, 20, -1)]
  const parts = semanticGeometry(cells, -3)
  assert.equal(parts.length, 2)
  assert.ok(parts.every((part) => part.color !== '#243d49'))
})

test('large connected vehicle regions fall back to observed cells', () => {
  const cells = Array.from({ length: 40 }, (_, index) => cell(index * 0.4, 0, 0))
  const parts = semanticGeometry(cells, -3)
  assert.equal(parts.length, cells.length)
  assert.ok(parts.every((part) => part.color !== '#243d49'))
})
