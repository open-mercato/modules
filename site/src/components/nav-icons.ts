// The 22 px icons of the navbar panels. The first eleven are the main site's own (decoded from its navbar styles of
// 13 Nov); the six of the Run menu are drawn in the same way: a 24 grid, no fill, a 1.65 round stroke (Lucide shapes,
// ISC). The main site paints them through a CSS mask in the text colour; here they are inline with currentColor,
// which looks the same.
import type { NavIcon } from '../../../lib/core/main-site.ts'

const BODY: Record<NavIcon, string> = {
  crm: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.65"/>',
  'foundation-framework': '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  'agent-orchestrator':
    '<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M2 12v5m20-5v5M8 16h8"/><circle cx="8" cy="11" r="1"/><circle cx="16" cy="11" r="1"/>',
  'cloud-sandboxes': '<path d="M7 19a5 5 0 1 1-1-9.9A7 7 0 0 1 19.7 10 4.5 4.5 0 0 1 19 19z"/>',
  cezar: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 8 4 4-4 4m6 0h4"/>',
  architecture:
    '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4H5v4m7-4h7v4"/>',
  'how-to-contribute': '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 .8-1 1.5-1 4H9c0-2.5 0-3.2-1-4Z"/>',
  agencies: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0M12 11v4"/>',
  partners: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  'certified-partners': '<path d="m12 3 9 4v5c0 5-9 10-9 10S3 17 3 12V7z"/><path d="m8 12 3 3 5-6"/>',
  'enterprise-level-support':
    '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-6h4v6M2 21h20"/>',
  // Run: blocks, a page laid out, a list of checks, a radar, a badge with a check, a plug
  'run-modules':
    '<rect x="14" y="3" width="7" height="7" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>',
  'run-templates':
    '<rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="9" height="7" rx="1"/><rect x="16" y="14" width="5" height="7" rx="1"/>',
  'run-compat': '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  'run-radar':
    '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34M4 6h.01M2.29 9.62A10 10 0 1 0 21.31 8.35M16.24 7.76A6 6 0 1 0 8.23 16.67M12 18h.01M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
  'run-quality':
    '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  'run-agents': '<path d="M12 22v-5M9 8V2m6 6V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
}

/** An icon of a navbar panel as an inline SVG in the text colour, hidden from assistive technology. */
export function navIconSvg(name: NavIcon): string {
  return `<svg class="navbar_icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BODY[name]}</svg>`
}
