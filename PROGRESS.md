# Progress — Party Playlist

Draft, based on git history, `docs/superpowers/` design docs, and code inspection. No TODO/FIXME comments found anywhere in `src/` — this codebase has none, so most status below is **inferred from git log + working code**, not from explicit markers. Correct freely.

## ✅ Done (evidence: merged commits, design docs, working code paths)

- **Core party flow** — host creates room (`CreateRoomForm`), guest joins via PIN + room code (`GuestJoinForm`). *Evidence: code present, exercised in production (live URL).*
- **Real-time queue sync** — Firestore `onSnapshot` listeners in `GuestView`/`HostView`. *Evidence: code present.*
- **YouTube search + add to queue**, duration limit (8 min), rate limit (5/min via localStorage). *Evidence: code + README feature list match.*
- **Upvoting** — guests toggle own uid in `upvotes[]`, sort respects it. *Evidence: code + firestore.rules `onlyUpvoting()` rule.*
- **Host playback controls** — play/pause/skip/prev/seek, priority "Play Next", clear queue, playlist seeding. *Evidence: `HostView` code, README.*
- **Host access request flow** — `RequestAccessForm` → `hostRequests` → `AdminFlow` approves → `approvedHosts`. *Evidence: full code path present.*
- **QR code join** — `docs/superpowers/plans/2026-07-07-qr-join.md` + `specs/2026-07-07-qr-join-design.md`, `qrcode.react` dependency present. *Evidence: sdd progress.md marks "Task 1: complete, review clean, manual browser QA passed".*
- **Collapsible QR/PIN host panel** — `docs/superpowers/plans/2026-07-07-collapsible-qr-panel.md`. *Evidence: sdd progress.md marks "manual browser QA passed (expand/collapse, mobile wrap, empty state confirmed)".*
- **Hide room code from host view** (commit `b79fe08`, merged PR #9/#10 per `git log`). *Evidence: merged to main.*
- **Guest-join auth-before-read fix** (commit `0f1c7ee`, merged to main 2026-07-30). Guests were hitting Firestore `permission-denied` because `getDoc(roomRef)` ran before `signInAnonymously(auth)`. *Evidence: fix verified against firestore.rules, merged and pushed this session.*
- **PWA setup** — manifest, icons, service worker present in `dist/` and `public/`, `vite-plugin-pwa` dependency. *Evidence: build output present.*
- **Firestore security rules** — role-based, write-once roles, unauthenticated access denied. *Evidence: `firestore.rules` read in full.*

## 🚧 In Progress / Partial (inferred — no explicit stub markers found)

- **Frontend aesthetic/UI-UX pass** — original session goal, not yet started; deferred while the auth/lifecycle redesign below took priority. *Inferred from current task, not from code.*

## ✅ Done — Host Auth & Room Lifecycle Redesign (2026-07-30, `frontend-enhancements` branch)

- **Google Sign-In replaces anonymous host auth** — closed a real identity-spoofing hole (any guest could previously enumerate `approvedHosts` and log in as any host with just their email). Guests remain anonymous, unchanged. *Evidence: spec `docs/superpowers/specs/2026-07-30-host-auth-lifecycle-redesign-design.md`, plan `docs/superpowers/plans/2026-07-30-host-auth-lifecycle-redesign.md`, 9 tasks implemented + reviewed via subagent-driven-development, ledger in `.superpowers/sdd/progress.md`.*
- **Firestore rules tightened** — room creation now requires `approvedHosts` membership (previously any authenticated client, including guests, could create rooms directly via the SDK). Deployed live to production Firestore this session. *Evidence: `firestore.rules`, deployed via `firebase deploy --only firestore:rules`.*
- **Room lifecycle replaced**: fixed 12h expiry → rolling-inactivity-or-manual-end (`isRoomLive`, `lastActivityAt`, `endedByHost`), computed client-side (no Cloud Functions). Host dashboard shows room history, rooms can be reopened with queue intact, mid-party room switching. Guest display names + song attribution. Web Share API share button.
- **Final whole-branch review caught 3 real cross-task integration bugs** no single task's review could see: a race letting two rooms be simultaneously "live" per host, stale player/queue state surviving a room switch, a dead "Start New Party" button inside the in-party history overlay. All fixed and re-verified. *Evidence: `.superpowers/sdd/progress.md`.*

## 📋 Not Started / Known Gaps

- **No automated tests** — no `tests/`, `*.test.js`, or test runner config in `package.json`. *Evidence: absence confirmed via file listing + package.json scripts.*
- **No CI/CD config found** (no `.github/workflows/`). Deploys are manual `git push` (Vercel) + manual `firebase deploy --only firestore:rules`. *Evidence: absence confirmed.*
- **No Cloud Functions / server-side PIN validation** — explicitly a known accepted trade-off per CLAUDE.md, not a gap. *Confirmed intentional, not missing.*
- **`approvedHosts`/`hostRequests` are writable by any authenticated user in Firestore rules** — pre-existing, outside this session's spec scope. Host *identity* is now real (Google-verified) but host *authorization* isn't: any signed-in Google account could currently write itself into `approvedHosts` directly, bypassing admin approval. Explicitly deferred as a follow-up per user decision 2026-07-30 — needs an admin custom-claim or equivalent before it's closed. **Not yet scheduled.**
- **Legacy production rooms (pre-migration schema) are abandoned, deliberately.** Rooms created before this branch's deploy use the old `status`/`expiresAt` schema and anonymous-uid host identity; after deploy they become unreachable (won't match the new `endedByHost`/`lastActivityAt` queries, and their host uid won't match a Google-signed-in host's uid). User decision 2026-07-30: acceptable, no backfill needed.
- **PIN brute-force throttling** — no server-side rate limit on guest PIN attempts, unchanged by this session's work. Known gap, not addressed.

---

**Confidence note:** "Done" items are backed by either a merged commit in `git log`, a completed `sdd/progress.md` entry, or directly-read working code. Everything under "In Progress" and "Not Started" is inference from absence of evidence, not explicit markers — flag anything wrong here.
