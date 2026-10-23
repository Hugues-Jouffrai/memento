# Landing page and notify-me list: specification (D54, proposed)

Status: **proposed, 2026-10-16**, written for Hugues to approve before anything is built. Plan for the executing agent: [landing-plan.md](landing-plan.md). Requirement rows are copied into [02-spec.md](02-spec.md) §12c; the decision is D54 in [decisions.md](decisions.md).

## 1. What it is, in five lines
- A signed-out visitor who opens `https://mailtomemento.com/` sees a one-page presentation of {brand} instead of being sent to `/login`. Signed-in users keep today's home page at `/`.
- The only call to action is "tell me when it opens to everyone": an email address, confirmed by one mail (double opt-in), stored only after the click. It is **not** an invitation request and **not** an account. Sign-ups stay closed (D28, D52).
- Nothing is ever sent to the list by this work. The only mail is the confirmation mail, sent to the person who typed the address.
- Server-rendered, works without JavaScript, no analytics, no third-party resource, no cookie for an anonymous visit (the `locale` cookie is set only when the visitor clicks the language switch).
- Look: the signal style (paper, ink, orange accent bar, heavy condensed headline, mono kickers, one primary button), French by default, English one click away.

## 2. Requirements (phase B)

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-LAND-01 | B | `/` shows the landing page to signed-out visitors and the home page (R-DASH-01) to signed-in users. Every other screen still sends signed-out visitors to `/login`; `/login`, `/join/<code>`, `/privacy`, `/u/<token>`, `/r/<token>`, `/help` (signed-in only) behave as before. New public paths: `/notify/confirm/<token>`, `/notify/leave/<token>`. | e2e: signed out, `/` answers 200 with the landing (`data-testid="landing"`), `/tray` redirects to `/login`, `/login` and `/privacy` render; signed in, `/` shows `due-today`. |
| R-LAND-02 | B | Content, top to bottom: (1) hook: `h1` = `app.tagline`, then one paragraph; (2) the notify form; (3) three steps (send, sort, review) as an ordered list; (4) four differences as a list; (5) beta honesty with a link to `/privacy`; (6) footer: sign in, privacy, language. Strings live under `landing` in both languages. **Sync rule:** the landing describes the product, it does not quote the app: no UI label (the `HELP_LABEL_KEYS` labels), no digit, no address, no time. Labels it shows as its own controls reuse the app's keys (`login.emailLabel`, `login.title`, `account.privacyLink`, `settings.languageFr/En`). | Unit: `landing` keys equal in fr and en; no `landing` string contains a `HELP_LABEL_KEYS` label of its language (case-sensitive), a digit or `@`; every string renders. e2e: the `h1` and the four `h2` in order, 3 steps, 4 differences, footer links to `/login` and `/privacy`. |
| R-LAND-03 | B | The notify form is a plain `<form>` posting to a server action, then a redirect to `/?notify=<state>` (PRG). States: `sent`, `invalid`, `limited`, `failed`. The answer is **the same whether or not the address is already on the list, belongs to an account, or is new**: the submit path never reads the list. A honeypot field (`hp_note`) filled in gets `sent` and nothing else happens. | Integration: a listed and an unlisted address both get `sent` and one mail each with the same subject and the same text once links are masked; honeypot: `sent`, no mail, no rate-limit row. e2e with JavaScript disabled: submit, see the `sent` message, receive the mail (Mailpit). |
| R-LAND-04 | B | Double opt-in without storing anything first: the confirmation mail carries a **sealed token** (AES-256-GCM, key derived from `REVIEW_LINK_SECRET`, purpose bound, address and language inside, never readable in the URL), valid 3 days. `/notify/confirm/<token>` shows the address and a **Confirm button** (POST; a GET never writes, because mail scanners open links). Confirming inserts the address once (repeat: no change). An invalid, tampered, expired or wrong-purpose token gets a polite message and no button. Secret unset: nothing sent (`failed`), every token invalid. | Unit: seal/open round trip; expired, tampered, other purpose, other secret, unset secret, garbage all give null; the token does not contain the address or its base64. Integration: after `sent`, no row; after confirm, one row with the locale; confirm twice, one row. e2e: bad and expired links show the message and no button. |
| R-LAND-05 | B | Storage: table `public.waitlist` (§5), server-only (RLS on, no policy, like `invite_code`), one row per normalised address. Rows are deleted 12 months after confirmation by a daily job, which also clears rate-limit rows older than a day. | pgTAP: RLS on and no policy; anon and authenticated read 0 rows and cannot insert; duplicate address refused; non-normalised address and unknown locale refused; `purge_waitlist()` deletes the 13-month-old row and keeps the 11-month-old one, deletes old `rate_hit` rows, is not callable by anon; the cron job exists. |
| R-LAND-06 | B | Rate limits through `public.rate_check` with hashed keys: 3 requests per address per 24 h (so at most 3 mails a day to anyone's inbox), 10 per network address per hour, 20 for the whole site per 24 h (protects the Resend sending quota shared with sign-in mails). Checked after the honeypot and the address check, in that order: address, network, site. | Integration: 4th request for one address `limited` (no mail); 11th from one IP `limited`; with 50 `waitlist:all` hits, `limited`; no `rate_hit.key` contains the address or `@`. e2e: the 4th submit of one address shows the `limited` message. |
| R-LAND-07 | B | Removal: every mail ever sent to the address carries a sealed **leave** link (`/notify/leave/<token>`, valid 2 years, longer than the retention) to a page with a "Remove me" button (POST); the answer is the same whether the address was listed or not. A person who lost the mail types the address again and gets a new mail with a new leave link. The future opening announcement (not built here) must carry the same link plus `List-Unsubscribe` headers. Hugues can remove by hand (R-LAND-08). | Integration: leave deletes the row; leaving again, or for an unlisted address, answers `ok`; a confirm token on the leave path is invalid. e2e: confirm from the mail, then the mail's leave link removes the row. |
| R-LAND-08 | B | Admin script `scripts/waitlist.ts`: `count`, `list`, `export` (CSV on stdout, formula-safe cells), `remove <email>`, `purge`. Same style as `scripts/invite.ts`, service role from env. | Unit: the CSV helper defuses formulas and quotes cells; `remove` refuses an invalid address (pure argument parsing). Manual: one run of each command against the local stack. |
| R-LAND-09 | B | `/privacy` says what the list keeps, why, for how long, and how to leave (§8); the retention number comes from the code constant, which must match the migration. Resend's role mentions the confirmation mail. | Unit: `WAITLIST_RETENTION_MONTHS` equals the interval in the migration; the privacy strings render with their arguments in fr and en. e2e: `/privacy` shows the waiting-list section with the number of months. |
| R-LAND-10 | B | Quiet and fast: server-rendered; no client component of its own; no analytics, no tracking, no third-party resource (fonts, images, scripts all from the app); an anonymous `GET /` sets no cookie; the FR/EN switch is a form button that sets only the existing `locale` cookie (same options as Réglages) and returns to `/`. | e2e: the response to an anonymous `GET /` has no `set-cookie`; no `src`/`href` in the HTML points to another host; clicking "English" sets `locale=en` and shows the English `h1`. |
| R-LAND-11 | B | Accessibility as R-UI-02: targets at least 44 px (inline links inside a sentence excepted, as WCAG 2.5.8 allows), visible focus, contrast from the existing tokens only (no new colour except the decorative accent bar), real headings and lists, one `h1`, the form label tied to its input, the result message in a live region, the honeypot hidden from screen readers and keyboard. | e2e at 375×812: every button, input and standalone link of the landing is at least 44 px tall; the first Tab focuses the email field and the second the submit button; the honeypot is never focused. Existing R-UI-02 stylesheet test stays green. |
| R-LAND-12 | B | Link previews: `<title>` "{brand} – tagline", meta description, Open Graph (`og:title`, `og:description`, `og:url`, `og:type=website`, `og:locale`, `og:image` = `/icon.png` 192×192) and `twitter:card=summary`; absolute URLs from `APP_URL`. `robots: noindex, nofollow` while the name is a temporary label (D49). A large 1200×630 image is deferred. | e2e: the head of `/` holds these tags with the expected values. |
| R-LAND-13 | B | The confirmation mail uses the signal mail layout (D53 e), no image, no tracking pixel, no tracked link; From is `MAIL_FROM`; it says who asked, the button, the validity, "not you? ignore it, nothing is stored", the leave link, and its own footer (not "because you have an account"). It is **not** logged in `email_out` (that table is per user and would store an unconfirmed address); one log line with the Resend id and no address. | Unit: fr and en mails contain the confirm URL, the leave URL, no `{`, no `<img`, the waiting-list footer and not the account footer. Integration: no `email_out` row after a request. |

## 3. Page structure and message keys

Server component `app/landing.tsx`, rendered by `app/page.tsx` when there is no session. Markup (classes in §9 of the plan):

```
main.landing  data-testid="landing"
  header.landing-head        logo /icon.png (alt="", decorative, on a light tile) + app.name
  h1                          app.tagline
  p.lede                      landing.hook
  section#notify  (aria-labelledby)
    h2                        landing.notify.title
    p                         landing.notify.lede
    p role=status|alert       landing.notify.status.<state>   (only when ?notify= is a known state)
    form action=joinWaitlist
      label.field             login.emailLabel + input name=email type=email autocomplete=email required
      div.hp aria-hidden      label landing.notify.honeypot + input name=hp_note tabindex=-1 autocomplete=off
      button.btn.primary.wide landing.notify.submit
    p.consent                 landing.notify.consent  (rich text, <link> to /privacy)
    p.already                 <a href=/login> landing.already
  section (aria-labelledby)   h2 landing.steps.title
    ol.steps                  3 × li: h3 landing.steps.<send|sort|review>.title + p .text
  section                     h2 landing.diff.title
    ul.diff                   4 × li: landing.diff.<choose|sources|reminder|budget>
  section                     h2 landing.beta.title, p landing.beta.text, p <a href=/privacy> landing.beta.privacyLink
  footer.landing-foot
    ul: <a href=/login> login.title · <a href=/privacy> account.privacyLink
    form action=setVisitorLocale: button name=locale value=<other> lang=<other>  settings.languageEn | settings.languageFr
```

Tone: the same "tu" as the app, short sentences, no superlatives, no claim about memory science (D5: FSRS benefits are not marketed).

### `landing` (new namespace)

| Key | French | English |
|---|---|---|
| `metaDescription` | Envoie un lien, un PDF, une photo ou deux lignes par e-mail : {brand} en tire des cartes et te les fait réviser un peu chaque jour. Bêta fermée. | Email a link, a PDF, a photo or two lines: {brand} turns it into cards and has you review them a little every day. Closed beta. |
| `hook` | Tu envoies un lien, un PDF, une photo ou deux lignes à une adresse e-mail. {brand} en tire des cartes à retenir et te les fait réviser un peu chaque jour. | You email a link, a PDF, a photo or two lines to one address. {brand} turns it into cards worth remembering and has you review them a little every day. |
| `notify.title` | Être prévenu de l'ouverture | Hear when it opens |
| `notify.lede` | La bêta est fermée, sur invitation. Laisse ton adresse : une fois confirmée, tu ne recevras qu'un e-mail, le jour où {brand} ouvrira à tous. | The beta is closed, by invitation only. Leave your address: once you confirm it, you will get one email, on the day {brand} opens to everyone. |
| `notify.submit` | Me prévenir | Notify me |
| `notify.consent` | Ton adresse sert seulement à te prévenir de l'ouverture. Rien d'autre, et tu peux la retirer quand tu veux. <link>Ce qui est gardé</link> | Your address is used only to tell you when it opens. Nothing else, and you can remove it whenever you want. <link>What is kept</link> |
| `notify.honeypot` | Ne remplis pas ce champ | Leave this field empty |
| `notify.status.sent` | C'est presque fait : un e-mail de confirmation vient de partir. Clique sur son bouton pour être sur la liste. Rien reçu ? Regarde dans les indésirables. | Almost done: a confirmation email is on its way. Click its button to be on the list. Nothing yet? Check your spam folder. |
| `notify.status.invalid` | Adresse e-mail invalide. | Invalid email address. |
| `notify.status.limited` | Trop de demandes pour le moment. Réessaie plus tard. | Too many requests right now. Try again later. |
| `notify.status.failed` | L'e-mail n'a pas pu partir. Réessaie dans un moment. | The email could not be sent. Try again in a moment. |
| `already` | J'ai déjà un compte | I already have an account |
| `steps.title` | En trois temps | Three steps |
| `steps.send.title` | Tu envoies | You send |
| `steps.send.text` | Écris à ton adresse {brand} depuis ta messagerie : quelques mots sur une visite, un lien vers un article, un PDF, la photo d'un panneau de musée. Un reçu te dit ce qui a été compris. | Write to your {brand} address from your usual mail app: a few words about a visit, a link to an article, a PDF, a photo of a museum panel. A receipt tells you what was understood. |
| `steps.sort.title` | Tu valides | You validate |
| `steps.sort.text` | {brand} range ce que tu envoies dans des fiches par sujet et propose quelques cartes question-réponse. Tu gardes celles qui valent la peine, tu écartes les autres. | {brand} files what you send into topics by subject and proposes a few question-and-answer cards. You keep the ones worth it and drop the rest. |
| `steps.review.title` | Tu révises | You review |
| `steps.review.text` | Quelques minutes par jour, les cartes reviennent quand il est temps de les revoir. Tu dis si tu t'en souvenais, et le calendrier s'ajuste. | A few minutes a day, cards come back when it is time to see them again. You say whether you remembered, and the schedule adjusts. |
| `diff.title` | Ce qui change | What is different |
| `diff.choose` | Tu choisis ce qui entre dans tes révisions : aucune carte n'y arrive sans ton accord. | You choose what enters your reviews: no card gets there without your say. |
| `diff.sources` | Chaque fait cite sa source. Ce que l'IA ajoute de ses propres connaissances est signalé comme tel. | Every fact cites its source. Anything the AI adds from its own knowledge is marked as such. |
| `diff.reminder` | Un rappel par e-mail à l'heure que tu choisis, seulement les jours où il y a quelque chose à faire. | One email reminder at the time you choose, only on days when there is something to do. |
| `diff.budget` | Un temps de révision par jour que tu fixes : quand la journée est pleine, les nouvelles cartes attendent. | A daily review time you set: when the day is full, new cards wait. |
| `beta.title` | Une bêta, faite par une personne | A beta, built by one person |
| `beta.text` | {brand} est en bêta fermée, développé par une seule personne. Pas de publicité, pas de revente, pas de suivi. Des choses vont encore changer. | {brand} is in closed beta, built by one person. No advertising, no resale, no tracking. Things will still change. |
| `beta.privacyLink` | Ce qui est gardé et comment tout effacer | What is kept and how to erase it |

Reused keys (not duplicated): `app.name`, `app.tagline`, `login.emailLabel`, `login.title`, `account.privacyLink`, `settings.languageFr`, `settings.languageEn`.

**Why the sync rule is enough:** `help` (R-ONB-03) must quote the screens because it teaches them; the landing never names a button, a screen, a limit or a time, so there is nothing to drift. The unit test makes that a rule, not a hope. The only controls it shows are its own, labelled from the app's keys.

### `waitlist` (new namespace, token pages)

| Key | French | English |
|---|---|---|
| `confirm.title` | Confirmer ton adresse | Confirm your address |
| `confirm.question` | Ajouter {email} à la liste des personnes prévenues quand {brand} ouvrira à tous ? | Add {email} to the list of people told when {brand} opens to everyone? |
| `confirm.button` | Confirmer | Confirm |
| `confirm.done` | C'est noté. Tu recevras un seul e-mail, le jour de l'ouverture. | Done. You will get one email, on the day it opens. |
| `leave.title` | Te retirer de la liste | Leave the list |
| `leave.question` | Retirer {email} de la liste d'attente de {brand} ? | Remove {email} from the {brand} waiting list? |
| `leave.button` | Me retirer | Remove me |
| `leave.done` | C'est fait : cette adresse n'est pas sur la liste. | Done: this address is not on the list. |
| `leaveLink` | Me retirer de la liste | Remove me from the list |
| `invalid` | Ce lien n'est pas valable ou a expiré. Tu peux laisser à nouveau ton adresse sur la page d'accueil : le nouvel e-mail contient un lien neuf. | This link is not valid or has expired. You can leave your address again on the home page: the new email has a fresh link. |
| `failed` | Une erreur est survenue. Réessaie dans un moment. | Something went wrong. Try again in a moment. |
| `home` | Retour à l'accueil | Back to the home page |

### `email.waitlist` (confirmation mail)

| Key | French | English |
|---|---|---|
| `subject` | Confirme ton adresse pour {brand} | Confirm your address for {brand} |
| `kicker` | Liste d'attente | Waiting list |
| `title` | Confirme ton adresse | Confirm your address |
| `intro` | Cette adresse a été saisie sur {brand} pour être prévenue de son ouverture à tous. Pour être sur la liste, confirme avec le bouton ci-dessous. | This address was entered on {brand} to be told when it opens to everyone. To be on the list, confirm with the button below. |
| `cta` | Confirmer mon adresse | Confirm my address |
| `ctaText` | Confirmer mon adresse : {url} | Confirm my address: {url} |
| `validity` | Le lien est valable {days} jours. | The link is valid for {days} days. |
| `notYou` | Ce n'est pas toi ? Ignore ce message : ton adresse n'est pas enregistrée et tu ne recevras rien d'autre. | Not you? Ignore this email: your address is not stored and you will get nothing else. |
| `leaveLine` | Si tu confirmes puis changes d'avis : {url} | If you confirm and change your mind later: {url} |
| `leaveLinkText` | Me retirer de la liste | Remove me from the list |
| `footer` | Bêta — tu reçois ce message parce que cette adresse a été saisie sur {brand}. | Beta — you get this message because this address was entered on {brand}. |

## 4. Behaviour of the server code

`requestWaitlist(deps, { email, honeypot, ip, locale })` (`src/server/waitlist.ts`), called by the action `joinWaitlist`, which then redirects to `/?notify=<result>`:

| Step | Condition | Result | Side effects |
|---|---|---|---|
| 1 | `hp_note` is a non-empty string | `sent` | none (no rate hit, no mail, one log line `waitlist_honeypot`) |
| 2 | `parseEmail(email)` is null | `invalid` | none |
| 3 | `REVIEW_LINK_SECRET` unset | `failed` | log line, nothing sent |
| 4 | `rate_check('waitlist:email:<sha256(email)>', 3, 86400)` false | `limited` | the hit is counted |
| 5 | `rate_check('waitlist:ip:<sha256(ip or "unknown")>', 10, 3600)` false | `limited` | counted |
| 6 | `rate_check('waitlist:all', 20, 86400)` false | `limited` | counted |
| – | any `rate_check` error | `failed` | log line |
| 7 | mailer throws | `failed` | log line without the address |
| 8 | otherwise | `sent` | one confirmation mail; log line `waitlist_confirm_sent` with the provider id |

The list is never read on this path, so a listed address, an account's address and a new address follow the same steps and get the same answer and the same mail.

`confirmWaitlist(deps, token)`: open as `confirm`; null gives `invalid`; else upsert `{email, locale}` on conflict do nothing; error gives `failed`; else `ok`. `leaveWaitlist(deps, token)`: open as `leave`; null gives `invalid`; else delete by address (0 or 1 row) and `ok`; error gives `failed`.

Pages: `GET /notify/confirm/<token>` and `GET /notify/leave/<token>` never write. They show the address from the token and one button, or `waitlist.invalid` with a link home. The button posts to an action that redirects to `?done=1` (or `?failed=1`). After confirming, the page shows `confirm.done` and a leave link built for the same address. Both pages: `robots noindex`, `referrer: no-referrer`.

## 5. Data model

Migration `supabase/migrations/20261016180000_waitlist.sql`:

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | primary key, `gen_random_uuid()` |
| `email` | text | not null, **unique** (the unique index is the only index needed), `email = lower(btrim(email))`, 3 to 254 characters, contains `@` |
| `locale` | text | not null, `in ('fr','en')`: language of the future announcement |
| `confirmed_at` | timestamptz | not null, default `now()`: only confirmed rows exist |

RLS enabled, no policy (anon and authenticated get nothing; service role only), same pattern as `invite_code` and `rate_hit`. Normalisation is the app's `parseEmail` (trim, lower case; no Gmail dot folding, as D51). No `user_id` column: the list is not tied to accounts, and account deletion does not touch it.

`public.purge_waitlist()` (security definer, `search_path = ''`, service role only) deletes rows confirmed more than 12 months ago and `rate_hit` rows older than one day, returns the number of waitlist rows deleted. `cron.schedule('waitlist-purge', '17 3 * * *', 'select public.purge_waitlist()')`.

## 6. Abuse and privacy design

- **Third parties typing someone else's address** (Hugues's constraint): nothing is stored before the owner clicks. The cost is one mail per request, capped at 3 a day per address, so the worst a stranger can do is send that address 3 short mails a day that say "ignore this, nothing is stored". Trade-off accepted: people who never click are not on the list, and the list costs Resend mails.
- **Enumeration:** the submit path never reads the list (identical steps, answer and mail). The leave page gives the same answer whether a row existed.
- **Bots:** honeypot field (off-screen, `aria-hidden`, `tabindex=-1`, `autocomplete=off`, a name no autofill knows), then the three rate limits. No CAPTCHA (third-party resource, cookies).
- **Link scanners** (Outlook Safe Links, Gmail): confirm and leave need a POST from the page's button.
- **Addresses in URLs and logs:** tokens are encrypted, so the address never appears in a URL, in Vercel's request logs or in a referrer. Log lines carry no address. Rate-limit keys are SHA-256 hashes, kept at most about two days.
- **Secret:** reuses `REVIEW_LINK_SECRET` with a derived AES key and the purpose bound as authenticated data, so no new env var for Hugues. Rotating that secret invalidates pending confirmations and old leave links too (re-submitting the form gives a fresh leave link).
- **Quota:** the 20-a-day site cap keeps headroom for sign-in codes, receipts and reminders, which share the Resend account. Hugues is on the Resend Free plan: 100 emails a day (Resend documentation, checked 2026-10-16; the 3,000 a month figure comes from third-party guides). Re-check the plan's limits before deploying (platform limits change; CLAUDE.md).
- **What exists now / deferred:** now: confirmation mail with confirm and leave links, leave page, admin removal, 12-month purge. Deferred (not in this work): the opening announcement, which must carry the leave link and `List-Unsubscribe`/`List-Unsubscribe-Post` headers, be sent in each row's `locale`, and delete the list afterwards.

