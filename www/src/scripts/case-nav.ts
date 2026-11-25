// The case study pages' navbar (their om-case-navbar-scroll code on the live site): the bar takes the page's
// background at the top and turns white once the page scrolls (www/src/styles/webflow/pages.css).
function update(): void {
  document.body.classList.toggle('om-case-nav-scrolled', window.scrollY > 12)
}
update()
window.addEventListener('scroll', update, { passive: true })
window.addEventListener('pageshow', update)
