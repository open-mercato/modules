// What a built-in module page says about its empty film sections (finding of 25 Oct). module-facts.v2.json of
// @open-mercato/cli carries no routes, credentials, env names or hosts (lib/rentgen/builtin.ts maps none), so an
// empty API, Config or Network section is not read, never `Not present`. Isomorphic.

const ABSENT: Record<string, string> = {
  data: 'tables',
  security: 'permissions',
  events: 'events',
  ui: 'UI',
  background: 'background jobs',
  ai: 'AI tools',
}
/** Sections the facts file never carries, and how the page names what is not read. */
const UNREAD: Record<string, string | null> = { api: null, config: 'credentials and env', network: 'hosts' }

export interface FilmSection {
  id: string
  title: string
  items: readonly unknown[]
}

/** `Not present: ...` (measured and empty) and `Not read: ...` (never in the facts), each '' when nothing applies. */
export function builtInAbsence(sections: readonly FilmSection[]): { absent: string; unread: string } {
  const empty = sections.filter((x) => x.items.length === 0)
  return {
    absent: empty
      .filter((x) => !(x.id in UNREAD))
      .map((x) => ABSENT[x.id] ?? x.title.toLowerCase())
      .join(', '),
    unread: empty
      .map((x) => UNREAD[x.id])
      .filter((x): x is string => typeof x === 'string')
      .join(', '),
  }
}
