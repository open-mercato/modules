import type { Core } from '@strapi/strapi'
import { applyMediaSettings } from './bootstrap/media-settings.ts'

export default {
  register() {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await applyMediaSettings(strapi)
  },
}
