import type { Core } from '@strapi/strapi'

export default ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // the public address of the admin and the API (Q1: https://cms.openmercato.com), empty for a local instance
  url: env('PUBLIC_URL', ''),
  app: { keys: env.array('APP_KEYS') },
})