## 7. Changes to `proxy.ts`

Add `"/notify/"` to `PUBLIC`, and let exactly `/` through for signed-out visitors (`path === "/"`; `PUBLIC` uses `startsWith`, so `/` cannot go in that list). The server actions of the landing post to `/`, so they pass too. Nothing else changes (matcher unchanged; `/icon.png` is already excluded from it).

## 8. Changes to `/privacy`

New section after "Tes droits", before "Contact":
- `privacy.waitlistTitle`: Liste d'attente / Waiting list
- `privacy.waitlist` ({months}): FR « Si tu laisses ton adresse sur la page d'accueil pour être prévenu de l'ouverture, un e-mail de confirmation part et rien n'est enregistré tant que tu n'as pas cliqué sur son bouton. Après ta confirmation, seuls ton adresse, la langue de la page et la date de confirmation sont gardés. L'adresse sert uniquement à t'envoyer un e-mail le jour de l'ouverture : pas d'autre envoi, pas de partage, pas de suivi. Elle est effacée au plus tard {months} mois après ta confirmation. » EN "If you leave your address on the home page to be told when it opens, a confirmation email is sent and nothing is stored until you click its button. Once you confirm, only your address, the language of the page and the date of confirmation are kept. The address is used only to send you one email on the day it opens: no other mail, no sharing, no tracking. It is erased at the latest {months} months after you confirmed."
- `privacy.waitlistRemove` ({leaveLink} = `email.waitlist.leaveLinkText`): FR « Pour la retirer avant, utilise le lien « {leaveLink} » de l'e-mail de confirmation. Tu l'as perdu ? Saisis à nouveau ton adresse sur la page d'accueil : le nouvel e-mail contient aussi ce lien. » EN "To remove it sooner, use the “{leaveLink}” link in the confirmation email. Lost it? Enter your address again on the home page: the new email has that link too."
- `privacy.waitlistAbuse`: FR « Pour limiter les abus, une empreinte (hash) de l'adresse e-mail et de l'adresse réseau (IP) de chaque demande est gardée au plus deux jours. » EN "To limit abuse, a fingerprint (hash) of the email address and of the network (IP) address of each request is kept for at most two days."
- `privacy.processors.resend.role` becomes: FR « envoi et réception des e-mails (reçus, rappels, codes de connexion, confirmation de la liste d'attente). » EN "sending and receiving email (receipts, reminders, sign-in codes, waiting-list confirmation)."

The two-day figure is true because `rate_check` drops rows older than a day on every call and the daily purge does the same.

## 9. Decisions by Hugues (2026-10-16)
1. **Indexing:** keep `noindex` until the final name is fixed.
2. **Contact address and storage of replies:** there is no mechanism to read replies: mail to any address of the domain from a sender who is not an account is dropped (D51), and mail is sent from `noreply@`. So `/privacy` must not promise that replies are read. Until a real contact address exists, its "Contact" section says to ask the person who invited you (the beta is by invitation, Hugues sends every invite himself), and a visitor on the waiting list has the leave link as their only channel. This is accepted for the closed beta and must be revisited before the product is opened to everyone. The list itself IS stored: table `waitlist`, read with `scripts/waitlist.ts`; so the call to action stays.
3. **Resend plan:** Free, 100 emails a day. The site-wide cap for confirmation mails is 20 a day (it was 50).
4. **Copy:** to be judged when the page exists.
5. **Retention:** no deletion right after an opening announcement for now; the 12-month purge stays as written.
