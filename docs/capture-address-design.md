# Capture address: token, alias or sender-based routing (2026-10-16, proposal)

Question (Hugues): replace `<token>@mailtomemento.com` with one shared address (`add@mailtomemento.com`) and identify the user by the `From` address?

## 1. What the code does today
- `src/server/inbound.ts`: Svix-verified webhook, token from the recipient (`captureTokenFrom`, 20 hex chars, domain ignored), then `isAcceptedSender(from, accountEmail)` (`src/domain/capture.ts`): exact match on the account email, else stored `rejected`, no job (R-CAP-02, tested in `tests/unit/domain/capture.test.ts`, `tests/integration/inbound.test.ts`). Linked addresses (R-ACC-07) are a parameter, never filled.
- **No SPF/DKIM/DMARC check.** R-CAP-03 (phase B) is not built; `src/server/resend.ts` ignores the `authentication` field. Today's real guard is the secret token; the `From` check alone is forgeable.

## 2. What Resend exposes (read 2026-10-16)
- Webhook `email.received`: metadata only, bare `from`, no auth results ([docs](https://resend.com/docs/webhooks/emails/received)).
- `GET /emails/receiving/{id}` returns `authentication: {spf, dkim, dmarc}` (`pass | fail | gray | processing_failed | unknown`), computed by Resend's receiving server, so not forgeable by the sender; `null` for older mail. DKIM `gray` = unsigned **or signing domain differs from the From domain**; DMARC `gray` = no policy or `p=none` ([docs](https://resend.com/docs/api-reference/emails/retrieve-received-email)).
- DNS lookup (2026-10-16): `gmail.com` and `outlook.com`/`hotmail.fr` publish DMARC `p=none`; `icloud.com`, `orange.fr`, `free.fr` `p=quarantine`; `yahoo.fr`, `laposte.net` `p=reject`. **So requiring `dmarc=pass` would refuse every genuine Gmail and Outlook user.** The usable test is **`dkim=pass`** (aligned to the From domain, per Resend's definition of `gray`).

## 3. Spoofing and what it costs the victim
With a shared address, an attacker needs only the victim's address (often public). Without an auth check a forged mail: spends AI (about $0.016 per note, $0.03 from 2027-01-01, D37; up to 4 sources per mail, D39), fills the tray, and, worse, **edits topic pages automatically** (D6, D12: only cards go through the tray), a prompt-injection path into the knowledge base. Mitigations: require `dkim=pass` on the shared path (blocks forging Gmail, Outlook, iCloud From); per-user daily capture cap (beta item d); never auto-reply to unauthenticated mail (backscatter); tray approval already gates cards, not pages.

## 4. Real-user scenarios
| Case | Token / alias (A, B, C) | Shared + From (D) |
|---|---|---|
| Forward a newsletter or PDF from the phone (From = user) | works | works if DKIM passes |
| Work address not registered | refused (From check) | refused, unknown sender |
| Shared family mailbox | each user's own address, From must match | one From maps to one user: ambiguous, needs the alias |
| `+tag`, Gmail dots | From is the account address as sent; exact match | same; normalising dots is unsafe for non-Gmail domains (do not) |
| Apple Hide My Email | relay address must be registered (unverified how iCloud sends) | same |
| Two accounts | register both (R-ACC-07) | same |
| Auto-forward rule | From stays the original author: refused by both | refused |
| Custom domain without DKIM | accepted (token is the second factor) | refused |

Unknown sender on the shared address: reject silently and log (beta). Later: if `dkim=pass`, reply once a day per address with "sign in and add this address", never with content. Registering a sender (R-ACC-07, like Gmail "send mail as"): the user adds it in Réglages, a link with a single-use token goes to that address, the click verifies it.

## 5. Options (1 bad, 5 good)
| Option | Easy to remember | Forgery resistance | Shared mailbox / edge cases | Beta effort | Total |
|---|---|---|---|---|---|
| A token `3f9a…@` | 1 | 5 (secret) | 4 | 5 (done) | 15 |
| B alias `hugues.k7m2@` | 3 | 4 (guessable-ish, plus From) | 4 | 3 | 14 |
| C `hugues@` | 5 | 2 (only From) | 3 | 3 | 13 |
| D `add@` + From | 5 | 4 with `dkim=pass`, 1 without | 2 | 3 | 14 |
| **D + A kept** | 5 | 4 | 4 (token fallback) | 3 | **16** |
| D + B + verified senders | 5 | 4 | 5 | 2 | 16 (later) |

## 6. Recommendation
- **Beta (minimum):** add `add@mailtomemento.com` routed by From = account email (already verified by sign-in, unique in `auth.users`), accepted only if `authentication.dkim = pass` at the `fetch` stage, before any AI call. Keep tokens working unchanged; the home page shows `add@` first, the token address under "Autre adresse (si ton fournisseur bloque)". Apply R-CAP-03 to the token path too, but only refuse `dkim=fail` there.
- **Later (phase B):** verified linked senders (R-ACC-07), unknown-sender reply, readable alias (B) for shared mailboxes; retire token display, never the tokens.

## 7. Migration sketch
- Beta: only `capture.route text check (route in ('token','shared'))` and `capture.auth jsonb`; unknown senders are not stored (no user).
- Later: `sender_address(id, user_id fk cascade, address text check lower, verified_at, token_hash, created_at)`, unique index on `address` where `verified_at is not null`, an address cannot equal another user's account email; RLS select own, writes by server only (D29 d).
- Tests: `[R-CAP-12]` shared address with account From and `dkim=pass` creates a capture; `dkim=gray|fail|null` gives `rejected`, no job, no AI call; unknown From gives no row; `[R-CAP-03]` token path refuses `dkim=fail`; `[R-CAP-01]` old `resend.app` token address still works; `[R-ACC-07]` unverified sender cannot capture, verification needs the mailed token; `[R-ONB-04]` mailto targets `add@`.
- New IDs: **R-CAP-12** (S) shared capture address routed by authenticated sender; **R-CAP-13** (B) unknown-sender reply, rate-limited, only after `dkim=pass`. R-CAP-03 moves from B to S for the shared path.

## 8. Interplay
Beta slice (HANDOVER step 10): build before inviting testers, with the per-user cost cap (d). Rename (D49): `add@` uses `RESEND_RECEIVING_DOMAIN`, so it follows the domain.

## 9. Not verified
- Live values of `authentication` on real Gmail, Outlook, iCloud, phone-app forwards (one test each before relying on it).
- Whether Resend computes DKIM alignment strictly or relaxed (subdomains).
- How Apple Hide My Email and Gmail "send mail as" sign outgoing mail, and how often testers' providers give `dkim=gray`.

## 10. Draft decision
| D50 | **Shared capture address (2026-10-16, R-CAP-12, R-CAP-03).** Mail to `add@<capture domain>` is routed by its From address to the user whose account email it is, and accepted only when Resend's `authentication.dkim` is `pass` (checked in `fetch`, before any AI call); `dmarc=pass` is not required because Gmail and Outlook publish `p=none`. Unknown or unauthenticated senders: nothing stored, no reply. Token addresses keep working and are shown as a fallback; they refuse `dkim=fail`. Verified linked senders (R-ACC-07), an unknown-sender reply (R-CAP-13) and readable aliases come in phase B. | A random token is a poor UI; From alone is forgeable and forged mail edits pages automatically. | proposed |
