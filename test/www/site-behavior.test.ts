// Consent banner, analytics and CTA events of the main site (www site migration spec, Phase 7, D9): the live cookie
// name and lifetime, the GA4 property with no Consent Mode, and the live CTA event names within 40 characters.
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  CTA_EVENT_LENGTH,
  GA_MEASUREMENT_ID,
  ctaParams,
  ctaSlug,
  navCtaAction,
  sentCtaEventName,
} from '../../lib/core/cta.ts'
import {
  MAIN_SITE_GITHUB,
  MAIN_SITE_LINKS,
  MAIN_SITE_MENUS,
  MAIN_SITE_SANDBOX,
  RUN_MENU,
} from '../../lib/core/main-site.ts'
import { CTA_EVENT_MAX } from '../../lib/schema/www-content.ts'
import { gaHeadScript, gtagSrc } from '../../www/src/lib/analytics.ts'
import {
  CONSENT_COOKIE,
  CONSENT_DAYS,
  CONSENT_TEXT,
  consentBannerHtml,
  consentCookie,
  hasConsent,
} from '../../www/src/lib/consent.ts'

describe('consent cookie', () => {
  it('is the live cookieAccepted=true for 180 days on the whole site', () => {
    expect(CONSENT_COOKIE).toBe('cookieAccepted')
    expect(CONSENT_DAYS).toBe(180)
    const now = new Date('2026-11-25T12:00:00Z')
    const cookie = consentCookie(now)
    expect(cookie).toBe('cookieAccepted=true; expires=Mon, 24 May 2027 12:00:00 GMT; path=/')
    const expires = new Date(/expires=([^;]+)/.exec(cookie)![1]!)
    expect((expires.getTime() - now.getTime()) / 864e5).toBe(180)
  })

  it('an answer given on Webflow counts, whatever its value or place among the cookies', () => {
    expect(hasConsent('')).toBe(false)
    expect(hasConsent('_ga=GA1.1.1; cookieAccepted=true')).toBe(true)
    expect(hasConsent('cookieAccepted=yes')).toBe(true)
    expect(hasConsent('xcookieAccepted=true; cookieAcceptedx=1')).toBe(false)
  })

  it('the banner has the live texts and Webflow markup', () => {
    const html = consentBannerHtml()
    expect(html).toContain(
      'We use essential cookies to remember your preferences. Learn how we handle data in our <a href="/terms-conditions" class="text-color-alternate">Privacy</a>.',
    )
    expect(html).toContain('<div cookie-banner="dismiss" class="cookie-banner_link-text">Dismiss</div>')
    expect(html).toContain('class="button is-secondary is-small w-inline-block"><div>Accept cookies</div></a>')
    expect(html.startsWith('<div class="cookie-banner_component">')).toBe(true)
    expect(CONSENT_TEXT.privacyHref).toBe('/terms-conditions')
  })
})

describe('Google Analytics', () => {
  it('loads G-64ZQGMNZKB as the live snippet does, with no Consent Mode call', () => {
    expect(GA_MEASUREMENT_ID).toBe('G-64ZQGMNZKB')
    const js = gaHeadScript()
    expect(js).toContain(JSON.stringify(gtagSrc()))
    expect(gtagSrc()).toBe('https://www.googletagmanager.com/gtag/js?id=G-64ZQGMNZKB')
    expect(js).toContain("gtag('js',new Date());gtag('config',\"G-64ZQGMNZKB\");")
    expect(js).not.toMatch(/consent/i)
    // the snippet runs as a classic script: it appends gtag.js and defines the global gtag that pushes to dataLayer
    const appended: { async?: boolean; src?: string }[] = []
    const ctx: Record<string, unknown> = {
      document: {
        createElement: () => ({}),
        head: { appendChild: (s: { async?: boolean; src?: string }) => appended.push(s) },
      },
    }
    ctx.window = ctx
    runInNewContext(js, ctx)
    expect(appended).toEqual([{ async: true, src: gtagSrc() }])
    expect((ctx.dataLayer as IArguments[]).map((a) => a[0])).toEqual(['js', 'config'])
  })
})

