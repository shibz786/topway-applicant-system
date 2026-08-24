# Topway Applicant System — Rebuild

Topway International is a domestic worker recruitment agency placing candidates (mostly
Southeast Asian) into households in Saudi Arabia, Kuwait, Oman, and Qatar. This repo is being
**rebuilt from scratch**: the legacy PHP + flat-JSON app (`admin.html`, `agent.html`,
`invoice.html`, `index.html`, `api/*.php`, `data/*.json`) is being replaced entirely by a
modern Next.js application. Do not patch the legacy system further except as already documented
under Phase 0 below — build the new one.

## Current status

- **Phase 0 — done.** The legacy PHP app now requires auth on every endpoint that previously had
  none (`list.php`, `load.php`, `save.php`, `delete.php`, `delete_image.php`, `upload.php`,
  `invoices.php` were completely open before this). `index.html` (the internal Profile Builder)
  and `invoice.html` (the Invoicing tool) previously had **no login screen at all** — both now
  gate behind the same admin password used by `admin.html`. Added: centralized token
  verification in `api/_lib.php`, file-based login rate limiting (10/IP/15min, 5-fail
  lockout/15min) on both `agent_auth.php` and `admin_agents.php`'s `admin_login` action,
  magic-byte file validation + 10MB cap on uploads, removed wildcard CORS headers, added
  `uploads/.htaccess` blocking script execution in that directory.
  **Known deferred gap:** `uploads/` files are still served directly by the webserver (not
  through an authenticated endpoint) because `<img src="uploads/...">` is baked into three
  frontend files and filenames aren't cryptographically opaque. This is intentional — Phase 3
  replaces the whole directory with private R2 + signed URLs. Don't try to "fix" it further in
  the legacy app; migrate instead.
