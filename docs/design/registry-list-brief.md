# Registry list: design brief

For the redesign of the module list on `/` and `/c/<category>`. Today's row is an interim (decision Ia of 25 Oct): a core team member said the list "hits the eyes", and we calmed it down without changing what it says. This brief is what the new design has to carry.

## What a row must say, in priority order

1. **Name and what it adds.** Title, the package name (npm or GitHub, mono, wraps only after `/`), and a one-line summary. The title links to the module page. The sigil (hexagon icon) is drawn from the module's anatomy and stays.
2. **Type and license.** Type is one of Official (`01`), Community (`02`), 3rd-party (`03`). License is an SPDX id, `Proprietary`, `License unknown` or `Enterprise license`. A `≠` before the license means the sources (npm, repository) disagree.
3. **Verdict per release line.** One mark per Open Mercato line, in the order `0.8 0.9 next`: the last receipt of a fresh app on that line. This is the evidence; everything else in the row is a summary of it or metadata.
4. **Level.** One of OM Quality (human review, version and expiry), Verified (machine, on the latest line, today `0.9`), Listed (default), or none (enterprise). The level is derived from the line verdicts plus policy rules, so it repeats part of item 3.
5. **Actions.** Copy the install command, and open the package on npm or GitHub. When a new app already has the module there is nothing to install: the row says so instead of offering a command.

## States

Counts are from the preview data of 25 Oct (`preview-data` at 3c5b526), the default view of `/`: 46 module rows, 3 lines, 138 cells. Held entries and examples are behind switches and come on top.

| State                                                         | Where                  | Count today                                                                                        |
| ------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| Verified (line)                                               | cell                   | 83 cells                                                                                           |
| Broken (line)                                                 | cell                   | 20 cells, in 7 rows                                                                                |
| Not judged: our test app failed                               | cell                   | 3 cells                                                                                            |
| Not judged: run did not finish                                | cell                   | 0                                                                                                  |
| Not judged: age gate held a dependency                        | cell                   | 0                                                                                                  |
| New release in the age gate                                   | cell                   | 0                                                                                                  |
| Queued (no receipt yet)                                       | cell                   | 0                                                                                                  |
| Skipped: the catalog does not install it                      | cell                   | 29 cells; 8 rows are of a kind the nightly run skips, 1 row cannot be installed (no pinned source) |
| Receipt for another version than a fresh app installs         | cell                   | 3 cells, in 3 rows                                                                                 |
| Isolation dot agrees with the square                          | cell                   | 94 cells (74 verified, 20 broken)                                                                  |
| Isolation disagreement: broken alone, verified in a new app   | cell                   | 9 cells, in 5 rows                                                                                 |
| Isolation dot not judged, or beside another version's receipt | cell                   | 6 cells                                                                                            |
| Level Verified                                                | row                    | 28                                                                                                 |
| Level Listed                                                  | row                    | 17 (none with the `≠` note "verified square, Listed level")                                        |
| Level OM Quality                                              | row                    | 0                                                                                                  |
| OM Quality revoked                                            | row                    | 0                                                                                                  |
| No level (enterprise)                                         | row                    | 1                                                                                                  |
| License sources disagree (`≠`)                                | row                    | 3                                                                                                  |
| Nothing to install (a new app has it)                         | row                    | 2                                                                                                  |
| Held (not installable or recommended yet)                     | row, hidden by default | 5                                                                                                  |
| Example module                                                | row, hidden by default | 1                                                                                                  |
| Tools and libraries (separate tab)                            | row                    | 6, all Listed, all skipped                                                                         |

What the isolation dot is: the same module installed alone, in an app from the `empty` preset. The square is always the verdict of a new app from the `classic` preset (what `create-mercato-app` makes). The dot is a second signal and never changes the square.

## Constraints

- **No hand-typed numbers.** Every count, version and date on the site is computed from data at build time. A design can show a number only if the data has it.
- **Both themes.** Light and dark, chosen by the OS or the toggle. Brand colors: lime `#B4F372`, yellow `#EEFB63`, violet `#BC9AFF`; red `#F32828` for broken. Lime on white fails contrast for text, so green text in light mode is `#2F520B`.
- **Mobile.** At 390 px the row is a card: title and package, two lines of summary, one mono meta line (type, license, category), then the line marks with their labels and the level. No horizontal scroll at 390, 1024 or 1440. Touch targets are at least 44 px.
- **Color is never the only signal.** Each cell has a distinct shape (check, cross, clock, hatch, dash, dot, dashed frame) and a text label for screen readers and print. axe must report 0 serious and 0 critical issues.
- **Width.** The list sits next to a 240 px filter rail; the row lays itself out from its own width (container queries), not the viewport.
- **Fixed columns.** Line marks and the level line up from row to row and under one column header (`0.8 0.9 next`, `Level`).

## What the interim change did (decision Ia, 25 Oct)

Before: three lime squares with a lime isolation dot each, a solid lime `VERIFIED · 0.9` plate repeating them, a solid lime `01 OFFICIAL` plate, and two icon buttons in every row.

- **One source of color: the squares.** The level is an outline: `Verified` is text and a 1 px border in green (`#2F520B` light, lime dark), `Listed` is plain grey text with no frame, `OM Quality` keeps its two lines with the brand gradient as a thin edge instead of a plate. The module page keeps its solid seals.
- **Type chip neutral.** In the row the type has the same grey outline as the license; the number and name tell the types apart. The colored plates stay on the module page.
- **Isolation dots secondary.** A 5 px grey dot where the module alone agrees with the square, a 5 px hollow ring where it was not judged or the square is another version's, and an 8 px mark in color only where it disagrees: a red ring for broken alone (never a solid red dot on a green square), lime with a dark edge for verified alone. The legends on `/`, `/compat` and the module page say this.
- **Actions on demand.** On devices with a mouse the copy and external-link icons show on row hover or keyboard focus; on touch they always show. Buttons keep their accessible names and stay in the tab order.
- **Broken stays loud.** The red square is unchanged.

Before and after screenshots (light and dark, 1440, 1024 and 390 px, row hover, a disagreement row, broken rows) are attached to this brief.

## Open questions

1. Does the level need its own column, given it is derived from the line marks? Could it fold into the strip, for example by marking the latest line, with OM Quality as the only extra badge?
2. Should the type carry its brand hue again (it did as a plate in light mode), and if so where: chip, sigil, or nothing?
3. Is a red ring the right mark for "broken alone, verified in a new app", or does that case belong in words on the module page only? Today it is 9 cells in 5 rows, all official modules (Akeneo Product Sync, Events, Tillio Telephony, Checkout, Stripe Payment Gateway).
4. Rows that the catalog cannot install (three dashes) take the same space as tested ones. Should they collapse to a one-line row or move under a separate heading?
5. Should the actions move to the module page entirely, or stay in the row on hover?
6. How should the row look when OM Quality ships (none today) so it reads as above Verified without becoming the loudest thing on the page again?
