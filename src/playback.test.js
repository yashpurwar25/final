import assert from 'node:assert/strict'
import test from 'node:test'
import { nextPlaybackIndex, scheduleNextFrame } from './playback.js'

test('playback visits every frame, wraps, and handles one-frame clips', () => {
  let index = 0
  const visited = []
  for (let step = 0; step < 1001; step += 1) {
    visited.push(index)
    index = nextPlaybackIndex(index, 1000)
  }
  assert.deepEqual(visited.slice(0, 1000), Array.from({ length: 1000 }, (_, i) => i))
  assert.equal(visited[1000], 0)
  assert.equal(nextPlaybackIndex(0, 1), 0)
})

function animationClock() {
  let id = 0
  const pending = new Map()
  return {
    requestFrame(callback) { pending.set(++id, callback); return id },
    cancelFrame(handle) { pending.delete(handle) },
    paint(now) {
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach((callback) => callback(now))
    },
  }
}

test('2x playback includes preparation time and advances at its 50ms deadline', () => {
  const clock = animationClock()
  const advances = []
  scheduleNextFrame((now) => advances.push(now), { fps: 10, speed: 2, startedAt: 0, ...clock })
  clock.paint(20)
  clock.paint(40)
  assert.deepEqual(advances, [])
  clock.paint(50)
  clock.paint(60)
  assert.deepEqual(advances, [50])
})

test('sequential playback gives late frames a paint opportunity without burst catch-up or skipping', () => {
  const clock = animationClock()
  let index = 25
  scheduleNextFrame(() => { index = nextPlaybackIndex(index, 1000) }, { fps: 10, speed: 8, startedAt: 0, ...clock })
  clock.paint(500)
  assert.equal(index, 25)
  clock.paint(516)
  clock.paint(532)
  assert.equal(index, 26)
})

test('continuous playback catches up by skipping ahead after a stall', () => {
  const clock = animationClock()
  let index = 25
  let advanced = 0
  scheduleNextFrame((now, steps) => {
    advanced = steps
    index = nextPlaybackIndex(index, 1000, steps)
  }, { fps: 10, speed: 2, startedAt: 0, mode: 'continuous', ...clock })
  clock.paint(220)
  assert.equal(advanced, 4)
  assert.equal(index, 29)
})

test('pause or seek cancels scheduled advancement', () => {
  const clock = animationClock()
  const cancel = scheduleNextFrame(() => assert.fail('Advanced after cancellation'), { fps: 10, speed: 4, startedAt: 0, ...clock })
  clock.paint(16)
  cancel()
  clock.paint(1000)
})
