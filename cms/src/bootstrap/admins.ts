import type { Core } from '@strapi/strapi'

// The roles seed of Q9 (spec Step 2.3): every account of CMS_ADMIN_ACCOUNTS in cms/.env is a personal Super Admin.
// The seed creates an account that does not exist yet without a password and logs its invitation link once; the
// person sets the first password through that link. It never changes or deletes an existing account. There is no
// Editor-role account and no shared login: the list refuses a repeated address and a role address.

/** Local parts of a role or team mailbox, never a person (`admin@`, `marketing@` and their kind). */
export const ROLE_MAILBOXES = [
  'admin',
  'administrator',
  'cms',
  'contact',
  'editor',
  'editors',
  'hello',
  'info',
  'marketing',
  'no-reply',
  'noreply',
  'office',
  'postmaster',
  'root',
  'sales',
  'support',
  'team',
  'webmaster',
] as const

export interface Account {
  firstname: string
  lastname: string
  email: string
}

const ENTRY = /^\s*([^<>,]+?)\s*<([^<>\s,]+@[^<>\s,]+\.[^<>\s,]+)>\s*$/

/**
 * The accounts of CMS_ADMIN_ACCOUNTS: `First Last <address>` entries separated by commas. Throws on an entry it
 * cannot read, a repeated address (in any case) and a role address, so a wrong list stops the start.
 */
export function parseAccounts(text: string | undefined): Account[] {
  if (!text || text.trim() === '') return []
  const seen = new Set<string>()
  return text.split(',').map((entry) => {
    const m = ENTRY.exec(entry)
    if (!m) throw new Error(`CMS_ADMIN_ACCOUNTS: "${entry.trim()}" is not "First Last <address>"`)
    const email = (m[2] as string).toLowerCase()
    if (seen.has(email)) throw new Error(`CMS_ADMIN_ACCOUNTS: ${email} is listed twice, every account is personal`)
    seen.add(email)
    const local = email.slice(0, email.indexOf('@'))
    if ((ROLE_MAILBOXES as readonly string[]).includes(local))
      throw new Error(`CMS_ADMIN_ACCOUNTS: ${email} is a role address, every account is a person's`)
    const [firstname, ...rest] = (m[1] as string).split(/\s+/)
    return { firstname: firstname as string, lastname: rest.join(' '), email }
  })
}

interface AdminUser {
  id: number
  email: string
  isActive: boolean
  registrationToken: string | null
  roles?: { code: string }[]
}

/**
 * Why a start with an empty account list must stop: in production with no admin yet, anyone who reaches /admin first
 * would register the first Super Admin. Elsewhere (strapi develop) an empty list is only a warning.
 */
export function emptyListProblem(nodeEnv: string | undefined, admins: number): string | undefined {
  if (nodeEnv === 'production' && admins === 0)
    return 'admin accounts: CMS_ADMIN_ACCOUNTS is empty and no admin exists; set it in cms/.env before the first start'
  return undefined
}

export async function seedAdmins(strapi: Core.Strapi): Promise<void> {
  const accounts = parseAccounts(process.env.CMS_ADMIN_ACCOUNTS)
  if (accounts.length === 0) {
    const problem = emptyListProblem(process.env.NODE_ENV, await strapi.db.query('admin::user').count())
    if (problem) throw new Error(problem)
    strapi.log.warn('admin accounts: CMS_ADMIN_ACCOUNTS is empty, no account is seeded')
    return
  }
  const superAdmin = await strapi.service('admin::role').getSuperAdmin()
  if (!superAdmin) throw new Error('admin accounts: no Super Admin role')
  const base = `${strapi.config.get('server.absoluteUrl', '')}${strapi.config.get('admin.path', '/admin')}`
  for (const a of accounts) {
    const found = (await strapi.db.query('admin::user').findOne({ where: { email: a.email } })) as AdminUser | null
    if (found) continue
    const user = (await strapi.service('admin::user').create({
      ...a,
      isActive: false,
      roles: [superAdmin.id],
    })) as AdminUser
    strapi.log.info(
      `admin accounts: invited ${a.email}: ${base}/auth/register?registrationToken=${user.registrationToken}`,
    )
  }
  const listed = new Set(accounts.map((a) => a.email))
  const users = (await strapi.db.query('admin::user').findMany({ populate: ['roles'] })) as AdminUser[]
  for (const u of users) {
    if (!listed.has(u.email.toLowerCase())) strapi.log.warn(`admin accounts: ${u.email} is not in CMS_ADMIN_ACCOUNTS`)
    else if (!(u.roles ?? []).every((r) => r.code === 'strapi-super-admin'))
      strapi.log.warn(`admin accounts: ${u.email} holds a role other than Super Admin`)
  }
}
