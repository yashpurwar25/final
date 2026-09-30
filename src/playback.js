export function nextPlaybackIndex(index, count, steps = 1) {
  return count <= 1 ? 0 : (index + steps) % count
}

export function scheduleNextFrame(onAdvance, {
  fps, speed, startedAt, mode = 'sequential',
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
}) {
  const intervalMs = 1000 / (fps * speed)
  const refreshBudgetMs = 1000 / 60
  let deadline = startedAt + intervalMs
  let cancelled = false
  let handle
  const tick = (now) => {
    if (cancelled) return
    if (now >= deadline && mode === 'continuous') {
      onAdvance(now, Math.max(1, Math.floor((now - deadline) / intervalMs) + 1))
      return
    }
    // If rendering or decoding was badly late, re-arm from this paint so playback
    // stays sequential instead of jumping on the first frame after a stall.
    if (now - deadline > refreshBudgetMs) {
      deadline = now + intervalMs
      handle = requestFrame(tick)
      return
    }
    if (now >= deadline) {
      onAdvance(now, 1)
      return
    }
    handle = requestFrame(tick)
  }
  handle = requestFrame(tick)
  return () => {
    cancelled = true
    cancelFrame(handle)
  }
}
