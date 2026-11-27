import type { Core } from '@strapi/strapi'
import { UPLOAD_LIMIT } from './limits.ts'

export default ({ env }: Core.Config.Shared.ConfigParams) => ({
  // media on the Docker volume of the host (Q5), at most 25 MiB a file
  upload: { config: { provider: 'local', sizeLimit: UPLOAD_LIMIT } },
  'users-permissions': { config: { jwtSecret: env('JWT_SECRET') } },
})
