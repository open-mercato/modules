// Types for the `semver` 7.8.5 function modules lib/core imports (the package ships no types and
// @types/semver is not a dependency). Subpath modules only, so this never clashes with a declaration
// of the bare 'semver' module elsewhere. No `export {}`: this file must stay an ambient script.

declare module 'semver/functions/satisfies.js' {
  const satisfies: (version: string, range: string, options?: { includePrerelease?: boolean }) => boolean
  export default satisfies
}

declare module 'semver/functions/compare.js' {
  const compare: (a: string, b: string) => -1 | 0 | 1
  export default compare
}

declare module 'semver/functions/valid.js' {
  const valid: (version: string) => string | null
  export default valid
}

declare module 'semver/functions/prerelease.js' {
  const prerelease: (version: string) => readonly (string | number)[] | null
  export default prerelease
}
