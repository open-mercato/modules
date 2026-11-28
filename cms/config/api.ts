import type { Core } from '@strapi/strapi'

// Strapi sets no cap when maxLimit is unset; the pull pages at exactly 100 and fails on any other page size (spec,
// API Contracts, www-pull).
export default (): Core.Config.Api => ({
  rest: { defaultLimit: 25, maxLimit: 100, withCount: true },
})
