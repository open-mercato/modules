// The tools switch of the module browser, carried by the category chips (live review of 30 Oct, item 11): /c/devtools
// opens with tools and libraries shown and its `All` chip counted them (45), while the home page it led to opened
// without them (40). A chip now names the switch for its page when it differs from that page's default, so the count
// on the chip is the count the page shows. Never `?tools=0`: a chip of a tools-only category is hidden while the switch
// is off, and its page with the switch off would be an empty grid. Isomorphic and tiny: the browser's script imports it.

/** A page opens with tools shown when its category has tools and no module (devtools). */
export const toolsDefaultOf = (c: { modules: number; all: number }): boolean => c.modules === 0 && c.all > 0

/** `?tools=1` when the switch is on and the target page opens with it off, else nothing. */
export const toolsQuery = (targetDefault: boolean, tools: boolean): string =>
  tools && !targetDefault ? '?tools=1' : ''
