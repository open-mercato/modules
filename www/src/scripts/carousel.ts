// The video carousel's behavior (www/src/lib/carousel.ts), the live home slider's script without jQuery or Swiper: a
// clone of the last slide before the first and of the first after the last make it endless; the track moves by one
// slide width plus the 24 px gap; the arrows, the arrow keys and a swipe of more than 50 px move it; a move under
// reduced motion lands at once. A click on the active slide's video swaps the link for the youtube-nocookie.com player;
// a click on a faded neighbour brings it forward first; a modified click (new tab) opens YouTube. Moving stops a video.
import { carouselPlayerSrc, counterText, settledPosition, slideNumber, stepPosition } from '../lib/carousel.ts'

const MOVE_MS = 420
const SWIPE_PX = 50

function setUp(carousel: HTMLElement): void {
  const track = carousel.querySelector<HTMLElement>('.omr-track')
  if (!track || carousel.dataset.ready) return
  const original = [...track.children] as HTMLElement[]
  const count = original.length
  if (count === 0) return
  carousel.dataset.ready = 'true'
  const clone = (el: HTMLElement): HTMLElement => {
    const c = el.cloneNode(true) as HTMLElement
    c.setAttribute('aria-hidden', 'true')
    c.inert = true
    return c
  }
  track.prepend(clone(original[count - 1]!))
  track.append(clone(original[0]!))
  const slides = [...track.children] as HTMLElement[]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const current = carousel.querySelector('[data-current]')
  const total = carousel.querySelector('[data-total]')
  let position = 1
  let busy = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = (slide: HTMLElement): void => {
    slide.querySelector('iframe')?.remove()
    const play = slide.querySelector<HTMLElement>('.omr-play')
    if (play) play.hidden = false
  }
  const paint = (): void => {
    track.style.transform = `translateX(calc(-${position} * (100% + 24px)))`
    slides.forEach((s, i) => {
      const active = i === position
      s.classList.toggle('is-active', active)
      // the clones stay hidden from assistive technology and out of the tab order
      if (i === 0 || i === count + 1) return
      s.setAttribute('aria-hidden', String(!active))
      const play = s.querySelector<HTMLElement>('.omr-play')
      if (play) play.tabIndex = active ? 0 : -1
    })
    if (current) current.textContent = counterText(slideNumber(position, count))
    if (total) total.textContent = counterText(count)
  }
  const jump = (): void => {
    track.style.transition = 'none'
    slides.forEach((s) => (s.style.transition = 'none'))
    paint()
    track.getBoundingClientRect()
    requestAnimationFrame(() => {
      track.style.transition = ''
      slides.forEach((s) => (s.style.transition = ''))
    })
  }
  const settle = (): void => {
    clearTimeout(timer)
    const real = settledPosition(position, count)
    if (real !== position) {
      position = real
      jump()
    }
    busy = false
  }
  const show = (next: number): void => {
    if (busy || next === position) return
    busy = true
    slides.forEach(stop)
    position = next
    paint()
    if (reduce.matches) settle()
    else timer = setTimeout(settle, MOVE_MS)
  }
  const step = (by: number): void => show(stepPosition(position, by, count))

  jump()
  carousel.querySelector('.omr-prev')?.addEventListener('click', () => step(-1))
  carousel.querySelector('.omr-next')?.addEventListener('click', () => step(1))
  carousel.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    step(e.key === 'ArrowRight' ? 1 : -1)
  })
  let touchX = 0
  carousel.addEventListener('touchstart', (e) => (touchX = e.changedTouches[0]?.clientX ?? 0), { passive: true })
  carousel.addEventListener(
    'touchend',
    (e) => {
      const d = (e.changedTouches[0]?.clientX ?? touchX) - touchX
      if (Math.abs(d) > SWIPE_PX) step(d < 0 ? 1 : -1)
    },
    { passive: true },
  )
  carousel.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const play = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('.omr-play')
    const slide = play?.closest<HTMLElement>('.omr-slide')
    const media = play?.closest<HTMLElement>('.omr-media')
    if (!play || !slide || !media) return
    e.preventDefault()
    if (!slide.classList.contains('is-active')) {
      show(slides.indexOf(slide))
      return
    }
    const frame = document.createElement('iframe')
    frame.src = carouselPlayerSrc(media.dataset.video ?? '')
    frame.title = (play.getAttribute('aria-label') ?? '').replace(/^Play:\s*/, '')
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
    frame.allowFullscreen = true
    frame.referrerPolicy = 'strict-origin-when-cross-origin'
    play.hidden = true
    media.append(frame)
  })
}

for (const c of document.querySelectorAll<HTMLElement>('[data-carousel]')) setUp(c)
