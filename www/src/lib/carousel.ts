// The video carousel of the main site (www site migration spec, UI/UX "Carousels"; replaces Swiper and jQuery): the
// customer video slider of the live home page (`.omr-carousel`, 25 Nov 2026), with its markup, classes and look
// (www/src/styles/webflow/carousel.css), and the same behavior (www/src/scripts/carousel.ts): one slide at a time with
// its neighbours faded, arrows, a 01/02 counter, the arrow keys, a swipe, endless in both directions, no motion under
// reduced motion, and a video that loads from youtube-nocookie.com only on a click. Without JavaScript every slide is in
// the page and reachable: the slides scroll sideways and each one links to its video on YouTube. No library.
// Ready for the home page of Phase 6 (www/src/components/Carousel.astro). Isomorphic.
import { YOUTUBE_ID } from './body-html.ts'

/** One video of the carousel. */
export interface CarouselVideo {
  /** The YouTube video id. */
  video: string
  /** Its title: the image's alt text and the button's label ("Play: <title>"). */
  title: string
  /** The poster, a file of the site (under /media or /files), not a YouTube address: nothing loads from YouTube before a click. */
  thumbnail: string
  width?: number
  height?: number
}

export interface CarouselProps {
  /** The region's label, e.g. "Customer videos". */
  label: string
  /** One video in words, for the arrows: "Previous customer video". */
  noun: string
  /** CTA placement of the play buttons (`stories` on the home page, lib/core/cta.ts). */
  placement: string
  items: readonly CarouselVideo[]
}

/** The player of a video, as the live slider loads it. */
export function carouselPlayerSrc(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`
}

/** The counter's number: two digits, as live ("01"). */
export function counterText(n: number): string {
  return String(n).padStart(2, '0')
}

/** The position of the next slide in the track with one clone at each end (0 and count + 1). */
export function stepPosition(position: number, step: number, count: number): number {
  return Math.min(count + 1, Math.max(0, position + step))
}

/** The real slide a clone stands for once the move ends (the last for clone 0, the first for clone count + 1). */
export function settledPosition(position: number, count: number): number {
  return position === 0 ? count : position === count + 1 ? 1 : position
}

/** The counter's value at a track position (1-based). */
export function slideNumber(position: number, count: number): number {
  return ((position - 1 + count) % count) + 1
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c)

const PLAY_ICON =
  '<span class="omr-play-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3l15 9-15 9z"/></svg></span>'
const PREV_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M18 12H6 M12 6L6 12L12 18"/></svg>'
const NEXT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 12H18 M12 6L18 12L12 18"/></svg>'

/** Checks the items: a carousel needs a video, each a YouTube id and a site file as poster. */
export function carouselErrors(p: CarouselProps): string[] {
  const errors: string[] = []
  if (p.items.length === 0) errors.push('a carousel needs at least one video')
  for (const [i, v] of p.items.entries()) {
    if (!YOUTUBE_ID.test(v.video)) errors.push(`item ${i + 1}: ${v.video} is not a YouTube id`)
    if (!/^\/(media|files)\//.test(v.thumbnail))
      errors.push(`item ${i + 1}: the poster ${v.thumbnail} is not under /media or /files`)
    if (v.title.trim() === '') errors.push(`item ${i + 1}: no title`)
  }
  return errors
}

/** The carousel's markup, the live one; the play buttons are links to YouTube until the script takes over. */
export function carouselHtml(p: CarouselProps): string {
  const errors = carouselErrors(p)
  if (errors.length > 0) throw new Error(`Carousel "${p.label}": ${errors.join('; ')}`)
  const count = p.items.length
  const slides = p.items
    .map((v, i) => {
      const size = v.width && v.height ? ` width="${v.width}" height="${v.height}"` : ''
      return (
        `<article class="omr-slide${i === 0 ? ' is-active' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${count}">` +
        `<div class="omr-media" data-video="${esc(v.video)}">` +
        `<a class="omr-play" href="https://www.youtube.com/watch?v=${esc(v.video)}" aria-label="Play: ${esc(v.title)}" data-cta-action="play_video">` +
        `<img src="${esc(v.thumbnail)}" alt="${esc(v.title)}" loading="lazy"${size}>${PLAY_ICON}</a></div></article>`
      )
    })
    .join('')
  const noun = esc(p.noun)
  return (
    `<div class="omr-carousel" role="region" aria-roledescription="carousel" aria-label="${esc(p.label)}" tabindex="0" data-carousel data-cta-placement="${esc(p.placement)}">` +
    `<div class="omr-window"><div class="omr-track">${slides}</div></div>` +
    `<button class="omr-arrow omr-prev" type="button" aria-label="Previous ${noun}">${PREV_ICON}</button>` +
    `<button class="omr-arrow omr-next" type="button" aria-label="Next ${noun}">${NEXT_ICON}</button>` +
    `<div class="omr-counter" aria-live="polite"><span data-current>${counterText(1)}</span><span class="omr-counter-line"></span><span data-total>${counterText(count)}</span></div>` +
    '</div>'
  )
}
