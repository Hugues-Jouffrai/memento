# Interval under each grade (design, 2026-10-17)

Status: approved and built 2026-10-17 (D62). The middle grade is now "Correct" and the hints say "Retrouvé"; the interval has its own always-visible element. Closes the TODO(D48) in `app/review/page.tsx`. Styles A Calme and D Récré come after this and are not part of it.

## What the user sees
On the review screen, after "Afficher la réponse", each of the four grade buttons shows when the card will come back if that grade is pressed, under or beside its hint:

| Grade | Hint (exists) | Interval (new) |
|---|---|---|
| À revoir | Oublié | `10 min` |
| Difficile | Rappelé, mais avec effort | `1 j` |
| Bien | (existing hint) | `4 j` |
| Facile | (existing hint) | `11 j` |

The numbers above are examples only; the real ones come from the scheduler for that card, its history and the user's desired retention.

## How it is computed
- A pure function `previewIntervals(state, now, desiredRetention)` in `src/domain/scheduling.ts` returns, for grades 1 to 4, the `due` that `applyReview` would produce. It reuses `applyReview` (same FSRS version, fuzz off, short-term steps on), so the preview and the real result cannot disagree. The interval is `due - now`.
- The review page already reads the card state through `nextCard`; it passes the state and the profile's `desired_retention` to the function. No new query, no migration, no new AI call.
- Rounding and units (one function `formatInterval(ms, locale)`): under 1 hour in minutes (`10 min`), under 1 day in hours (`3 h`), under 31 days in days (`4 j`), under 365 days in months (`2 mois`), else years. French and English texts come from `messages` (ICU plural), no hard-coded strings.
- The stored schedule is unchanged: the preview is display only. A card graded in another tab gets the real state from `gradeCard` as today.

## Rules and edge cases
- A new card (state 0) has intervals too: `applyReview` handles state 0.
- Learning steps within the day (R-SCH-03) show minutes or hours, never "0".
- "Again" shows the learning step, not the long interval, so the rule "forgot gives À revoir, never Difficile" (R-REV-03) stays visible and honest.
- The review link (signed token) shows the same intervals.
- The interval is plain text inside the button, so screen readers read "Bien, 4 jours" (the label includes the unit in full words through `aria-label` built from the same strings).
- Layout: second line in the existing `small` element for signal and revue; in cahier the third grid column; in bristol under the hint. 44 px targets are kept (R-UI-03).

## Tests
- Unit `[R-SCH-07]` (new row): `previewIntervals` equals the due of `applyReview` for every grade on fixture states (new, learning, review, relearning); `formatInterval` boundaries in fr and en; intervals never decrease from grade 1 to 4.
- e2e `[R-REV-06]` (new row): after showing the answer, four intervals are visible; pressing a grade stores a due date equal to the one shown (within the preview's rounding); the review link shows them too.

## Decision and spec to add when approved
- Spec rows R-SCH-07 and R-REV-06; decision D62 (D60 is the sign-in countdown, D61 the logo).

## Open question for Hugues
- Anki style prefixes `<` for sub-day steps ("< 10 min"). Proposal: no prefix, plain numbers, since FSRS gives exact due dates.
