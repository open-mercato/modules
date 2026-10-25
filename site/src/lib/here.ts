// A page served elsewhere than the site it was built for (a preview host, `astro preview`, a sandbox) points its
// copy commands, its Markdown twin links and its Claude Code prompts at the pages a visitor can open there (finding
// of 25 Oct: the preview told visitors to `curl open-mercato.github.io/modules/llms.txt`, which does not exist yet).
// The canonical and Open Graph tags keep the configured site. On the configured host the script does nothing.

/** `text` with every form of the site root `from` (as is, URL-encoded, without the scheme) replaced by `to`. */
export function rewriteSite(text: string, from: string, to: string): string {
  if (from === to) return text
  const bare = (u: string): string => u.replace(/^https?:\/\//, '')
  return [
    [from, to],
    [encodeURIComponent(from), encodeURIComponent(to)],
    [bare(from), bare(to)],
  ].reduce((t, [a, b]) => t.split(a as string).join(b as string), text)
}

/**
 * Inline script for the end of <body>: `site` is the configured site root with its base path, no trailing slash
 * (`https://open-mercato.github.io/modules`), `base` the base path (`/modules`). It rewrites `data-copy`, `href`,
 * `title` and `aria-label`, and the text of command chips and `[data-site-text]`, now and in islands that render
 * later.
 */
export function hereScript(site: string, base: string): string {
  const fn = rewriteSite.toString()
  return `(function () {
  var from = ${JSON.stringify(site.replace(/\/+$/, ''))}
  if (!/^https?:$/.test(location.protocol)) return
  var to = location.origin + ${JSON.stringify(base.replace(/\/+$/, ''))}
  if (to === from) return
  var rewrite = ${fn}
  var SEL = '[data-copy],a[href],.cmd__text,[data-site-text]'
  var ATTRS = ['data-copy', 'href', 'title', 'aria-label']
  function fix(root) {
    var els = root.querySelectorAll ? [].slice.call(root.querySelectorAll(SEL)) : []
    if (root.matches && root.matches(SEL)) els.unshift(root)
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      for (var k = 0; k < ATTRS.length; k++) {
        var v = el.getAttribute(ATTRS[k])
        if (v === null) continue
        var v2 = rewrite(v, from, to)
        if (v2 !== v) el.setAttribute(ATTRS[k], v2)
      }
      if (el.matches('.cmd__text,[data-site-text]')) {
        var t = el.textContent || '', t2 = rewrite(t, from, to)
        if (t2 !== t) el.textContent = t2
      }
    }
  }
  fix(document)
  if (typeof MutationObserver === 'function')
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i]
        if (m.type === 'attributes') fix(m.target)
        else for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) fix(m.addedNodes[j])
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS })
})()`
}
