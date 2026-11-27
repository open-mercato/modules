import type { Core } from '@strapi/strapi'

// No `secrets.encryptionKey`: without it an API token is shown once at creation and no Super Admin can display it
// later (spec, API tokens and Q9). A lost token is replaced, as at rotation.
export default ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: { secret: env('ADMIN_JWT_SECRET') },
  apiToken: { salt: env('API_TOKEN_SALT') },
  transfer: { token: { salt: env('TRANSFER_TOKEN_SALT') } },
  flags: { nps: false, promoteEE: false },
})
