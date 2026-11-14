// axe (spec 7.9, 12.2 WP16): 0 serious and 0 critical violations on /, the KSeF page, /compat, /submit and
// /for-agents, at desktop and phone width, in the one light theme (13 Nov, like openmercato.com). Minor and moderate
// findings are listed in the report as annotations, not failures.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { DESKTOP, PAGES, phone, themed, url } from './env.ts'

const FORMS = { desktop: DESKTOP, mobile: phone(390) } as const

for (const p of PAGES)
  for (const form of ['desktop', 'mobile'] as const)
    test(`axe ${p.name} ${form}`, async ({ browser }, info) => {
      // axe reads every node: on /compat (two matrices, about 0.5 MB of HTML) one pass takes 41 to 45 s on the shared
      // server with one worker, so the default 60 s runs out when two workers share the machine
      test.setTimeout(180_000)
      const ctx = await themed(browser, 'light', FORMS[form])
      const page = await ctx.newPage()
      await page.goto(url(p.path), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      // islands hydrate on load or idle; give them their first render before axe reads the tree
      await page.waitForLoadState('networkidle')
      const result = await new AxeBuilder({ page }).analyze()
      const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      const soft = result.violations.filter((v) => !bad.includes(v))
      for (const v of soft)
        info.annotations.push({ type: `axe ${v.impact}`, description: `${v.id}: ${v.nodes.length} node(s)` })
      const report = bad.map(
        (v) =>
          `${v.impact} ${v.id} (${v.help}): ${v.nodes
            .slice(0, 5)
            .map((n) => n.target.join(' '))
            .join(' | ')}${v.nodes.length > 5 ? ` and ${v.nodes.length - 5} more` : ''}`,
      )
      expect(report, `serious or critical axe violations on ${p.path} (${form})`).toEqual([])
      await ctx.close()
    })
