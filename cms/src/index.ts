import type { Core } from '@strapi/strapi'
import { closePublicAccess } from './bootstrap/access.ts'
import { seedAdmins } from './bootstrap/admins.ts'
import { applyEditViews } from './bootstrap/edit-views.ts'
import { applyMediaSettings } from './bootstrap/media-settings.ts'

export default {
  register() {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await applyMediaSettings(strapi)
    await closePublicAccess(strapi)
    await seedAdmins(strapi)
    await applyEditViews(strapi)
  },
}
