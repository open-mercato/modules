// Finding of 25 Oct: gateway-stripe talks to Stripe only through the `stripe` SDK, and its card read `Talks to: no hosts
// found in the code`; the consent step of the install prompt left the hosts line out. Known service SDKs among the
// dependencies are named now (lib/core/sdks.ts), in the card, the anatomy and the prompt.
import { describe, expect, it } from 'vitest'
import { sdkPhrase, sdkService, serviceSdks, servicesOf, talksToText } from '../../lib/core/sdks.ts'
import { promptParts, renderPrompt } from '../../lib/core/prompt.ts'
import { fixtureEntry, LOC, loadFixture } from './helpers.ts'

const fx = loadFixture()
const list = (h: string[]) => h.join(', ')

describe('service SDKs', () => {
  it('names the service of a known SDK by name or scope, and nothing else', () => {
    expect(sdkService('stripe')).toBe('Stripe')
    expect(sdkService('@stripe/stripe-js')).toBe('Stripe')
    expect(sdkService('@aws-sdk/client-s3')).toBe('AWS')
    expect(sdkService('@ai-sdk/openai')).toBe('OpenAI')
    expect(sdkService('stripe-utils')).toBeNull()
    expect(sdkService('zod')).toBeNull()
  })

  it('keeps the known SDKs of a dependency list, sorted', () => {
    expect(serviceSdks(['@open-mercato/core', 'stripe', 'zod', '@stripe/stripe-js'])).toEqual([
      '@stripe/stripe-js',
      'stripe',
    ])
    expect(servicesOf(['@ai-sdk/openai', '@ai-sdk/anthropic', 'openai', 'left-pad'])).toEqual(['OpenAI', 'Anthropic'])
  })

  it('says which services and through which packages', () => {
    expect(sdkPhrase(['stripe'])).toBe('Stripe through its SDK (stripe)')
    expect(sdkPhrase(['@ai-sdk/openai', '@ai-sdk/anthropic'])).toBe(
      'OpenAI and Anthropic through their SDKs (@ai-sdk/openai, @ai-sdk/anthropic)',
    )
    expect(sdkPhrase([])).toBeNull()
  })

  it('Talks to: hosts, SDKs, both, or no URL found', () => {
    expect(talksToText([], ['stripe'], list)).toBe('no URL in the code; Stripe through its SDK (stripe)')
    expect(talksToText(['api.ksef.mf.gov.pl'], [], list)).toBe('api.ksef.mf.gov.pl')
    expect(talksToText(['api.example.com'], ['@aws-sdk/client-s3'], list)).toBe(
      'api.example.com; AWS through its SDK (@aws-sdk/client-s3)',
    )
    expect(talksToText([], [], list)).toBe('no URL found in the code')
  })
})

describe('gateway-stripe', () => {
  const e = fixtureEntry(fx, LOC.stripe)

  it('carries its Stripe SDKs in the anatomy', () => {
    expect(e.anatomy?.lists.sdks).toEqual(['@stripe/react-stripe-js', '@stripe/stripe-js', 'stripe'])
  })

  it('the install prompt names Stripe in its consent step', () => {
    const p = promptParts(e, { site: 'https://open-mercato.github.io/modules', line: '0.9' })
    expect(p.services).toEqual(['Stripe'])
    // the fixture facts still list the docs host the real scan leaves out; the SDK's service follows the hosts
    expect(renderPrompt(p)).toContain(
      'It talks to: docs.stripe.com, Stripe (through its SDK). Tell me if that is unexpected.',
    )
    expect(renderPrompt({ ...p, hosts: [] })).toContain(
      'It talks to: Stripe (through its SDK). Tell me if that is unexpected.',
    )
  })

  it('a module with no known SDK has no sdks and no such step', () => {
    const k = fixtureEntry(fx, LOC.ksef)
    expect(k.anatomy?.lists).not.toHaveProperty('sdks')
    expect(promptParts(k, { site: 'https://open-mercato.github.io/modules' }).services).toEqual([])
  })
})
