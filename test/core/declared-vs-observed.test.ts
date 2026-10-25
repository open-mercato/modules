// SIG-DEC (signals.declaredVsObserved): Built for against Verified on. A version without Open Mercato peers declares
// nothing, and an entry the night never installs (provider, library, tool, enterprise) has no receipt to compare;
// both read `Built for 0.8, 0.9, next; verified on no line.` before (finding of 25 Oct: 43 of 59 cards mismatched).
import { describe, expect, it } from 'vitest'
import { declaredVsObservedSignal } from '../../lib/core/signals.ts'

describe('declaredVsObservedSignal', () => {
  it('compares the lines a peer range accepts with the verified lines', () => {
    expect(declaredVsObservedSignal(['0.9'], ['0.9', 'next'], null, null, { peers: 'range' })).toEqual({
      status: 'mismatch',
      notes: ['Built for 0.9; verified on 0.9, next.'],
    })
    expect(declaredVsObservedSignal(['0.9', 'next'], ['0.9', 'next'], null, null, { peers: 'range' })).toEqual({
      status: 'match',
      notes: [],
    })
  })

  it('names a missing peer range instead of claiming every line', () => {
    expect(declaredVsObservedSignal([], ['0.9', 'next'], null, null, { peers: 'none', installed: true })).toEqual({
      status: 'mismatch',
      notes: ['No Open Mercato peer range; verified on 0.9, next.'],
    })
  })

  it('has nothing to compare for an entry the catalog never installs', () => {
    expect(declaredVsObservedSignal([], [], null, null, { peers: 'none', installed: false })).toEqual({
      status: 'match',
      notes: [],
    })
  })

  it('keeps the old reading without options (callers that pass none)', () => {
    expect(declaredVsObservedSignal(['0.8'], [], null, null)).toEqual({
      status: 'mismatch',
      notes: ['Built for 0.8; verified on no line.'],
    })
  })
})
