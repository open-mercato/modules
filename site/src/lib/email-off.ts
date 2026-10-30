// Cloudflare Email Obfuscation (live review of 30 Oct, item 1): the zone rewrote every `scope/name@version` of the HTML
// into `[email protected]`, so readers without JS got broken install commands. The zone setting is the owner's; these
// markers are the site's own guard, which Cloudflare honours whatever the setting. Base.astro writes them with
// set:html so Astro's HTML compression keeps the comments.

/** Opens a region Cloudflare leaves alone. */
export const EMAIL_OFF = '<!--email_off-->'

/** Closes it. */
export const EMAIL_ON = '<!--/email_off-->'
