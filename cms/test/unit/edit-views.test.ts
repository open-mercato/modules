// The edit views of Step 2.3 without a server: webflowId hidden, the help texts on slug and on the first field.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editView } from '../../src/bootstrap/edit-views.ts'
import { PUBLISH, SLUG } from '../../src/bootstrap/texts.ts'

const meta = (label: string) => ({ edit: { label, description: '', visible: true }, list: { label } })
const conf = {
  settings: {},
  metadatas: { slug: meta('slug'), webflowId: meta('webflowId'), title: meta('title') },
  layouts: {
    edit: [
      [
        { name: 'slug', size: 6 },
        { name: 'webflowId', size: 6 },
      ],
      [{ name: 'webflowId', size: 6 }],
      [{ name: 'title', size: 6 }],
    ],
    list: ['slug'],
  },
}

test('hides webflowId and gives the slug its help text', () => {
  const v = editView(conf, ['slug', 'webflowId', 'title'])
  assert.equal(v.metadatas.webflowId?.edit.visible, false)
  assert.equal(v.metadatas.slug?.edit.description, `${SLUG} ${PUBLISH}`)
  assert.equal(v.metadatas.title?.edit.description, '')
  assert.deepEqual(v.layouts.edit, [[{ name: 'slug', size: 6 }], [{ name: 'title', size: 6 }]])
})

test('a single type without a slug carries the publish help on its first field', () => {
  const v = editView({ ...conf, metadatas: { title: meta('title') } }, ['title'])
  assert.equal(v.metadatas.title?.edit.description, PUBLISH)
})

test('every text ends with a period and holds no long dash', () => {
  for (const t of [PUBLISH, SLUG]) {
    assert.match(t, /\.$/)
    assert.doesNotMatch(t, /[–—]/)
  }
})
