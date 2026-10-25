// "After the first paint" for scripts the first screen does not need (spec 7.11): the island code of the Ask bar and
// the Registry, and WebMCP. On a slow phone their requests otherwise share the first round trips with the HTML, the
// CSS and the fonts, and the first paint waits for them; started after it, the text paints first and the islands
// hydrate a frame later. Used by the client:painted directive (site/src/directives/painted.ts) and the layout.

/** Runs `cb` once, in a task after the first contentful paint (a frame later where Paint Timing is missing). */
export function afterFirstPaint(cb: () => void): void {
  let done = false
  const run = (): void => {
    if (done) return
    done = true
    setTimeout(cb)
  }
  const twoFrames = (): void => {
    // the first callback runs before the first frame is painted, the second one after it
    requestAnimationFrame(() => requestAnimationFrame(run))
  }
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('paint')) {
      const po = new PerformanceObserver((list) => {
        if (!list.getEntriesByName('first-contentful-paint').length) return
        po.disconnect()
        run()
      })
      po.observe({ type: 'paint', buffered: true })
    } else twoFrames()
  } catch {
    twoFrames()
  }
  // a tab opened in the background paints nothing until it is shown: never leave the page without its scripts
  setTimeout(run, 3000)
}

/** `afterFirstPaint`, then the next idle period (the old client:idle timing, never before the first paint). */
export function idleAfterFirstPaint(cb: () => void): void {
  afterFirstPaint(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(cb)
    else setTimeout(cb, 200)
  })
}
