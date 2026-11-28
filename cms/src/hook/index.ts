import type { Core } from '@strapi/strapi'
import { createDispatcher, PUBLISH_EVENTS } from './dispatch.ts'

// Strapi 5.64.0 reports publish, unpublish and delete of a document on its event hub: the document service repository
// (@strapi/core dist/services/document-service/repository.js) emits `entry.publish`, `entry.unpublish` and
// `entry.delete`, and the upload service (@strapi/upload dist/server/services/upload.js) `media.update` and
// `media.delete`, each through strapi.eventHub.emit; the built-in webhook runner listens to the same hub
// (dist/services/webhook-runner.js, eventHub.on). The hook listens there too (cms/README.md, Publish hook).
export function registerPublishHook(strapi: Core.Strapi): () => void {
  const env = process.env
  const dispatcher = createDispatcher({
    apiUrl: env.GITHUB_API_URL || 'https://api.github.com',
    token: env.GITHUB_DISPATCH_TOKEN || undefined,
    quietMs: Number(env.CMS_DISPATCH_QUIET_MS || 60_000),
    maxWaitMs: Number(env.CMS_DISPATCH_MAX_WAIT_MS || 300_000),
    log: strapi.log,
  })
  if (!env.GITHUB_DISPATCH_TOKEN) strapi.log.warn('publish hook: GITHUB_DISPATCH_TOKEN is not set, no dispatch is sent')
  const off = PUBLISH_EVENTS.map((event) =>
    strapi.eventHub.on(event, async (...args: unknown[]) => {
      const info = args[0] as { model?: string; uid?: string } | undefined
      const model = info?.uid ?? info?.model ?? ''
      // the site's content types and the media library; not the admin's own models
      if (event.startsWith('entry.') && !String(model).startsWith('api::')) return
      strapi.log.info(`publish hook: ${event} ${model}`)
      dispatcher.notify(event, model)
    }),
  )
  return () => {
    dispatcher.stop()
    for (const f of off) f()
  }
}
