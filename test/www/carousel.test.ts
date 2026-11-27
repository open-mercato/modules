// The video carousel (www site migration spec, UI/UX "Carousels", Phase 7): without JavaScript every item is in the
// page, reachable, and links to its video; nothing loads from YouTube before a click; the endless track lands on the
// right slide; the no-JS fallback shows every slide.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  carouselErrors,
  carouselHtml,
  carouselPlayerSrc,
  counterText,
  settledPosition,
  slideNumber,
  stepPosition,
  type CarouselProps,
} from '../../www/src/lib/carousel.ts'
import { ROOT } from '../emit/helpers.ts'

const props: CarouselProps = {
  label: 'Customer videos',
  noun: 'customer video',
  placement: 'stories',
  items: [
    { video: 'xd9YxWFfAoE', title: 'Vistula Valley', thumbnail: '/files/stories/vistula-valley.jpg' },
    { video: 'YBV5pNGCCpw', title: 'MDM NT', thumbnail: '/files/stories/mdm-nt.jpg', width: 480, height: 360 },
    { video: 'GD2ToD1jmLE', title: 'Q&A "live" <session>', thumbnail: '/media/home/qa.jpg' },
  ],
}

describe('carousel without JavaScript', () => {
  const html = carouselHtml(props)

  it('lists every item, in order, each a link to its video on YouTube with its poster and title', () => {
    const slides = [
      ...html.matchAll(/<article class="omr-slide[^"]*"[^>]*aria-label="(\d+) of (\d+)">([\s\S]*?)<\/article>/g),
    ]
    expect(slides.map((m) => `${m[1]} of ${m[2]}`)).toEqual(['1 of 3', '2 of 3', '3 of 3'])
    props.items.forEach((item, i) => {
      const body = slides[i]![3]!
      expect(body).toContain(`href="https://www.youtube.com/watch?v=${item.video}"`)
      expect(body).toContain(`src="${item.thumbnail}"`)
      expect(body).toContain('data-cta-action="play_video"')
    })
    expect(html).toContain('aria-label="Play: Q&amp;A &quot;live&quot; &lt;session&gt;"')
    expect(html).not.toMatch(/\shidden[\s>=]/)
    expect(html).toContain('data-cta-placement="stories"')
  })

  it('loads nothing from YouTube before a click: no iframe, no YouTube image', () => {
    expect(html).not.toContain('<iframe')
    expect(html).not.toMatch(/ytimg|youtube-nocookie/)
  })

  it('has the live controls and counter', () => {
    expect(html).toContain('role="region" aria-roledescription="carousel" aria-label="Customer videos" tabindex="0"')
    expect(html).toContain('aria-label="Previous customer video"')
    expect(html).toContain('aria-label="Next customer video"')
    expect(html).toContain(
      '<span data-current>01</span><span class="omr-counter-line"></span><span data-total>03</span>',
    )
  })

  it('the stylesheet shows every slide and lets the track scroll when the script has not run', () => {
    const css = readFileSync(join(ROOT, 'www', 'src', 'styles', 'webflow', 'carousel.css'), 'utf8')
    expect(css).toMatch(/\.omr-carousel:not\(\[data-ready\]\) \.omr-window \{\s*overflow-x: auto;/)
    expect(css).toMatch(/\.omr-carousel:not\(\[data-ready\]\) \.omr-slide \{\s*opacity: 1;/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.omr-track,/)
  })

  it('refuses an item a page could not show', () => {
    expect(carouselErrors({ ...props, items: [] })).toEqual(['a carousel needs at least one video'])
    expect(() =>
      carouselHtml({ ...props, items: [{ video: 'nope', title: '', thumbnail: 'https://i.ytimg.com/x.jpg' }] }),
    ).toThrow(/not a YouTube id.*not under \/media or \/files.*no title/)
  })
})

describe('carousel behavior', () => {
  it('plays from youtube-nocookie.com as the live slider', () => {
    expect(carouselPlayerSrc('xd9YxWFfAoE')).toBe(
      'https://www.youtube-nocookie.com/embed/xd9YxWFfAoE?autoplay=1&rel=0&playsinline=1',
    )
  })

  it('is endless: the clones at both ends land on the last and the first slide', () => {
    const count = 3
    expect(stepPosition(1, -1, count)).toBe(0)
    expect(settledPosition(0, count)).toBe(3)
    expect(stepPosition(3, 1, count)).toBe(4)
    expect(settledPosition(4, count)).toBe(1)
    expect(settledPosition(2, count)).toBe(2)
    expect([0, 1, 2, 3, 4].map((p) => slideNumber(p, count))).toEqual([3, 1, 2, 3, 1])
    expect(counterText(slideNumber(0, count))).toBe('03')
  })
})