describe('CTA events', () => {
  it('slugs a label as the live map does', () => {
    expect(ctaSlug('For Agencies & Software Houses')).toBe('for_agencies_software_houses')
    expect(ctaSlug('  How to contribute ')).toBe('how_to_contribute')
    expect(ctaSlug('Case Studies')).toBe('case_studies')
  })

  it('cuts an event name at 40 characters, as the live tracker, and the schema agrees on the limit', () => {
    expect(CTA_EVENT_LENGTH).toBe(40)
    expect(CTA_EVENT_MAX).toBe(CTA_EVENT_LENGTH)
    expect(sentCtaEventName('nav', 'home')).toBe('cta_nav_home')
    const long = sentCtaEventName('nav', 'run_agents_and_skills_for_coding_agents')
    expect(long).toHaveLength(40)
    expect(long).toBe('cta_nav_run_agents_and_skills_for_coding')
  })

  it('names the navbar as the live map does, every name within 40 characters', () => {
    expect(navCtaAction({ kind: 'logo' })).toBe('home')
    expect(navCtaAction({ kind: 'menu-button' })).toBe('menu_toggle')
    expect(navCtaAction({ kind: 'menu', label: 'Product' })).toBe('product_menu')
    expect(navCtaAction({ kind: 'link', label: '1,914 GitHub stars', href: MAIN_SITE_GITHUB })).toBe('github')
    expect(navCtaAction({ kind: 'link', ...MAIN_SITE_SANDBOX, href: MAIN_SITE_SANDBOX.url })).toBe('launch_sandbox')
    const names = [
      ...[...MAIN_SITE_MENUS, RUN_MENU].map((m) => navCtaAction({ kind: 'menu', label: m.label })),
      ...MAIN_SITE_MENUS.flatMap((m) => m.items).map((i) =>
        navCtaAction({ kind: 'link', label: i.label, href: i.url }),
      ),
      ...RUN_MENU.items.map((i) => navCtaAction({ kind: 'link', label: i.label, href: i.path })),
      ...MAIN_SITE_LINKS.map((l) => navCtaAction({ kind: 'link', label: l.label, href: l.url })),
    ].map((a) => `cta_nav_${a}`)
    expect(names).toContain('cta_nav_product_menu')
    expect(names).toContain('cta_nav_crm')
    expect(names).toContain('cta_nav_for_agencies_software_houses')
    for (const n of names) expect(n.length, n).toBeLessThanOrEqual(CTA_EVENT_LENGTH)
    for (const n of names) expect(n).toMatch(/^cta_nav_[a-z0-9]+(?:_[a-z0-9]+)*$/)
  })

  it('sends the live parameters: the link without query, the video title without its prefix', () => {
    expect(ctaParams({ placement: 'nav', action: 'launch_sandbox', href: MAIN_SITE_SANDBOX.url })).toEqual({
      send_to: 'G-64ZQGMNZKB',
      cta_placement: 'nav',
      cta_action: 'launch_sandbox',
      link_url: 'https://app.openmercatocloud.com/signup',
    })
    expect(
      ctaParams({
        placement: 'stories',
        action: 'play_video',
        href: 'https://www.youtube.com/watch?v=xd9YxWFfAoE',
        label: 'Play: Vistula Valley',
      }),
    ).toEqual({
      send_to: 'G-64ZQGMNZKB',
      cta_placement: 'stories',
      cta_action: 'play_video',
      video_title: 'Vistula Valley',
    })
    expect(ctaParams({ placement: 'nav', action: 'product_menu' })).toEqual({
      send_to: 'G-64ZQGMNZKB',
      cta_placement: 'nav',
      cta_action: 'product_menu',
    })
  })
})
