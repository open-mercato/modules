// client:painted (spec 7.11): hydrate an island after the first paint instead of with the page's first requests.
// `client:painted` hydrates right after it (for client:load islands), `client:painted="idle"` in the next idle period
// after it (for client:idle islands: requestIdleCallback alone can run before the first frame), and
// `client:painted="visible"` once one of its children is on screen, watched from the first paint on (for
// client:visible islands the first screen shows). Registered in astro.config.ts.
import type { ClientDirective } from 'astro'
import { afterFirstPaint, idleAfterFirstPaint } from '../lib/after-paint.ts'

const painted: ClientDirective = (load, options, el) => {
  const hydrate = async (): Promise<void> => {
    const run = await load()
    await run()
  }
  const start = (): void => void hydrate()
  if (options.value === 'idle') idleAfterFirstPaint(start)
  else if (options.value === 'visible')
    afterFirstPaint(() => {
      // the island is `display: contents`, so its children are watched (as client:visible does)
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        start()
      })
      for (const child of el.children) io.observe(child)
    })
  else afterFirstPaint(start)
}

export default painted

declare module 'astro' {
  interface AstroClientDirectives {
    'client:painted'?: boolean | 'idle' | 'visible'
  }
}
