# Catalog pages: design brief

For the visual design of `/`, `/c/<category>` and `/m/<module>`. The structure was rebuilt on 26 Oct after feedback from the Open Mercato CEO: the old pages were too dense, and he asked for the shape of [nuxt.com/modules](https://nuxt.com/modules). The content architecture is settled; this brief asks for the look. The older row-by-row brief and its screenshots in `registry-list/` describe the previous design and are kept only for history.

## Who reads the pages

A person who builds or runs an Open Mercato app and wants a feature. They should understand in 10 seconds what the page is, find a module by what it does, and see how to install it. Module authors and maintainers read the technical pages (Compatibility, Radar, Quality) and the closed "Technical details" block; they are not the first audience of `/` and `/m/`.

## What each page carries, in priority order

**Home and category pages**

1. Title, one lead sentence, a search field.
2. Categories (sidebar on desktop, chips on phones) and a "Made by" filter: Official, Community, Third-party.
3. A grid of cards. A card is one link and shows: category icon, title, author, a three-line summary, the type word, one compatibility hint in words (Works on latest, Not working on latest, Not tested yet, Comes with new apps, Enterprise) and monthly downloads when known.
4. "Comes with new apps": modules every new app already has, as a second group.
5. "How to add a module" in three steps, "Build your own module", one line for AI agents.

**Module page**

1. Breadcrumb, icon, title, author, package name with copy, summary, a quiet meta row.
2. Install card: the state in words and the numbered steps with a copyable command. This is the most important block after the title.
3. Screenshots (optional; 17 official modules have them, 1440x900 WebP).
4. When to use, When not to use, Works with (providers), What it adds.
5. The author's README, folded after the first section.
6. Sidebar: links, details, maintainers, related modules.
7. One closed block "Technical details for maintainers and agents" with everything else.

## Fixed for now

- Brand tokens, fonts, light and dark themes, header and footer.
- One accent color. No legends, letter codes or per-night squares on these three pages.
- Every number comes from the data; the design must allow longer or shorter values (titles up to 80 characters, counts in the thousands).
- English texts, short sentences, no long dashes.

## Open for the designer

- Card density, icon style (category icons are interim line icons), the place of the compatibility hint.
- Whether cards show a screenshot thumbnail once more modules have screenshots.
- The Install card layout on phones, and how long commands wrap.
- The hero: today it is plain; it may get an illustration if it does not push the grid below the first screen on a laptop.

## Where to look

Preview: the sandbox link the team already has. Code: `site/src/pages/index.astro`, `site/src/components/catalog/`, `site/src/pages/m/[...path].astro`, `site/src/components/module/`.
