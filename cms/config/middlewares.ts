import { UPLOAD_LIMIT } from './limits.ts'

// Strapi's default list; the body parser refuses a file above the upload limit before the upload plugin reads it.
export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  { name: 'strapi::body', config: { formidable: { maxFileSize: UPLOAD_LIMIT } } },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
]
