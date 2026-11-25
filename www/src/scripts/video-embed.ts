// VideoEmbed (www/src/components/blog/VideoEmbed.astro and the lite-video bodies of www/src/lib/body-html.ts): a
// click on the link of a video swaps it for the youtube-nocookie.com player, so nothing loads from YouTube until the
// reader asks for it. Without JavaScript, or with a modified click (a new tab), the link opens the video on YouTube.
import { videoPlayerSrc, YOUTUBE_ID } from '../lib/body-html.ts'

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return
  const link = (event.target as Element | null)?.closest?.('.video-embed__link')
  const figure = link?.closest('.video-embed')
  if (!link || !(figure instanceof HTMLElement)) return
  const id = figure.dataset.videoId ?? ''
  if (!YOUTUBE_ID.test(id)) return
  event.preventDefault()
  const frame = document.createElement('iframe')
  frame.className = 'video-embed__player'
  frame.src = videoPlayerSrc(id)
  frame.title = figure.dataset.videoTitle || 'YouTube video'
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
  frame.allowFullscreen = true
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  link.replaceWith(frame)
  frame.focus()
})
