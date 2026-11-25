// The buttons of a case study carousel (CaseSlider.astro): move the row one card back or forward, and back to the
// start after the last card, or to the end before the first, as the live page's Swiper does (`rewind`).
for (const slider of document.querySelectorAll<HTMLElement>('[data-case-slider]')) {
  const row = slider.querySelector<HTMLElement>('.swiper-wrapper')
  if (!row) continue
  for (const button of slider.querySelectorAll<HTMLButtonElement>('[data-step]')) {
    button.addEventListener('click', () => {
      const card = row.firstElementChild as HTMLElement | null
      if (!card) return
      const step = Number(button.dataset.step) * card.offsetWidth
      const end = row.scrollWidth - row.clientWidth
      const at = row.scrollLeft
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const left = step > 0 && at >= end - 2 ? 0 : step < 0 && at <= 2 ? end : at + step
      row.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' })
    })
  }
}
