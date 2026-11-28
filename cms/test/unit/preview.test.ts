// The preview handler's paths (spec UI/UX, Preview; the handler stays off until Phase 5).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewPath } from '../../src/preview.ts'

test('maps each type with a page to its route, and the rest to none', () => {
  assert.equal(previewPath('api::page.page', 'home'), '/')
  assert.equal(previewPath('api::page.page', 'pricing'), '/pricing')
  assert.equal(previewPath('api::landing.landing', 'odoo-alternative'), '/odoo-alternative')
  assert.equal(previewPath('api::blog-post.blog-post', 'x'), '/blog-posts/x')
  assert.equal(previewPath('api::case-study.case-study', 'x'), '/case-studies/x')
  assert.equal(previewPath('api::partner.partner', 'x'), '/certified-partners/x')
  assert.equal(previewPath('api::job.job', 'x'), '/careers-jobs/x')
  assert.equal(previewPath('api::author.author', 'x'), null)
  assert.equal(previewPath('api::page.page', undefined), null)
})
