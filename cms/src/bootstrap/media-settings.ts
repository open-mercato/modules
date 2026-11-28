import type { Core } from '@strapi/strapi'

// The Media Library settings of A7 (spec), written at every start. Strapi 5.64.0 keeps them in the core store: the row
// `plugin_upload_settings` of the table `strapi_core_store_settings` (`strapi.store({ type: 'plugin', name: 'upload',
// key: 'settings' })`, read by @strapi/upload/dist/server/services/upload.js getSettings). The upload plugin's own
// bootstrap writes its defaults there only when a key is missing, and runs before this one, so the values below win
// after every start, whatever a Super Admin set in Settings, Media Library.
// - responsiveDimensions: "Responsive friendly upload" (the build makes its own variants, www/image-variants.ts)
// - sizeOptimization: "Size optimization" (re-encodes JPEG, PNG and WebP; the bytes must stay)
// - autoOrientation: "Auto orientation" (rotates by EXIF; the bytes must stay)
// - aiMetadata: the AI captions of 5.64.0; off, so no upload leaves the host
export const MEDIA_SETTINGS = {
  responsiveDimensions: false,
  sizeOptimization: false,
  autoOrientation: false,
  aiMetadata: false,
} as const

export type MediaSettings = Record<string, unknown>

/** The settings to store: the stored ones with the four of A7 forced off, and the names of those that were on. */
export function mediaSettings(stored: MediaSettings | null | undefined): { value: MediaSettings; changed: string[] } {
  const before = stored ?? {}
  const changed = Object.keys(MEDIA_SETTINGS).filter((k) => before[k] !== false)
  return { value: { ...before, ...MEDIA_SETTINGS }, changed }
}

export async function applyMediaSettings(strapi: Core.Strapi): Promise<void> {
  const store = strapi.store({ type: 'plugin', name: 'upload', key: 'settings' })
  const { value, changed } = mediaSettings((await store.get({})) as MediaSettings | null)
  if (changed.length === 0) return
  await store.set({ value })
  strapi.log.info(`media settings: turned off ${changed.join(', ')}`)
}
