// The words of the Install card by kind (Piotr, 28 Oct: the web-research page showed `yarn add` and `Restart the
// app.`, which does not turn a module on). Written once from the kind, never per package.
import { describe, expect, test } from 'vitest'
import { installAltLine, installLine, installWords } from '../../site/src/components/catalog/cards.ts'

describe('Install card words (Piotr, 28 Oct)', () => {
  test('a module is added, registered and gets its tables, then the app restarts', () => {
    expect(installWords('module', true, { generate: true, migrate: true })).toEqual({
      lead: null,
      first: 'Run this in your app folder. It adds the module, registers it and creates its database tables.',
      restart: true,
    })
    expect(installWords('module', true, { generate: true, migrate: false }).first).toBe(
      'Run this in your app folder. It adds the module and registers it.',
    )
  })

  test('a provider that ships modules reads as a module', () => {
    expect(installWords('provider', true, { generate: true, migrate: false })).toEqual({
      lead: null,
      first: 'Run this in your app folder. It adds the module and registers it.',
      restart: true,
    })
  })

  test('a library says it is no module, with nothing to turn on and no restart', () => {
    const w = installWords('library', false, { generate: false, migrate: false })
    expect(w.lead).toBe('A library other modules use, not a module. There is nothing to turn on in the app.')
    expect(w.first).toBe('Run this in your app folder. It adds the library.')
    expect(w.first).not.toMatch(/adds the module/)
    expect(w.restart).toBe(false)
  })

  test('a provider without modules says yarn generate registers it, and its command runs it', () => {
    const w = installWords('provider', false, { generate: true, migrate: false })
    expect(w.lead).toBe(
      'A provider for the modules that use it, not a module of its own. After yarn add, yarn generate registers it so those modules can use it.',
    )
    expect(w.first).toBe('Run this in your app folder. It adds the provider and registers it.')
    expect(w.restart).toBe(true)
    // the install plan runs yarn generate for a provider (lib/core/plan.ts), so the line the card copies has it
    expect(
      installLine('yarn add @open-mercato/web-research-model@0.9.0', ['yarn generate'], {
        generate: true,
        migrate: false,
      }),
    ).toBe('yarn add @open-mercato/web-research-model@0.9.0 && yarn generate')
  })

  test('the create-mercato-module line ends like the main command (review of 28 Oct)', () => {
    const cli = 'yarn mercato module add @fastwhitecat/integration-ksef-direct@0.1.8 --allow-third-party'
    const cmm = 'npx create-mercato-module install @fastwhitecat/integration-ksef-direct@0.1.8'
    const tail = (line: string, start: string): string => line.slice(start.length)
    for (const then of [['yarn generate', 'yarn db:migrate'], ['yarn generate'], null])
      for (const migrate of [true, false]) {
        const fallback = { generate: true, migrate }
        const main = installLine(cli, then, fallback)
        const alt = installAltLine(cli, cmm, then, fallback)
        expect(alt).not.toBeNull()
        expect(alt?.startsWith(cmm)).toBe(true)
        expect(tail(alt ?? '', cmm)).toBe(tail(main, cli))
        expect(alt).toMatch(/ && yarn generate( && yarn db:migrate)?$/)
      }
    expect(installAltLine(cli, cmm, ['yarn generate', 'yarn db:migrate'], { generate: false, migrate: false })).toBe(
      `${cmm} && yarn generate && yarn db:migrate`,
    )
    // no create-mercato-module command, or the same one as the main command: nothing under it
    expect(installAltLine(cli, null, null, { generate: true, migrate: true })).toBeNull()
    expect(installAltLine(cli, cli, null, { generate: true, migrate: true })).toBeNull()
  })

  test('an adapter command that adds its peer library says so (sandbox test of 28 Oct)', () => {
    expect(installWords('provider', false, { generate: true, migrate: false }, 1).first).toBe(
      'Run this in your app folder. It adds the provider with the library it needs and registers it.',
    )
    expect(installWords('provider', false, { generate: true, migrate: false }, 2).first).toBe(
      'Run this in your app folder. It adds the provider with the libraries it needs and registers it.',
    )
    // a module's command adds the packages its plan installs first (audit of 29 Oct, R3), and says so; none: no words
    expect(installWords('module', true, { generate: true, migrate: false }, 1).first).toBe(
      'Run this in your app folder. It adds the module with the package it needs and registers it.',
    )
    expect(installWords('module', true, { generate: true, migrate: false }).first).toBe(
      'Run this in your app folder. It adds the module and registers it.',
    )
    expect(
      installLine(
        'yarn add @open-mercato/web-research@0.9.0 @open-mercato/web-research-model@0.9.0',
        ['yarn generate'],
        { generate: true, migrate: false },
      ),
    ).toBe('yarn add @open-mercato/web-research@0.9.0 @open-mercato/web-research-model@0.9.0 && yarn generate')
  })

  test('every line gets the tail of its plan, never twice (review of 28 Oct)', () => {
    // the commands of the other versions: the add command, then what that line's plan runs
    expect(
      installLine(
        'yarn mercato module add @open-mercato/checkout@0.8.0',
        ['yarn generate', 'yarn db:migrate (ask the user first)'],
        {
          generate: true,
          migrate: false,
        },
      ),
    ).toBe('yarn mercato module add @open-mercato/checkout@0.8.0 && yarn generate && yarn db:migrate')
    // a line whose plan installs nothing (a new app has it in both presets) gets no tail
    expect(
      installLine(
        'yarn add @open-mercato/events@0.9.0',
        ['An app from the empty preset registers events too: nothing to install.'],
        {
          generate: true,
          migrate: true,
        },
      ),
    ).toBe('yarn add @open-mercato/events@0.9.0')
    // a command that already runs a step does not get it again
    expect(
      installLine(
        'echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate',
        ['yarn generate', 'yarn db:migrate (ask the user first)'],
        {
          generate: true,
          migrate: true,
        },
      ),
    ).toBe('echo OM_ENABLE_ENTERPRISE_MODULES=true >> .env && yarn generate && yarn db:migrate')
  })

  test('a tool runs in a terminal, with no lead and no restart', () => {
    expect(installWords('tool', false, { generate: false, migrate: false })).toEqual({
      lead: null,
      first: 'Run this in a terminal.',
      restart: false,
    })
  })

  test('no sentence has a long dash or an exclamation mark', () => {
    for (const kind of ['module', 'provider', 'library', 'tool'] as const)
      for (const has of [true, false]) {
        const w = installWords(kind, has, { generate: true, migrate: true })
        for (const t of [w.lead ?? '', w.first]) expect(t).not.toMatch(/[–—!]/)
      }
  })
})
