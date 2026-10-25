// /radar text layer over WP11's RadarTables (not a route: the leading underscore). A load-bearing API that also
// changed since the base release is the strongest finding of the radar: its meter row gets the change chip and the
// block header counts them ("1 load-bearing API changed"). Runs on the rendered HTML at build time.
// Move into RadarTables when WP11 takes it; the page then drops this pass.

const text = (html: string): string => html.replace(/<[^>]+>/g, '')

export interface MarkResult {
  html: string
  /** Load-bearing rows marked as changed. */
  marked: number
}

/** Marks the meter rows whose symbol is in `changed` (`symbol -> change`). */
export function markChangedLoadBearing(html: string, changed: ReadonlyMap<string, string>): MarkResult {
  let marked = 0
  let out = html.replace(/<li class="radar__meter"([^>]*)>([\s\S]*?)<\/li>/g, (whole, attrs: string, body: string) => {
    const name = /<code class="radar__name"[^>]*>([\s\S]*?)<\/code>/.exec(body)?.[1]
    const pkg = /<code class="radar__pkg"[^>]*>([\s\S]*?)<\/code>/.exec(body)?.[1]
    if (name === undefined) return whole
    const symbol = pkg === undefined ? text(name) : `${text(pkg)}#${text(name)}`
    const change = changed.get(symbol)
    if (!change) return whole
    marked += 1
    const chip = `<span class="radar__chg radar__chg--${change} rd-chg">${change}</span>`
    return `<li class="radar__meter rd-meter--changed"${attrs}>${body.replace(/(<\/code>)(?![\s\S]*<\/code>)/, `$1${chip}`)}</li>`
  })
  if (marked > 0)
    out = out.replace(
      /(<h3 id="rt-load"[^>]*>Load-bearing APIs)(<\/h3>)/,
      `$1 <span class="radar__n rd-n--changed">${marked} changed</span>$2`,
    )
  return { html: out, marked }
}
