import type { Core } from '@strapi/strapi'
import { previewPath } from '../src/preview.ts'

// No `secrets.encryptionKey`: without it an API token is shown once at creation and no Super Admin can display it
// later (spec, API tokens and Q9). A lost token is replaced, as at rotation.
// The Preview button stays off until the draft build of Phase 5 exists (CMS_PREVIEW and CMS_PREVIEW_ORIGIN).
export default ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: { secret: env('ADMIN_JWT_SECRET') },
  apiToken: { salt: env('API_TOKEN_SALT') },
  transfer: { token: { salt: env('TRANSFER_TOKEN_SALT') } },
  flags: { nps: false, promoteEE: false },
  preview: {
    enabled: env.bool('CMS_PREVIEW', false),
    config: {
      allowedOrigins: env.array('CMS_PREVIEW_ORIGIN', []),
      async handler(uid: string, { documentId, status }: { documentId: string; status?: string }) {
        const doc = (await strapi.documents(uid as never).findOne({ documentId, status: status as never })) as {
          slug?: string
        } | null
        const path = previewPath(uid, doc?.slug)
        return path === null ? null : `${env.array('CMS_PREVIEW_ORIGIN', [])[0] ?? ''}${path}`
      },
    },
  },
})
