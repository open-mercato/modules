// The settings the bootstrap writes at every start (spec A7, Step 2.1), without a server.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MEDIA_SETTINGS, mediaSettings } from '../../src/bootstrap/media-settings.ts'

test('forces the settings of A7 off and keeps the other stored settings', () => {
  const stored = { sizeOptimization: true, responsiveDimensions: true, autoOrientation: false, aiMetadata: true, x: 1 }
  const { value, changed } = mediaSettings(stored)
  assert.deepEqual(value, { ...MEDIA_SETTINGS, x: 1 })
  assert.deepEqual(changed, ['responsiveDimensions', 'sizeOptimization', 'aiMetadata'])
})

test('changes nothing when every setting is off already', () => {
  assert.deepEqual(mediaSettings({ ...MEDIA_SETTINGS }).changed, [])
})

test('writes all of them on a fresh store', () => {
  const { value, changed } = mediaSettings(null)
  assert.deepEqual(value, MEDIA_SETTINGS)
  assert.equal(changed.length, Object.keys(MEDIA_SETTINGS).length)
})
