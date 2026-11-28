import type { Core } from '@strapi/strapi'

// The content API is not public (spec, Webhook path and its security): Access covers /admin only, so the bootstrap
// takes every permission from the Public role of users-permissions at every start; a Super Admin who grants one
// loses it at the next restart, and the pull fails while an anonymous GET answers 200. The site has no end users,
// so registration through /api/auth/local/register is off as well.
export async function closePublicAccess(strapi: Core.Strapi): Promise<void> {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } })) as {
    id: number
  } | null
  if (role) {
    const removed = await strapi.db
      .query('plugin::users-permissions.permission')
      .deleteMany({ where: { role: role.id } })
    if (removed.count > 0) strapi.log.info(`public role: removed ${removed.count} permissions`)
  }
  const store = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
  const advanced = ((await store.get({})) ?? {}) as Record<string, unknown>
  if (advanced.allow_register !== false) await store.set({ value: { ...advanced, allow_register: false } })
}
