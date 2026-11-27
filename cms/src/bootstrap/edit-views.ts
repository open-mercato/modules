import type { Core } from '@strapi/strapi'
import { PUBLISH, SLUG } from './texts.ts'

// The edit views of the content types (spec, UI/UX): `webflowId` hidden, the help text of every `slug` and the
// publish help on every type. The order of the fields is the order of schema.json, which is the order of the files.
// Written at every start, so a change in the admin's view settings does not keep a hidden field visible.

interface Configuration {
  settings: Record<string, unknown>
  metadatas: Record<string, { edit: Record<string, unknown>; list: Record<string, unknown> }>
  layouts: { edit: { name: string; size: number }[][]; list: string[] }
}

/** The configuration of a type with the edit view of the spec; the first field of the edit view carries the help. */
export function editView(conf: Configuration, attributes: readonly string[]): Configuration {
  const metadatas = { ...conf.metadatas }
  const first = attributes.find((a) => a !== 'webflowId' && metadatas[a])
  for (const name of attributes) {
    const m = metadatas[name]
    if (!m) continue
    const edit = { ...m.edit }
    if (name === 'webflowId') edit.visible = false
    if (name === 'slug') edit.description = `${SLUG} ${PUBLISH}`
    else if (name === first) edit.description = PUBLISH
    metadatas[name] = { ...m, edit }
  }
  const editRows = conf.layouts.edit
    .map((row) => row.filter((f) => f.name !== 'webflowId'))
    .filter((row) => row.length > 0)
  return { ...conf, metadatas, layouts: { ...conf.layouts, edit: editRows } }
}

export async function applyEditViews(strapi: Core.Strapi): Promise<void> {
  const service = strapi.plugin('content-manager').service('content-types')
  for (const [uid, ct] of Object.entries(strapi.contentTypes)) {
    if (!uid.startsWith('api::')) continue
    const conf = (await service.findConfiguration({ uid })) as Configuration & { uid: string }
    const { uid: _uid, ...rest } = conf
    const next = editView(rest, Object.keys(ct.attributes))
    if (JSON.stringify(next) !== JSON.stringify(rest)) await service.updateConfiguration({ uid }, next)
  }
}