- **Phase 1 — done.** The new app lives in `web/` (Next.js 15.5.23, pinned — `create-next-app@latest`
  tries to install Next 16, don't let it). Full Prisma schema migrated and running against local
  Postgres 16 (`brew services`, db `topway_dev`) — swap `DATABASE_URL` in `web/.env` for a real
  Neon string whenever that's ready, nothing else changes. Lucia v3 session auth (deprecated
  upstream but still what's specified — flagged for the user, not swapped unilaterally),
  `requireSession(role?)` in `web/src/lib/auth/session.ts` is the one auth chokepoint, audit-log
  Prisma middleware in `web/src/lib/db.ts`. Legacy data migration script
  (`web/scripts/migrate-legacy-data.ts`, `npm run db:migrate-legacy`) run against the real
  `data/*.json` — 20 candidates, 6 agents (5 legacy + 1 seed), 11 placements, 4 invoices; full
  report at `web/scripts/migration-report.json` (gitignored, has candidate PII). Seed script
  (`npm run db:seed`) creates one admin/staff/agent test login each.
- **Phase 2 — done.** Staff management (`/admin/staff`, admin-only: create/edit staff, permission
  flags, active-session list + revoke) and Invoicing Portal (`/invoices`: create/edit/duplicate,
  Draft→Sent→Paid→Void workflow with confirmation modals, server-side PDF via
  `@react-pdf/renderer` shared by both view and download, sequential invoice numbers via a
  serializable-transaction retry loop). Added one model beyond the original 12 —
  `CompanySettings` (singleton, bank details + company footer for the PDF) — because the spec's
  prose required "bank details stored in DB, editable by admin only" but the given schema block
  had nowhere to put it; confirmed with the user before adding it. `requirePermission(user, flag)`
  in `web/src/lib/auth/authorize.ts` backs every invoice action server-side, not just the nav
  link. TanStack Query + optimistic status updates w/ rollback-on-error toasts, per spec.
  **Two real bugs found by actually driving the app in a browser (Playwright), not by
  typechecking/curl — write these down if touching this code:**
  1. The original static CSP (`script-src 'self'`, no nonce) silently broke the entire app —
     Next.js injects its own inline hydration scripts, so nothing hydrated and no button worked,
     while curl-based checks saw a perfectly fine 200. Fixed with the nonce-per-request pattern:
     CSP now lives in `web/src/middleware.ts` (not `next.config.ts`), and the root layout reads
     `headers()` once to opt into per-request dynamic rendering. Do not reintroduce a static
     nonce-less CSP.
  2. Prisma's `Decimal` (on `Invoice.totalAmount` / `InvoiceItem.amount`) cannot cross a Server
     Action's RSC serialization boundary to a Client Component — throws
     "Only plain objects can be passed...". Every action that returns invoice data to a client
     component converts Decimal → `number` first (`decimalToNumber()` in
     `web/src/lib/actions/invoices.ts`); the PDF route is exempt since it renders entirely
     server-side and never crosses that boundary.
  3. `AsyncLocalStorage` (the audit middleware's actor-context mechanism) needs TWO fixes to
     survive Next.js's Server Action / RSC layering, or writes silently fail closed with "no
     actor in context": (a) the `AsyncLocalStorage` instance itself must be cached on
     `globalThis` (`web/src/lib/db.ts`), same as the Prisma client, because Next.js can
     re-evaluate a plain module-level `export const` once per compilation layer; (b)
     `runAsActor()` must `await` the wrapped call *inside* `actorContext.run()`'s callback, not
     just return the un-awaited promise — returning it let the callback's synchronous frame
     close before Prisma's actual (deferred) query dispatch ran, which was enough to lose the
     store even with (a) fixed. Both confirmed by instrumenting both sides live; don't simplify
     `runAsActor` back to a bare `return fn()`.
  A Playwright E2E script covering both areas lives at `web/scripts/e2e-phase2.mjs` — rerun it
  (`node scripts/e2e-phase2.mjs` from `web/`, dev server must already be running and warmed up
  with a curl hit per route first, or the first navigation exceeds Playwright's 30s timeout on
  a cold compile) after touching staff/invoice/auth code.
- **Phase 3 — done.** Admin Console: Profile Builder (`/admin/candidates/new`,
  `/admin/candidates/[id]/edit`) as a 4-step wizard — personal details → experience & skills →
  documents → review — creating the `Candidate` + `Tracking` row after step 1 so uploads have
  something to attach to (there's no separate draft/published flag in the schema; an incomplete
  row is just reopenable later). Candidate ATS table (`/admin/candidates`) with status/agent/
  destination/contract-stage filters, photo thumbnails via signed URL, dispute chips. Detail
  sheet slides in from the right: visual pipeline stepper (click a completed/current stage to
  open a date picker), departure+destination (blocked from saving one without the other, auto-
  computes probation/mid/end dates), Put on Hold/Cancel/Resume as modal-confirmed actions,
  dispute logging, document upload/preview, placement history, admin-only audit log tab, agent
  (re)assignment. Agent management (`/admin/agents`): create agents, toggle `dataBankAccess`.
  Business logic (probation days per country, derived probation status, derived contract stage,
  derived remarketing eligibility) centralized in `web/src/lib/business/tracking.ts` — nothing
  computed ad-hoc in a component.
  **File storage**: R2 doesn't exist yet, so built a `StorageAdapter` interface
  (`web/src/lib/storage/adapter.ts`) with a local-disk stand-in
  (`web/src/lib/storage/local-adapter.ts`, files under `web/.local-storage/`, gitignored) behind
  it — swapping in a real R2 implementation later is a one-file change, nothing else in the app
  moves. The local stand-in still implements the REAL architecture, not a shortcut: uploads are
  magic-byte validated (`web/src/lib/storage/validate-upload.ts`) before writing, keys are opaque
  UUIDs, and downloads go through the same two-step signed-URL flow R2 would use —
  `/api/files/[fileId]` validates session + candidate access and mints a 15-minute HMAC-signed
  URL (`FILE_SIGNING_SECRET` in `.env`), `/api/files/raw/[key]` (local-only, dead code once R2
  lands) checks the signature and streams the file, no session check needed there since
  possessing a valid signed URL *is* the authorization — exactly like a real presigned URL.
  Candidate PDF export (`/api/candidates/[id]/pdf`) embeds the headshot via
  `storage.getObject()` reading raw bytes server-side (added a `getObject` method to the adapter
  interface for this — never exposed to the browser, only used for server-side PDF embedding).
  **Verified with a 28-check Playwright run** (`web/scripts/e2e-phase3.mjs`) covering the full
  wizard, pipeline/departure/status/dispute actions, agent-scoped visibility (an agent sees only
  their own candidate, pipeline renders with no clickable date-picker buttons at all — not just
  disabled ones — and direct navigation to `/admin/staff` bounces them), PDF generation, the
  audit log, and both file-security edges (unauthenticated `/api/files/[fileId]` → 401, a
  tampered signature on the raw route → 403). Two apparent failures during development
  (`document upload succeeds`, `dispute chip visible in table`) turned out to be test-script
  issues (toast-timing, a strict-mode multi-match from leftover data across reruns) — confirmed
  by direct DB/DOM inspection before "fixing" anything, not assumed.
  Hard-delete for candidates was deliberately left out (see the comment where `deleteCandidate`
  used to be in `web/src/lib/actions/candidates.ts`) — cascading through audited child tables
  (`Dispute`, `Placement`) via `deleteMany` would need the same before/after diff machinery as a
  single-record delete, and it's not in the spec's action list. If a "remove a candidate" need
  shows up later, model it as an application-status value, not a real delete.
  "Change of employer/house" (closing one `Placement`, opening another, optional remarketing
  visibility) is Phase 5 territory, not built here.
- **Phase 4 — done.** Agent Portal at `/agent` — a genuinely separate, mobile-first card UI, not
  a cut-down version of the admin ATS table (that table doesn't fit at 375px and isn't linked
  from an agent's nav at all; `/admin/candidates` redirects agents to `/agent` if they try).
  **My Applications** tab: cards for the agent's current-Placement candidates plus any with
  `remarketingDate` set on a prior placement of theirs (dual-agent visibility), each showing
  photo/category/status/dispute chip and — the spec's "whichever is more current" — pipeline
  stage before departure or a milestone badge after (`deriveMilestoneLabel()` in
  `web/src/lib/business/tracking.ts`: "Probation in progress (Xd left)" / "Probation complete" /
  "Mid-contract milestone" / "Contract/Agreement Closed", which can show together since probation
  usually finishes well before the 1-year mark). Tapping a card reuses Phase 3's
  `CandidateDetailSheet` — already agent-read-only correctly, no duplicated logic. **Databank**
  tab only renders if `agent.dataBankAccess`, filters by category/skill/destination, "Request
  Assignment" is explicitly not self-service — it only creates `Notification` rows for admins to
  act on.
  **Schema-gap workaround, smaller cousin of Phase 2's `CompanySettings` one:** `Notification` has
  no requester column (`userId` is the *recipient*), so a databank request needs the asking
  agent's id recorded somewhere for admin to approve correctly. Encoded it in `Notification.type`
  as `DATABANK_REQUEST:<agentId>` (`web/src/lib/actions/notifications.ts` — always match with
  `startsWith`, never equality; `parseDatabankRequestAgentId()` extracts it). This one felt small/
  internal enough not to warrant a second user interrupt the way `CompanySettings` did — flag it
  if that judgment call should have gone the other way. Admin reviews and approves/dismisses
  requests from a new panel on `/admin/agents` (admin-only — the panel doesn't render for staff
  who reach that page via the `agents` permission flag, since `listDatabankRequests` requires the
  ADMIN role specifically); approving reuses the exact same Placement-reassignment logic as manual
  agent assignment.
  **Contract-closure notification**, the CLAUDE.md business-logic bullet, not just the portal
  bullet: `checkContractClosureNotifications()` finds `Tracking` rows with `contractEndDate` past
  and `contractClosureNotified: false`, creates a `CONTRACT_CLOSED` `Notification` for every admin
  plus the assigned agent, and flips the flag — all in one transaction. No cron infra exists yet
  (that's Upstash/Vercel-cron territory, later), so this runs opportunistically whenever
  `getUnseenContractClosureNotifications()` is called, which is every agent-portal load — an
  honest reading of "on page load," not a shortcut. This write is system-triggered with no
  logged-in actor initiating it, which the audit middleware doesn't allow silently — there's no
  real cron/system user in this schema, so it's attributed to whichever user's page load happened
  to trigger the check (`checkContractClosureNotifications(triggeringUser)` takes it explicitly,
  never runs anonymously). The one-time popup itself (`ContractClosureModal`) checks
  `Notification.seenAt`, dismissing marks it seen, and it never reappears — verified for real
  (not assumed): forced a candidate's `contractEndDate` into the past via SQL, loaded the agent
  portal and watched the modal fire with the right candidate name, dismissed it, reloaded, and
  confirmed it stayed gone — then confirmed in the DB that `contractClosureNotified` flipped, both
  recipients' `Notification` rows exist, and only the dismissing agent's was marked seen.
  **Another real bug found only by browser-testing, not typecheck/build:** `toggleCandidateDatabank`
  (databank opt-in switch on a candidate's profile) wrote to `Candidate` — an audited table —
  without `runAsActor()`, which the audit middleware correctly rejected at write time exactly like
  Phase 2/3's `AsyncLocalStorage` issues. Same fix, same lesson: every write to an audited model
  needs `runAsActor()` wrapped around the specific call, no exceptions, and grep for bare
  `db.candidate/tracking/placement/dispute/invoice.<verb>(` calls when adding a new action rather
  than assuming a "small" write doesn't need it.
  Verified end-to-end with two Playwright passes: `web/scripts/e2e-phase4.mjs` (14 checks — no-
  databank-tab vs. has-databank-tab, the full request→approve flow with the resulting Placement
  confirmed, zero horizontal overflow at a real 375px viewport) plus the separate manual
  contract-closure check described above. One test-script assumption caught and fixed before
  blaming the app: login always lands on the shared `/dashboard`, never role-routes straight to
  `/agent` — the nav link is what gets an agent there.
- **Phase 5 — done.** Topway Staff Tracking View at `/admin/tracking` (own nav link, gated on the
  `tracking` permission like the pipeline/departure/dispute actions it sits alongside) — 6 tabs,
  data pulled from the same `listCandidates()` action as the admin ATS table rather than a
  parallel query, so the two views can never disagree about what's departed or what a candidate's
  status is. **Renamed `ContractStage`'s values** (`web/src/lib/business/tracking.ts`) from Phase
  3's `PROBATION`/`MID_CONTRACT`/`APPROACHING_END`/`CLOSED` to
  `WORK_IN_PROGRESS`/`PROBATION_COMPLETED`/`MID_CONTRACT`/`CONTRACT_CLOSED` once Phase 5's spec
  made the mismatch with the *actual* tab names obvious — one vocabulary now, not two for the same
  four stages; updated the one other place (the admin table's stage filter) that referenced them.
  The first four tabs are mutually exclusive time-based stages; the last two — Remarketing
  Eligible (`isRemarketingEligible()`, unchanged from Phase 3) and Dispute Active — are
  cross-cutting, so a candidate can sit under e.g. both Mid-Contract and Dispute Active
  simultaneously, which is deliberate, not a bug (verified live: added a dispute to a
  remarketing-eligible candidate and watched it vanish from Remarketing Eligible while staying in
  Mid-Contract, exactly as `isRemarketingEligible()`'s rules say it should).
  **Change of employer/house** (`changeEmployer()` in `web/src/lib/actions/agents.ts`, its own
  dialog distinct from the quick-reassign control) closes the current `Placement`
  (`endDate`/`isCurrent=false`/`changeReason`, all required — this is the deliberate, reason-
  required event CLAUDE.md calls for, not the same code path as a plain reassignment) and opens a
  new one; an optional switch sets `remarketingDate` on the closed one, granting the former agent
  dual visibility. Verified for real: ran the full flow between two agents, confirmed the
  candidate's current-agent line updated, and confirmed the Placements tab shows both agents with
  the old one correctly marked "Remarketing visibility granted."
  **Remarketing Eligible candidates now also surface in the Agent Portal's Databank** (Phase 5:
  "These appear in the Databank for agents with access") — `listDatabankInternal()` in
  `web/src/lib/actions/agent-portal.ts` was Phase 4's `inDatabank: true` only; it's now an OR of
  that and the exact same remarketing-eligibility rule the Tracking View tab uses (one shared
  clause, not two copies that could drift), with a "Remarketing" badge on cards that got in that
  way rather than via manual opt-in. Verified live: made a candidate remarketing-eligible via SQL,
  confirmed it appeared in an `dataBankAccess` agent's Databank tab with the badge, requested
  assignment, and confirmed the request flow (built in Phase 4) worked unchanged against this
  new source of candidates.
  **Contract-closure notification, the staff-facing half**: CLAUDE.md is explicit these read
  differently for the two audiences — agents got a blocking one-time popup in Phase 4
  (`ContractClosureModal`), staff get "a banner, then dismiss. Never repeat."
  (`ContractClosureBanner`, `web/src/components/tracking-view/`). Same underlying
  `getUnseenContractClosureNotifications()`/`markNotificationSeen()` actions from Phase 4, reused
  as-is since they're already scoped by `userId`, not role — only the presentation differs.
  Verified live, separately from the modal check: forced `contractEndDate` into the past again,
  confirmed the banner (not a blocking dialog — checked `getByRole("dialog")` was absent)
  appeared with the right candidate name, dismissed it, reloaded, confirmed it stayed gone.
  Verified end-to-end with Playwright (`web/scripts/e2e-phase5.mjs`, 13 checks covering tab
  rendering and the full change-of-employer flow) plus four separate live checks for the
  stage/remarketing/dispute-interaction/banner behavior described above, run against real
  DB-seeded dates rather than asserted from reading the code.
- **Phase 6 — done.** Hardening. Two more adapter-pattern stand-ins, same shape as
  `lib/storage/adapter.ts`: `lib/kv/adapter.ts` (backs both rate limiting and the session
  blacklist — an in-memory `Map` cached on `globalThis`, same fix as the Phase 2
  `AsyncLocalStorage` bug and for the identical reason: Next.js re-evaluates a plain module-level
  singleton once per compilation layer, so it has to be a real global or state silently splits
  across layers) and `lib/email/adapter.ts` (appends JSON lines to `.local-storage/emails.log`
  instead of sending). Swapping either for a real Upstash/Resend-backed implementation later is a
  one-file change behind the same interface, once `UPSTASH_REDIS_REST_URL`/`RESEND_API_KEY` exist
  — nothing else in the app should need to change.
  **Login rate limiting** (`lib/rate-limit/login-rate-limit.ts`, wired into
  `api/auth/login/route.ts`): 10 attempts/IP/15min → 429, 5 consecutive fails on one username →
  15min lock + an email alert to that account's own address, generic 401 on every credential
  failure regardless of which check tripped. Same policy as the Phase 0 PHP stopgap, reimplemented
  natively against the KV abstraction instead of a JSON file.
  **Session blacklist**: `blacklistSession()`/`isSessionBlacklisted()` in
  `lib/kv/session-blacklist.ts`, checked in `validateRequest()` *before* the DB round-trip so it's
  a genuine fast-reject path, not just a formality — called from the logout route and both
  `revokeSession`/`revokeAllSessionsForUser` in `lib/actions/sessions.ts`. Note it's deliberately
  documented as defense-in-depth, not the sole safeguard: session-row deletion (already correct
  since Phase 1) is what actually makes a token invalid, since nothing currently caches
  `validateSession()` results across requests — the blacklist is what a future edge-cached check
  would need, built now so that optimization doesn't require revisiting the security model later.
  **Session revocation UI** extended beyond Phase 2's staff-only dialog: reused the same
  `SessionsDialog` for agents (`/admin/agents`, a "Sessions" button per row) and added
  self-service session management for every signed-in user regardless of role
  (`MySessionsCard` on `/dashboard`, using the same `listSessionsForUser`/`revokeSession` actions,
  which already allow "your own" — no new authorization logic needed).
  **Security headers** and **magic-byte validation** were already done (Phase 1's `middleware.ts`
  CSP, Phase 3's `validate-upload.ts`) — re-verified rather than re-built: curled `/login` and
  confirmed CSP/X-Frame-Options/HSTS/Referrer-Policy/Permissions-Policy are all present.
  **Verified live, not just typechecked** (`web/scripts/e2e-phase6.mjs`, 10 checks): had to fix
  the test script itself twice before trusting its results — first because section 1's deliberate
  11-request IP flood was exhausting the same fallback "0.0.0.0" bucket every other section's
  login used (none of them had set a distinct client IP), wrongly 429-ing logins in later
  sections; then because section 2's deliberate lockout target was `staff1`, a real seeded account
  section 4 needed to log into cleanly right after. Fixed by giving every section its own fake
  `X-Forwarded-For` via Playwright's `extraHTTPHeaders`, and by locking a disposable throwaway
  account instead of a real one. Final run covers: the IP cap and username lockout with a real
  parsed check of the email-alert log content (not just the 429 status), logout-then-replay
  rejection, revoking one of two live sessions from `MySessionsCard` actually logging that device
  out, and — the explicit "done means" checklist item — a staff account with `invoices: false`
  hitting the invoice PDF route *directly* (bypassing the UI redirect entirely) still gets a
  server-side 403, not a 404 or a silent pass-through. Also spot-checked outside the script: three
  different protected routes (`/api/files/[id]`, `/api/invoices/[id]/pdf`,
  `/api/candidates/[id]/pdf`) all return 401 with zero session cookie at all, and the
  agent-management "Sessions" dialog opens correctly (an apparent failure on the first pass was
  the test checking before Radix's dialog-open animation settled, not a real bug — confirmed by
  re-checking with a longer wait before concluding anything).
- **All 6 phases done.** Remaining before this is genuinely production-ready: swap the Neon/R2/
  Upstash/Resend local stand-ins for real credentials (each is a one-file change behind its
  adapter interface — see the relevant phase entries above), rotate `FILE_SIGNING_SECRET` and the
  seeded test passwords, and reconsider the Lucia v3 deprecation flagged back in Phase 1.
- **Design pass — done.** All 6 phases had shipped on shadcn's stock zero-chroma gray theme with
  no brand identity at all, and the real logo (`logo.png`, project root) had never been pulled
  into the app — called out directly by the user, and correct: this needed fixing before "done"
  meant anything visually. Not an invented palette: every color in
  `web/src/app/globals.css` traces back to a value sampled from the actual mark (a teal-to-navy
  gradient column monogram) or the legacy app's own `--teal`/`--charcoal` tokens
  (root `style.css`) — brand ink `#16242c`, brand teal `#2b6f80`, both light and dark token sets
  rebuilt around them (dark mode uses a brighter `#59acc0` for contrast, not just a dimmed teal).
  Typography: Plus Jakarta Sans for headings only (`--font-heading`, its geometric letterforms
  are the deliberate echo of the mark's column forms), Inter for everything else — a pairing
  ecosystem was already established, not a generic AI-default look (the skill's own written
  warning list: cream+serif, near-black+neon accent, broadsheet hairlines — none of those apply
  here; this is a light, warm-porcelain B2B ops surface with a dark brand chrome bar).
  **Two real, non-decorative bugs found only by screenshotting the result, not by
  typecheck/build** (same pattern as every phase's `AsyncLocalStorage`/CSP-nonce findings —
  worth remembering this project's rule of thumb: a UI change isn't verified until it's been
  looked at):
  1. **Dark mode was completely dead** — `globals.css` had a full `.dark` token set since Phase 1
     (shadcn's own scaffold), but nothing in the app ever added the `.dark` class anywhere, so
     every dark-mode style was unreachable regardless of system preference. `next-themes` was
     already an installed dependency (`sonner.tsx` calls `useTheme()`) but its `ThemeProvider`
     had never actually been mounted. Fixed in `components/providers.tsx` — `attribute="class"`,
     `defaultTheme="system"`. Its pre-paint script is inline, so it also needed the same
     CSP nonce every other Next-injected inline script already gets (`nonce` prop, threaded from
     `layout.tsx`'s existing `x-nonce` header read) — confirmed no CSP violations in the server
     log after wiring it in, not assumed.
  2. **The app-shell header logo was invisible** — used the full lockup (`logo.png`, mark stacked
     above the "TOPWAY PRIVATE LIMITED" wordmark) squeezed into a 26×18px box; the actual T-mark
     within that full image occupies roughly the top 47%, so at that size it rendered as a
     handful of illegible pixels. Cropped a standalone mark-only asset (`public/mark.png`, via
     Pillow — located the exact row/column gaps between the mark, "TOPWAY", and "PRIVATE LIMITED"
     programmatically rather than eyeballing crop coordinates) and swapped the header to use that
     instead; the full lockup stays on the login screen where it's rendered large enough to read.
     Confirmed fixed by cropping and re-inspecting the actual screenshot pixels, not just
     re-reading the JSX.
  Also generated real favicon/app-icon assets from the same mark crop (`app/icon.png`,
  `app/apple-icon.png` — Next's file-based icon convention) and removed the unused
  create-next-app placeholder SVGs from `public/`, which had been sitting there since Phase 1.
  Redesigned, verified via Playwright screenshots at both real breakpoints and both color
  schemes: `/login` (a two-panel layout — brand gradient panel with the mark, a faint
  architectural column motif echoing it, and one line of real product framing on desktop;
  collapses to a single porcelain panel with just the compact lockup on mobile, since agents sign
  in from phones) and the app shell header (dark ink-to-teal gradient bar, pill-shaped active nav
  state, consistent across every authenticated page since it's the persistent chrome). Everything
  else in the app — the ATS table, invoices, tracking tabs, forms, dialogs — inherits the new
  look for free through the same shadcn primitives every phase was already built on, which is
  what makes the token-layer rewrite the highest-leverage single change here; spot-verified
  candidates/invoices/agent-portal-mobile in both color schemes rather than assuming the cascade
  held everywhere. Screenshot + credential-driven Playwright scripts used for this
  (`web/scripts/screenshot.mjs`, `web/scripts/screenshot-authed.mjs`) are kept alongside the
  e2e-phaseN scripts for future design verification, not deleted as scratch work.
- **Design pass — rejected by user, redo pending.** The user's verdict on the pass above: "The
  asthetics and user experience are rubbish this needs to completely change." Explicitly asked to
  see 2-3 distinct visual-direction mockups before another attempt lands on the live app — that
  work has not started yet, and the live app is still running the rejected teal theme in the
  meantime. **Do not restyle the live app again until a direction is picked from mockups.**
  In the same message the user separately drew a hard line that is unrelated to the aesthetics
  complaint and must not be conflated with it: the candidate-profile PDF and invoice PDF "cant
  change at all" — revert both to the legacy format exactly, permanently exempting them from
  whatever the eventual redesign becomes. That reversion is done (see below); the mockup-first
  redesign is still outstanding.
- **PDF format reversion — done.** `web/src/lib/pdf/candidate-pdf.tsx` and
  `web/src/lib/pdf/invoice-pdf.tsx` are exact ports of the legacy `index.html` `#pdf-layout` /
  `invoice.html` `buildPrintTemplate()` — every color/size/weight/layout value traced back to the
  legacy source (px→pt at ×0.75) rather than reinvented, per the user's explicit "cant change at
  all." `web/src/lib/pdf/fonts.ts` registers real Inter weights (500-900) for `@react-pdf/renderer`
  since the legacy CSS leaned on that weight range and react-pdf's built-in Helvetica only has
  Normal/Bold — plain `.ttf` files converted once from `@fontsource/inter`'s `.woff`
  (`web/src/lib/pdf/fonts-ttf/`, checked in).
  **Two real bugs found only by rendering actual PDFs to images and looking (PyMuPDF `page.
  get_pixmap()`), not by typecheck/route-200 checks** — same "a change isn't verified until it's
  been looked at" rule the Design pass section above already learned the hard way:
  1. Both templates use the exact glyphs legacy used for icons/marks (✕ checkbox mark, ✉/☎/📠/📍
     contact icons) — legacy renders these fine because html2canvas paints them via the browser's
     own emoji font, independent of the page's declared `font-family`. `@react-pdf/renderer`
     doesn't do font-fallback for missing glyphs the way a browser does: Inter has none of these,
     so BMP symbols (✕, ✉, ☎) silently drew nothing (every checked skill/language box looked
     empty — a real information-loss bug, not cosmetic) and the two supplementary-plane emoji
     (📠, 📍) rendered as corrupted overlapping glyphs. Fixed by substituting plain-text
     equivalents that exist in Inter: `X` for the checkbox mark (visually near-identical at that
     size/weight), `Email:`/`Tel:`/`Fax:`/`Address:` labels for the contact footer — the same
     category of deliberate, documented substitution as the pre-existing Georgia→Times-Italic swap
     for the "Thank you" serif (licensing), not a new default guess.
  2. The invoice PDF was rendering a raw internal JSON blob as visible page text. Context:
     `migrate-legacy-data.ts` (Phase 1) deliberately preserved legacy fields with no schema home
     (billTo title/company/purpose/licenseNo, serviceType, paymentMethod, bankDetails,
     companyFooter) as JSON appended to `Invoice.notes` behind a `MIGRATED FROM LEGACY` marker,
     rather than inventing schema — a good call, but a later invoice-pdf.tsx rewrite just printed
     `invoice.notes` verbatim into the footer, which for every migrated invoice *is* that JSON
     dump. Also `CompanySettings` (the Phase 2 singleton meant to back bank details/footer) had
     sat completely empty since creation — nobody had populated it, so bank details rendered
     blank even before the JSON-leak bug. Fixed both: `invoice-pdf.tsx` now parses the migrated
     blob back out (`parseMigratedInvoiceData`) and prefers it per-invoice for billTo/serviceType/
     paymentMethod/bankDetails/companyFooter — bank details in particular genuinely varied
     invoice-to-invoice historically (two different real bank accounts show up across the 4
     migrated invoices), so this can't be flattened into one constant the way `CompanySettings`
     alone would; `CompanySettings` is backfilled with the real (previously-empty) company footer
     + a sensible bank-details default and stays the fallback for invoices created fresh in the
     new app, which won't carry a migrated blob. `humanNotes()` strips the JSON/marker back out so
     a genuine admin-written note (the new app's actual `notes` textarea, unrelated to migration)
     still shows, exactly where legacy showed it, without the migration payload leaking.
  A third apparent bug — a 500 on `/api/candidates/[id]/pdf` that persisted across several font-
  format changes (woff2→woff→ttf) and looked like a real fontkit crash (`RangeError: Offset is
  outside the bounds of the DataView` in `_addGlyph`) — turned out to be stale dev-server module
  cache from before the ttf fix landed, not a real bug: a standalone Node script importing the
  actual `CandidatePdfDocument` component directly (bypassing Next's dev server entirely) rendered
  it successfully on the first real diagnostic run, and a `npm run dev` restart made the live
  route succeed too. Confirmed via `web/scripts/fetch-pdf.mjs` (kept, reusable — logs in via
  Playwright, fetches a PDF route directly, saves to disk) plus re-running Phase 2's
  `e2e-phase2.mjs` (17/17, including the PDF-route checks) after the fix.
- **Legacy candidate/agent photos — migrated.** Prompted by the user noticing headshot/full-photo
  placeholders where real photos used to be: `migrate-legacy-data.ts`'s own header comment had
  always documented this as deferred — "Legacy image/document filenames are recorded in the
  migration report instead, so Phase 3's file-migration step knows what to upload" — but Phase 3
  built the Document/StorageAdapter machinery and never actually ran that backfill, so every
  migrated candidate (20 of 21) has had an empty document set and every migrated agent an empty
  logo since Phase 1. New one-off script, same standalone-script precedent as
  `migrate-legacy-data.ts`: `web/scripts/migrate-legacy-files.ts` (`npm run
  db:migrate-legacy-files`, idempotent) reads `migration-report.json`'s legacyId→newId mapping,
  matches each candidate's `{legacyId}_{headshot|fullPhoto|doc-passport|doc-alteration}_*` files
  and each agent's `agentlogo_{legacyId}_*` file in the project-root `uploads/`, magic-byte
  validates them, and writes them into the same local-disk storage adapter + Document/
  `Agent.logoR2Key` a real upload through the app would produce (opaque UUID keys, no shortcuts).
  Ran once: 76 of 84 possible candidate documents created (8 candidates genuinely had no file for
  a given type in legacy — not silently invented) and 2 of 5 agent logos set (the other 3 agents
  never had a legacy logo either; one further logo file in `uploads/` — `agentlogo_agent_grma_*`
  — doesn't match any agent's actual legacyId in the migration report and was correctly left
  alone rather than guessed at).
  **Found a second, previously-latent real bug in the process** — same "an image bug doesn't show
  up until you actually render and look" lesson as the checkbox-glyph fix above:
  `/api/candidates/[id]/pdf/route.ts` hardcoded `"image/png"` as the agent-logo data URI's MIME
  type, instead of using the real one the way it correctly does for headshot/fullphoto (which
  read `mimeType` off their `Document` row). `Agent.logoR2Key` has no companion mimeType column,
  so this was silently wrong for any non-PNG logo — react-pdf/pdfkit fails to decode JPEG bytes
  labeled `image/png` and just renders an empty box, no error thrown. Never caught before because
  no agent had a logo at all until this migration populated one. Fixed by sniffing the real MIME
  from the fetched bytes (`detectMimeFromBytes`, the same magic-byte check upload already uses)
  instead of assuming. Verified by rendering the actual candidate `cmt53olzx0003dtstda5gb14t` (a
  real migrated record with a real agent logo) to a PNG via PyMuPDF and looking at it — headshot,
  full photo, and agent logo (a wide bilingual English/Arabic banner mark, an aspect ratio nothing
  in earlier testing had exercised) all render correctly now.
- **Redesign — Direction 2 "The Register" — done.** The rejected design pass above was followed
  up correctly this time: built two full mockup directions as an Artifact (Command Deck — dark
  sidebar console; The Register — warm registry with folder-tab nav) grounded in the app's real
  data (22 candidates, 2 disputes, 8 agents, $9,300 invoiced) rather than lorem, and the user
  picked Direction 2 from a side-by-side comparison before any live code changed — the process the
  first pass skipped. Both directions kept the real brand teal/ink (the logo isn't up for
  reinvention); what differs is IA, density, and type. Applied to the live app:
  - **Tokens** (`globals.css`): warm stone paper (`#f1efe9`) replaces the cooler grey porcelain,
    ink shifts to a teal-black (`#20302e`), added semantic `--good`/`--warn`/`--critical` tokens
    (swept into `status-chip.tsx` and `dispute-panel.tsx`, replacing hardcoded Tailwind
    amber/red/green literals that predated this token system and would otherwise have clashed with
    the new warm ground). Full dark variant redefined alongside, not just the light side.
  - **Type**: Fraunces (headings) replaces Plus Jakarta Sans — a serif with real document-office
    gravitas, fitting a tool that spends its day on passports and case files, chosen over a generic
    template serif. Added IBM Plex Mono (`--font-mono`, replacing Geist Mono, which had no
    connection to this project) for anything that's a figure or reference/passport/invoice number —
    "counted, not decorated."
  - **App shell** (`app-shell.tsx`): the single dark pill-bar nav is gone — replaced with a
    teal-deep masthead + a row of folder-style tabs (`Dashboard`/`Candidates`/`Tracking`/etc.) that
    visually fuse with the page background when active, echoing an index tab on a case file. Solves
    a real scaling problem the pill-bar never had an answer for (nav items only grow from here) —
    still horizontally scrollable on mobile, spot-checked at 375px via the agent portal (Phase 4's
    e2e script's "no horizontal overflow at 375px" check still passes).
  - **Dashboard** (`lib/actions/dashboard.ts`, `components/dashboard/{ops,agent}-dashboard.tsx`) —
    the actual point of this pass, per the user's explicit "dashboard is stupid": it was a
    "logged in as X" bio card with nothing to act on. Replaced with a real content thesis — what
    needs a decision right now (open disputes, unseen contract-closure notifications, overdue
    invoices, severity-dotted and permission-gated the same way the nav already hides
    invoices/agents links), then a "Register" pipeline breakdown (`deriveContractStage()` bucket
    counts across every ACTIVE candidate, rendered as a stamped checklist), then recent activity
    (newest candidates + disputes — deliberately NOT the AuditLog table, which is admin-only per
    the permissions matrix; this feed has to be staff-visible too, so it's built from data everyone
    can already read), then quick actions. ADMIN and STAFF get this full ops view (STAFF sections
    gated by the same `applications`/`tracking`/`invoices`/`agents` permission flags the nav uses);
    AGENT gets a deliberately light "your day" card — candidate count, unseen-notification count,
    upcoming milestones via `deriveMilestoneLabel()` — that points at `/agent` rather than
    duplicating Phase 4/5's already-good Agent Portal in a second place. All numbers are live
    queries, nothing is mocked.
  - **Candidate detail: side sheet → centered popup**, the user's explicit UX call after reviewing
    the directions ("not a side slide"). `candidate-detail-sheet.tsx` → `candidate-detail-dialog.tsx`
    (Radix `Dialog`, same primitive every other confirmation modal in the app already used — just
    widened to `max-w-2xl` with internal scroll for a record this dense) with all three call sites
    (`candidate-table.tsx`, `tracking-view.tsx`, `agent-portal/my-applications.tsx`) updated. Same
    query/mutation logic, unchanged — only the chrome around it moved.
  Verified live (not just typechecked): screenshotted login, both dashboard shapes (ADMIN and
  AGENT), the candidate popup mid-open, the candidates table, and the invoices page, each in both
  color schemes where relevant, plus the agent portal at a real 375px viewport for zero overflow.
  Re-ran the Phase 2/3/4/5/6 Playwright suites afterward as a full regression check: 2 (17/17), 4
  (14/14), and 5 (13/13) clean; 3 hit the same pre-existing leftover-test-data table-lookup flake
  already documented in its own CLAUDE.md entry (unrelated to this change — confirmed by rerunning
  against a freshly restarted dev server, which cleared a stray rate-limit 429 from the volume of
  screenshot logins in this session but left the same flake); 6 had one failure ("lockout wrote an
  email alert to the local email log") in code this pass never touched (the Phase 6 rate-limiter's
  email adapter) — flagged as a separate follow-up, not chased down here to avoid scope creep into
  unrelated security-hardening code while mid-redesign.
- **Agent Portal fixes + Blacklist Portal — done.** A follow-up round from the user, mostly asking
  to verify/complete things against a spec they described directly rather than pointing at
  CLAUDE.md — checked each item against the actual code before touching anything (several turned
  out to already be correct):
  - **Applications vs. Databank**: was already two Radix `Tabs` nested under one `/agent` route;
    the user's literal ask ("separate Applications and Candidate Databank") is now honored more
    directly — `/agent` and `/agent/databank` are two real top-level nav routes (folder tabs in
    the masthead, not nested tabs on a page), with a new `(app)/agent/layout.tsx` holding the
    shared `ContractClosureModal` so it isn't duplicated across (or dropped from) either page.
    Assignment from the databank is still request→admin-approval, not self-service — that was a
    deliberate Phase 4 design decision per CLAUDE.md, not something this message asked to change.
  - **Applicant category in the list**: already shown (`WORKER_CATEGORY_LABELS` badge on every
    card) — verified, not rebuilt.
  - **Probation days per country (3/6/6/9 months) and 2-year contract closure**: already exactly
    right (`PROBATION_DAYS` in `business/tracking.ts` is 90/180/180/270 days; contract end is
    `departureDate + candidate.contractDuration` months, which the wizard defaults to 24) — no
    code change, verified by reading, not assumed.
  - **On Hold / Cancelled / Resume**: already fully built (Phase 3) — verified, not rebuilt.
  - **Dispute chips showing generic "Dispute" instead of the actual type/reason** — this WAS a
    real gap: the admin ATS table, the agent portal's application cards, and (by construction) the
    new dashboard's attention queue all had access to `dispute.type` in the query but only ever
    rendered a hardcoded "Dispute" label. Fixed by threading `activeDisputeTypes: DisputeType[]`
    through `listCandidates()`/`listMyApplications()` and rendering the real
    `DISPUTE_TYPE_LABELS[...]` value (with a "+N" suffix for multiple).
  - **Staff permission leak ("Abdul Basit... was not given Invoice access, but he can still see
    it")**: investigated hard, could not reproduce. Traced the whole path — the create/edit
    Switches in `permissions-fields.tsx`, the `updateStaff` action, `/invoices/page.tsx`'s
    server-side redirect, and the nav's own gating — and built a live Playwright repro that
    granted `invoices:true`, logged the staff member in, confirmed nav+access, then had ADMIN
    revoke the permission in a *separate* browser context while the staff session stayed open
    (no logout) — nav hid the link and `/invoices` redirected to `/dashboard` immediately, no hard
    refresh needed. Reported honestly rather than claiming an invisible fix: the code is correct
    under direct testing of the exact reported scenario. Most likely explanation is a one-off data/
    UI mistake on that specific account, or testing against a stale build (this session already
    hit one genuine stale-`.next`-cache false alarm earlier, during the PDF work) — flagged to the
    user to retest rather than assumed fixed.
  - **Blacklist Portal — new.** The user's own framing made the design call for us: "when agents
    start using this platform, disputed candidates can be identified through the system, including
    which agent handled the candidate... avoid repeated problems." Built as a derived view, not a
    new model/manual flag — same "derived, never manually set" philosophy as
    `deriveContractStage()`/`isRemarketingEligible()`: `listBlacklist()`
    (`lib/actions/blacklist.ts`) reads straight off the existing `Dispute` → `Candidate` →
    `Placement` → `Agent` chain, attributing each dispute to whichever placement was active on the
    date it was reported (not just whoever has the candidate now) — no schema migration needed.
    New `/blacklist` route, its own nav item for every role: ADMIN always, STAFF gated on
    `tracking` (the same flag that already governs dispute visibility in the Tracking View, not a
    new permission), and every AGENT unconditionally — the point is every company on the platform
    sees it, not just databank-enabled ones. A candidate with zero disputes never appears.
  - **Motion/feel polish**: the user's "animations and look and feel are still poor" got a
    targeted pass, not a rewrite — confirmed `tw-animate-css` (already imported) is what backs
    every Radix dialog/tab's open/close motion; added a `motion-safe`-guarded staggered
    fade+slide-in entrance to the dashboard's header/KPI-row/two-column sections, and hover states
    to candidate table rows and KPI cells that had none. Deliberately restrained — no new flashy
    hero motion, per the project's own established design-skill guidance about not over-animating.
  Verified live: screenshotted the Blacklist portal (real disputed test candidates, correct
  "handled by" attribution, correctly empty "no agent on record" when no placement covered the
  dispute date) and the agent nav showing all three separate top-level tabs (My Applications /
  Databank / Blacklist). Re-ran Phase 2 (17/17) and 4 (14/14, after updating its own
  `getByRole("tab", ...)` assertions to `getByRole("link", ...)` now that Databank is a real route,
  not a nested tab — a necessary test-script update, not a workaround) clean. Phase 3 needed its
  dispute-chip assertion updated (expects "⚠ Other", the form's default dispute type, instead of
  the old generic "⚠ Dispute" text — the app's label genuinely changed, on purpose) and then, on
  repeated reruns, kept surfacing a *different* specific failure each time (a strict-mode
  `getByText("Musaned")` collision between the ATS table and the pipeline stepper on one run,
  the `/admin/candidates`-while-logged-in-as-agent cell lookup on another) — all traceable to the
  same pre-existing, already-documented root cause: this script leaves a new row in the dev DB on
  every run with no cleanup, and re-running it repeatedly in one session (as this pass did, chasing
  the flake) only compounds the pollution. Confirmed non-regression by reading the actual
  colliding code each time rather than assuming: a later step that navigates to
  `/admin/candidates` **while still logged in as the agent** times out waiting for a table
  `role="cell"` that can never exist there — `/admin/candidates` redirects agents to `/agent`,
  which renders Cards, not a table — confirmed by reading both files that this redirect and the
  card-based agent UI both predate this session, so it isn't something introduced now.
- **GitHub + Supabase — done.** The user asked to push this to GitHub and move the database to
  Supabase. Repo: root-level `.gitignore` added (there wasn't one) excluding the legacy app's real
  candidate data — `data/` and `uploads/`, 126 real photos/passport numbers — since it's already
  fully migrated and nothing running needs it; `web/.gitignore` already correctly excluded
  `.env*`/`.local-storage/`/migration output. Public, per the user's explicit choice. Later moved
  to a second GitHub account the user logged into mid-session — `gh auth login` (device-code flow,
  the same non-interactive-friendly pattern used for Supabase below), then a fresh
  `gh repo create` + `git remote set-url` under the new account (the original repo under the first
  account was left alone, not deleted — that's not a reversible action to take unasked).
  **Supabase**: created via the `supabase` CLI (`npx supabase`, logged in with a personal access
  token the user generated, since — unlike `gh`— it has no device-code fallback for a non-TTY
  session) rather than walking the user through the dashboard by hand: `supabase projects create`
  (ap-southeast-1/Singapore — closest low-latency region to Sri Lanka and the candidates'
  destination countries), `prisma migrate deploy` to lay down the schema, a private
  `candidate-files` bucket created via a one-off script using the same `@supabase/supabase-js`
  client the real adapter uses. New `src/lib/storage/supabase-adapter.ts` implements the existing
  `StorageAdapter` interface (upload/download/delete/createSignedUrl via the Storage API);
  `src/lib/storage/adapter.ts` now picks it over the local-disk stand-in whenever `SUPABASE_URL`
  is set — no other file needed to change, confirming the adapter-interface investment from Phase
  3 paid off exactly as intended. Data: reseeded clean rather than copying over the local dev DB's
  accumulated e2e-test-script pollution — reran `db:seed` + `migrate-legacy-data.ts` +
  `migrate-legacy-files.ts` + a small `backfill-company-settings.mjs` (kept, idempotent) fresh
  against the empty Supabase DB, landing exactly the real 20 candidates / 5 agents / 4 invoices /
  bank details, nothing else.
  **Two real, non-obvious bugs found only by actually driving the app against the new backend, not
  by the migration scripts reporting success** — the same lesson every phase in this file has
  already learned once:
  1. **Interactive-transaction data loss under PgBouncer transaction-mode pooling.** `DATABASE_URL`
     was first set to Supabase's "Transaction" pooler (port 6543). `createInvoice`/
     `duplicateInvoice`'s sequential-numbering logic (`db.$transaction(async (tx) => {...},
     {isolationLevel: Serializable})`) is a genuine interactive transaction — and PgBouncer's
     transaction-pooling mode can route different statements within one logical transaction to
     different backend connections, silently breaking that guarantee. Symptom was ugly precisely
     because it wasn't a thrown error: the UI reported success and navigated to the new invoice's
     detail page, but the row was never actually in the database — caught by directly querying
     Supabase after an e2e run claimed success and finding only the 4 original migrated invoices,
     not 5. Fixed by pointing `DATABASE_URL` at Supabase's **session-mode** pooler (same pooler
     host, port 5432 instead of 6543) instead — one backend connection per client for the session's
     duration, so interactive transactions and prepared statements work like a real direct
     connection while staying pooled/IPv4-friendly; `DIRECT_URL` (Prisma Migrate only) stays the
     true direct connection. Full reasoning left as a long comment in `prisma/schema.prisma` and
     `.env.example` specifically warning against flipping this back to port 6543 without also
     restructuring `createInvoice`/`duplicateInvoice` off interactive transactions.
  2. **CSP blocked every candidate photo thumbnail.** `middleware.ts`'s `img-src` was `'self' data:
     blob:` — correct for the local-disk stand-in (its signed URLs are same-origin) but Supabase's
     signed URLs point at `https://<ref>.supabase.co`, a different origin, so the browser silently
     dropped every `<img src>` using one (candidate table avatars, agent portal cards) with a CSP
     console error — the candidate PDF route wasn't affected and kept working, because it fetches
     bytes server-side via `storage.getObject()` and never goes through `img-src` at all, which is
     exactly why this stayed invisible to the PDF-focused verification until an e2e run's console
     output was actually read. Fixed by adding the Supabase project's origin (derived from
     `SUPABASE_URL`, not hardcoded) to `img-src` only when it's set.
  Also found and fixed a latent bug in `e2e-phase2.mjs` itself while investigating: its
  invoice-created check used `/\/invoices\/[a-z0-9]+$/`, which — being case-insensitive-oblivious
  lowercase-only — also matches the literal word "new". Against local Postgres the create→redirect
  was always fast enough that this never mattered; against Supabase's real network latency, a
  premature URL read could catch the page still on `/invoices/new` and silently build a bogus
  `/api/invoices/new/pdf` check instead of failing loudly at the real assertion. Fixed to wait for
  the actual redirect and exclude "new" explicitly.
  **Verified live, end to end, not just via migration-script exit codes**: reran Phase 2 to a full
  clean 17/17 against the real Supabase DB (this specifically exercises the fixed transaction path
  — invoice creation, status transition, PDF generation all for real); a candidate PDF fetched and
  rendered to an image via PyMuPDF showing a real photo pulled through Supabase Storage, twice, to
  confirm the first request wasn't a fluke; the ATS table's signed-URL thumbnails loading with zero
  CSP console errors after the fix (versus two visible violations before it). Phases 4/5/6 show
  a mix of real passes (all of Phase 6's actual security assertions — rate limiting, lockout,
  session revocation, permission enforcement — passed) and toast/visibility-timing failures with
  zero server-side errors alongside them; spot-checked two of those directly against the DB
  (a databank request + approval, an invoice creation) and confirmed the underlying writes had in
  fact succeeded — these are the scripts' hardcoded wait times, tuned for local Postgres latency,
  now sometimes too tight for a real network round trip to Singapore, not new product bugs. Not
  chased down further in this pass (a full audit of every wait in every e2e-phaseN script is a
  separate, mechanical follow-up) to avoid unbounded scope creep on top of an already large
  infrastructure change.
  **Still local-only / not yet done**: Upstash Redis (rate limiting/session blacklist still the
  in-memory stand-in) and Resend (email still the local `.log` stand-in) — same adapter-swap
  pattern as storage, whenever the user wants those provisioned too.
- **Live on Vercel — done, after finding and fixing a real connection-pooling architecture
  problem the hard way.** The user pointed out an existing Vercel deployment
  (`topway-mu.vercel.app`) was showing the legacy static `admin.html`, not the rebuilt app —
  traced to: the Vercel project (under the newer `shibz786`-linked GitHub account, connected via
  auto-deploy on push) had Root Directory `.` and no framework detected, since the real app lives
  in `web/`, not the repo root. `gh`/`vercel` CLI auth both used the same non-interactive
  device-code pattern (a URL the user opens and approves in their own browser — `gh auth login`
  falls back to this automatically outside a TTY; `vercel login` does too). Fixed Root Directory
  (`web`) and framework (`nextjs`) via the Vercel Management API (no CLI subcommand for either),
  pushed the real env vars, and hit a real Prisma+Vercel gotcha immediately: Vercel caches
  dependencies, which skips Prisma's postinstall codegen, so the client is stale — fixed with a
  `"postinstall": "prisma generate"` script (the standard fix; not optional once deployed here).
  **Then a real, three-iteration architecture problem**, each iteration a genuine live failure,
  not a guess — full story lives as a long comment on the `datasource` block in
  `web/prisma/schema.prisma` (read that before ever touching `DATABASE_URL`/`DIRECT_URL` again):
  1. `DATABASE_URL` on Supabase's transaction-mode pooler (port 6543) broke invoice-number
     allocation's interactive `$transaction()` (SERIALIZABLE isolation) — PgBouncer's
     transaction-pooling mode can route different statements within one logical transaction to
     different backend connections. Symptom was silent, not a thrown error: `createInvoice`
     reported success and navigated to the new invoice's page, but the row was never actually
     written — caught by directly querying the database after a "successful" test run.
  2. Switched to session-mode pooling (port 5432, same pooler host) — interactive transactions
     work correctly there, but it broke under real concurrent Vercel traffic instead: each
     serverless instance holds one dedicated connection for its whole lifetime in session mode,
     and session mode's connection budget is much smaller (this project: hard-capped at 15) —
     the very first login on a fresh deploy succeeded, every one after it failed with
     `FATAL: max clients reached in session mode`.
  3. Tried adding a *second* Prisma client (`dbDirect`) bound to a session-mode connection, used
     only for the app's handful of genuinely interactive transactions (rare enough that #2's
     budget shouldn't matter) — this is a legitimate, commonly-recommended pattern in principle.
     A raw TCP probe (a temporary diagnostic route, deleted after use) confirmed the port was
     reachable in under 250ms. But every actual Prisma query through it still just hung
     indefinitely with no error at all, never conclusively diagnosed (leading theory: Supabase's
     Supavisor pooler accepts the TCP/protocol handshake into its own listener but then queues
     waiting for a free session-mode backend slot rather than rejecting outright once the
     underlying pool state gets murky — never confirmed with certainty, and not worth further
     time once the real fix below existed anyway).
  **The actual fix was eliminating the need for a second connection entirely**, not finding the
  "right" one:
  - Invoice numbering is now a real Postgres `SEQUENCE` (`invoice_number_seq`,
    `prisma/migrations/20260824030000_invoice_number_sequence`, started at 5 to continue past the
    4 real legacy-migrated invoices) — `nextval()` is a single atomic statement, safe under any
    pooling mode, no transaction of any kind required. `createInvoice`/`duplicateInvoice` shrank
    from a 5-attempt retry loop inside a SERIALIZABLE transaction to two lines.
  - Every other interactive (callback-form) `$transaction(async (tx) => ...)` in the app —
    `updateInvoice`/`deleteDraftInvoice`, `agents.ts`'s `assignCandidateToAgent`/`changeEmployer`,
    `notifications.ts`'s contract-closure batch + databank-request approval — got restructured to
    read any data it needed to decide what to write *before* the transaction (fine on the regular
    pooled connection; all of these are low-frequency, human-driven actions, not a hot path where
    a race would matter in practice), then execute the actual writes via the **array-batch** form
    (`db.$transaction([queryA, queryB])`), which — unlike the callback form — Prisma sends as one
    self-contained batch and IS safe under transaction-mode pooling. `runAsActor()` wraps the
    whole batch call (not each query individually — the array form needs literal query-builder
    expressions as its elements, not the result of another async wrapper), which correctly
    threads the audit middleware's actor context per the same rules already established in
    Phase 2/3/4's `AsyncLocalStorage` findings.
  `DATABASE_URL` is back on the transaction-mode pooler (`?pgbouncer=true&connection_limit=1`) —
  scales to many concurrent serverless instances, which is what actually matters for this
  deployment target — and `dbDirect` was removed from `lib/db.ts` entirely rather than left as
  unused, unreliable-under-Vercel infrastructure someone might reach for later.
  **Verified live, repeatedly, against the actual production deployment** (not just a green
  build): `web/scripts/verify-prod.mjs` (kept, `npm run verify:prod-login`) fires 5 concurrent
  logins at `topway-mu.vercel.app` — all 5 succeed now, versus exhausting the connection pool
  after the very first one at each of the two earlier broken configurations. `web/scripts/
  verify-prod-invoice.mjs` (kept, `npm run verify:prod-invoice`, self-cleaning — deletes the test
  invoice it creates once confirmed) creates a real invoice through the deployed app and confirms
  the row actually exists in the database with the correct sequence-allocated number, run twice
  to rule out a fluke.
  **A real secret-exposure incident happened during this work and needs the user's action**: a
  `grep` run to sanity-check `.env` after an edit printed the real Supabase database password to
  this session's own tool output in plaintext. Rotation was attempted immediately via the
  Supabase Management API (`PATCH /v1/projects/{ref}` with `db_pass` — undocumented in the public
  API reference, found by trial; no CLI subcommand exists for this) — the call returned success
  but the new password never actually took effect after two separate wait-and-recheck cycles
  (~5+ minutes total, verified both directions with real `psql` connections each time, not
  assumed). Stopped retrying rather than keep guessing at an unreliable API and flagged this to
  the user directly: **the database password still needs manual rotation via the Supabase
  dashboard** (Project Settings → Database → Reset Database Password) — `.env` and Vercel are
  still on the original (now-exposed) password, which the app depends on until that's done, so
  send the new one over once rotated and it gets wired into both places in one pass.
- **Fixed the real cause of "the whole platform is slow" — Vercel/Supabase region mismatch.** The
  Vercel project's serverless function region was the default `iad1` (US East, Washington DC);
  the Supabase project is `ap-southeast-1` (Singapore) — every single database round trip on
  every page was crossing half the globe. Not a guess: confirmed by checking the project's actual
  `serverlessFunctionRegion` via the Vercel Management API (no CLI subcommand exists for this
  either), and by the exact symptom shape matching a network-latency problem — every page slow,
  not specific features. Fixed by setting `serverlessFunctionRegion` to `sin1` (Singapore) via the
  same API. Impact measured directly, before/after, with the same two scripts already in the repo:
  `verify:prod-invoice` went from 20 to 28 seconds down to under a second; `verify:prod-login`'s 5
  concurrent logins went from ~7s each to ~2.5-3s (the remainder is real Argon2id hashing cost,
  not network latency). This single setting change was a bigger win than anything else touched in
  this pass — worth remembering if the platform ever feels slow again after moving infrastructure.
- **Fonts: Fraunces + IBM Plex Mono → Geist + Geist Mono.** The user asked for "more modern
  appropriate fonts" — Fraunces (a serif, "The Register" direction) read as more traditional/
  document-office than current; swapped headings and the data/mono role to Geist/Geist Mono (both
  available directly via `next/font/google`), keeping Inter for body copy since it was already
  modern and nobody had a complaint about it specifically. Geist is a deliberate pick beyond just
  "a modern sans" — it's Vercel's own typeface, and this app is deployed on Vercel, so it's a
  genuine fit for the surface it runs on, not an arbitrary swap. `--font-heading` and `--font-mono`
  in `globals.css` repointed accordingly; verified live via screenshot (login page, dashboard)
  rather than assumed from the code.
- **Em dashes removed from user-facing text.** Swept every `.ts`/`.tsx` file for em dashes (`—`)
  outside comments (comments are internal documentation, not something a user of the platform
  ever sees, and this codebase's comment style leans on them heavily — rewriting those would have
  touched thousands of lines of historical reasoning for zero user-facing benefit, so left alone
  deliberately) and rewrote each into plain punctuation that reads naturally (periods, commas,
  colons, depending on what the sentence actually needed) rather than a blind find-replace.
  Table-cell placeholder dashes (e.g. "no date set" shown as a dash) became a plain hyphen instead
  of just deleting the visual cue entirely. Two intentional exceptions, left alone on purpose: the
  em dash inside the candidate/invoice PDF templates (`lib/pdf/candidate-pdf.tsx`,
  `lib/pdf/invoice-pdf.tsx`) is an exact character-for-character replication of the legacy PDF
  format, which the user separately declared "cant change at all" — a stronger, more specific
  instruction than this one, so it wins; and the `MIGRATION_MARKER` sentinel string in
  `invoice-pdf.tsx` is never actually displayed to anyone (it's stripped out by `humanNotes()`
  before rendering), so there was nothing to gain by editing it.
- **Invoice advance payments — done.** The user asked directly: "for invoices, there needs to be
  options to list advance paid... even if we are requesting for advance we should be able to do
  that." A real legacy feature — `invoice.html` has a None/Requested/Paid advance select plus an
  amount, and `migrate-legacy-data.ts` had already preserved it per-invoice as JSON inside
  `Invoice.notes` (see the `MIGRATED FROM LEGACY` blob referenced above) precisely because the
  original schema had nowhere else to put it — but nothing in the rebuilt app ever exposed it as
  an actual feature until now. Added real columns instead of leaving it stuck in the notes blob:
  `Invoice.advanceStatus` ("NONE"/"REQUESTED"/"PAID", default "NONE") and `Invoice.advanceAmount`
  (nullable Decimal), migrated live against Supabase. `computeAmountDue()`
  (`lib/actions/invoices.ts`) is the one place the reduction rule lives: an advance only reduces
  what's owed once it's actually **PAID** — a merely **REQUESTED** advance is a note to the reader,
  not money in hand yet, matching `invoice.html`'s own calculator (`total = workersSum -
  (status === 'paid' ? advanceAmt : 0)`) exactly rather than reinventing the rule. Wired through
  every layer that touches an invoice's total:
  - **Form** (`invoice-form.tsx`): an Advance select + amount input next to the line items, with a
    live "Subtotal ... less advance paid ..." / "Amount due" preview via RHF `watch()`, matching
    invoice.html's own live calculator bar. Validation (`invoiceFormSchema` in
    `lib/validation/invoice.ts`) requires a nonzero amount whenever status isn't "NONE". The
    read-only view for a non-draft invoice (can't be edited past Draft, per the existing status
    workflow) got a real summary card in the same pass — it used to show almost nothing useful.
  - **List** (`invoice-list.tsx`): an "Amount due" column (strikethrough original total shown
    alongside when an advance changes it) and an "Advance" badge column (amber "Advance
    requested" / red "Advance paid" — "None" renders nothing, same as legacy's calculator omitting
    an empty advance row entirely).
  - **PDF** (`lib/pdf/invoice-pdf.tsx`): exact port of `invoice.html`'s `advanceHtml` block — a
    gray "Subtotal" row plus an amber "Advance Requested" / red "Less: Advance Paid" row inserted
    into the services table right after the line items, only when status is requested/paid with a
    real amount (never for "None"). The big teal Amount box at the bottom reflects `amountDue`
    (already advance-reduced when paid), not the raw item subtotal, matching legacy's own
    `inv.total` field. This template is one of the two the user separately declared "cant change
    at all" for its *existing* content — this addition is new content the legacy version already
    had and this rebuild had simply never carried over, not a stylistic change to what was there.
  Duplicating an invoice deliberately does **not** carry over advance fields — a duplicate starts
  fresh at "NONE", since an advance is specific to one billing event, not something that should
  silently propagate to a new draft.
  **Verified live, not just typechecked**: a throwaway local Playwright script created one
  invoice with `advanceStatus: REQUESTED` and one with `PAID` (both $1,000 subtotal, $300
  advance), fetched each real PDF, and rendered both to PNG via PyMuPDF to look at the actual
  output — confirmed the Requested variant shows the amber row with Amount unchanged at
  $1,000.00, and the Paid variant shows the red "Less: Advance Paid − USD 300.00" row with Amount
  correctly reduced to $700.00. Caught and fixed one real layout bug this way: the advance value
  column was initially too narrow (matching the item-row proportions exactly), so "− USD 300.00"
  wrapped to two lines — widened that one column (78%/22% instead of 84%/16%) rather than leaving
  a visual defect uncaught by typecheck. Test invoices and the verification script were deleted
  after confirming correctness, not left as clutter.
- **Agent License no / Contact no — done.** The user asked for the Blacklist portal's bottom-right
  attribution block to show Agent name, License no, and Contact no. Neither field existed anywhere
  in the schema or the legacy data (`data/agents.json` has no license/phone field for any agent) —
  these are genuinely new, not a rebuild of something legacy had. Added `Agent.licenseNo` /
  `Agent.contactNo` (both nullable `String`, migration applied live against Supabase), wired into
  the create/edit agent form (`agent-manager.tsx`) and the agents table (`/admin/agents`), and
  threaded through `listBlacklist()` (`lib/actions/blacklist.ts`) into a new `AgentAttribution`
  block in `blacklist-table.tsx`, right-aligned under each dispute listing's date, below "Handled
  by" (replacing the old inline text version). Blank on any placement whose agent record predates
  these fields — expected, not a bug.
  **Verified live**: set test values on two real agents, screenshotted the Blacklist portal and
  confirmed both the populated case (name, License no, Contact no all showing) and the blank case
  (dashes, not blank space) render correctly, plus the agents list/edit dialog. One dev-only false
  alarm caught and correctly diagnosed rather than "fixed" blind: the blacklist page appeared stuck
  on loading skeletons for several seconds on every check — turned out to be genuine
  dev-to-Singapore-Supabase round-trip latency (server logs showed the same request completing in
  4-10s), not a bug, once the verification script waited for the skeleton to actually detach
  instead of a fixed timeout. Test license/contact values and the throwaway screenshot scripts
  were removed after confirming correctness.

## Tech stack (exact)

- Next.js 15, App Router, TypeScript strict mode
- Tailwind CSS v4 + shadcn/ui (Radix primitives)
- PostgreSQL via Supabase + Prisma ORM v5 (originally speced as Neon; moved to Supabase per the
  user's direction — see the GitHub + Supabase entry above for the connection-string details that
  actually matter, notably: use the session-mode pooler for `DATABASE_URL`, not transaction-mode)
- Lucia v3 auth — per-login sessions stored in DB, httpOnly cookies, 48h expiry with sliding
  refresh
- File storage: Supabase Storage (private bucket, signed URLs via `src/lib/storage/
  supabase-adapter.ts`) — originally speced as Cloudflare R2; same private-bucket-plus-signed-URL
  model either way, so the spec's security requirement is unchanged even though the vendor is not
- Upstash Redis — sliding-window rate limiting on login, session blacklist on sign-out (still the
  in-memory local stand-in — not yet provisioned)
- React Hook Form + Zod (same schema client- and server-side)
- TanStack Query v5 for client data fetching
- @react-pdf/renderer, server-side, for candidate profiles and invoices
- Resend + React Email for notifications (still the local `.log` stand-in — not yet provisioned)
- Deploy: Vercel + Supabase — live at https://topway-mu.vercel.app

## Non-negotiable security rules

1. `requireSession(role?)` runs at the top of every Route Handler and Server Action. Zero public
   endpoints except `/api/auth/login`. Never reimplemented inline.
2. Sessions are DB rows (`sessions` table). Sign-out deletes the row **and** blacklists the token
   in Upstash. No static tokens, no `sha256(password)`-as-token. Admin can revoke any user's
   sessions.
3. R2 bucket is private. All downloads go through `/api/files/[fileId]`: validate session → check
   permission to that candidate's record → return a 15-minute signed URL. R2 keys are opaque
   UUIDs, never the original filename.
4. Invoicing portal checks `permissions.invoices === true` server-side on every action, not just
   route-gated.
5. Login: 10 attempts/IP/15min via Upstash; 5 consecutive fails locks the account 15min + email
   alert. Generic 401 always — never reveal whether a username exists.
6. CORS restricted to the app's own origin. Session tokens live in httpOnly cookies only, never
   query strings or JSON bodies.
7. Uploads: validate magic bytes (first 12 bytes) against expected MIME before writing to R2.
   Extension is never trusted alone. Max 10MB.
8. Every write to `candidates`, `tracking`, `placements`, `disputes`, `invoices` writes an
   `audit_log` row via Prisma middleware: table, record ID, actor, action, diff
   `{ field: { before, after } }`, timestamp.
9. Security headers in `next.config.ts`: strict CSP, `X-Frame-Options: DENY`, HSTS,
   `Referrer-Policy: strict-origin`, Permissions-Policy.
10. Permission checks are on the action server-side, never just the route.

Full schema (all Prisma models/enums), the roles/permissions matrix, the five portals
(Profile Builder, Admin Console, Agent Portal, Topway Staff Tracking View, Invoicing Portal),
derived business logic (departure date → probation/mid/end dates, probation status, remarketing
eligibility, contract-closure notification), and UI/UX requirements were specified in full by the
user and should be treated as fixed requirements — ask before deviating from any of them. Ask
before creating new top-level docs; this file should stay the single source of truth and get
updated as the rebuild progresses, not left stale.

## Build order

Each phase must be fully working before the next starts.

0. **Patch the legacy PHP app** (done — see Current status).
1. **Foundation** (done — see Current status) — Next.js 15 scaffold, Prisma schema, Neon, Lucia
   auth, login/logout for all three roles, migrate the existing 21 profiles + 5 agents + invoices
   from `data/*.json` into the new schema via a one-off script.
2. **Staff + Invoicing** (done — see Current status) — staff management panel with permission
   flags; invoicing portal (auth-gated, full CRUD, status workflow, server-side PDF, audit log).
3. **Admin Console** (done — see Current status) — profile builder multi-step form, candidate ATS
   table + detail panel, pipeline stepper, application status actions, dispute logging, file
   upload + signed-URL download (R2 stand-in — see Current status), per-candidate audit log view.
4. **Agent Portal** (done — see Current status) — agent login, My Applications + Databank tabs,
   read-only pipeline, probation/milestone display, contract-closure notification, mobile
   responsive at 375px.
5. **Topway Tracking View** (done — see Current status) — post-departure tabs, change of
   employer/house, remarketing eligibility, dual-agent visibility, notification system.
6. **Hardening** (done — see Current status) — Upstash rate limiting, session revocation UI,
   security headers, magic-byte validation, e2e tests on critical paths.

## What's needed from the user before Phase 1 can go live

Provisioning these is the user's call, not something to assume or spend money on unasked:
- ~~Neon Postgres connection string~~ — done, moved to Supabase instead (see the GitHub + Supabase
  status entry above)
- ~~Cloudflare R2 bucket + access keys~~ — done, moved to Supabase Storage instead, same entry
- Upstash Redis REST URL + token
- Resend API key
- Vercel project (for eventual deploy)

Until these exist, Phase 1 can still scaffold the app, schema, and local dev flow against a
local/dev Postgres — just flag clearly which parts are stubbed pending real credentials.

## File structure

```
api/            # Legacy PHP endpoints — Phase 0 patched, being replaced, not extended further
data/           # Legacy flat JSON (profiles.json, agents.json, invoices.json) — source for the
                # Phase 1 migration script, then retired
uploads/        # Legacy file storage — being replaced by Cloudflare R2 in Phase 3
admin.html, agent.html, invoice.html, index.html  # Legacy frontend — replaced by the Next.js app
```

The new Next.js app's own structure (`app/`, `prisma/`, etc.) gets created in Phase 1.
