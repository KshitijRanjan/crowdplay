# Repo Index

Lookup table — check here before exploring. This is a single-page React SPA + Firebase; there is no separate backend service (no server folder, no API routes, no Cloud Functions — free tier only).

Pivoting from a single 2-day wedding-event tool to a regular-use, recurring app for sharing playlists (host plays, guests suggest + upvote). See `context.docx` and `CLAUDE.md`.

| Path | Purpose | Check first | Don't touch without asking |
|------|---------|--------------|------------------------------|
| `src/App.jsx` | Entire app: routing, all components, Firestore calls, YouTube API | Function list via `grep "^function " src/App.jsx` | Don't split into files — monolithic by design |
| `src/main.jsx` | Entry point, mounts `<App/>` in `BrowserRouter` | — | — |
| `src/ErrorBoundary.jsx` | React error boundary wrapper | — | — |
| `src/index.css` | Just `@import "tailwindcss"` | — | — |
| `src/App.css` | Small extra global CSS (42 lines) | — | — |
| `firestore.rules` | Real security boundary — role checks, room/queue/roles access | Full file, ~65+ lines | Never weaken `isAuthenticated()` checks |
| `firebase.json` | Firebase CLI project config | — | — |
| `vercel.json` | SPA rewrite rules for Vercel routing | — | — |
| `vite.config.js` | Vite + PWA plugin config | — | — |
| `tailwind.config.js` | Tailwind 4 config | — | — |
| `.env` / `.env.example` | Secrets: Firebase config, YouTube API key, host/guest PINs | `.env.example` for required keys | Never commit `.env` |
| `context.docx` | Central product context: purpose, architecture, pivot status | Read before assuming project scope | Keep in sync when architecture/purpose changes |
| `public/` | Static PWA assets (icons, manifest source) | — | — |
| `dist/` | Build output | — | Generated — never hand-edit |
| `docs/superpowers/plans/`, `docs/superpowers/specs/` | Past feature design docs (QR join, collapsible panel) | filenames are dated | — |
| `.superpowers/sdd/progress.md` | Past task completion log (superpowers workflow) | — | — |

## App.jsx component map (all in one file)

Line numbers drift as the file changes — re-run `grep -n "^function " src/App.jsx` rather than trusting these blindly, but they were accurate as of this row's last edit.

| Component | Line | Role |
|-----------|------|------|
| `Toast` | 190 | Notification UI |
| `LandingPage` | 209 | Entry screen — host/join/request-access/admin |
| `RequestAccessForm` | 262 | Host requests access via "Continue with Google" |
| `RequestSentScreen` | 364 | Confirmation after request |
| `HostLoginForm` | 389 | Host login via "Continue with Google" (no password, ever) |
| `CreateRoomForm` | 487 | Host creates a room — name + 4-digit guest PIN |
| `GuestJoinForm` | 590 | Guest joins via room code + PIN + optional name |
| `AdminFlow` | 737 | Admin panel: approve/deny host requests |
| `QueueSidebar` | 970 | Guest-only slide-out: upcoming + played songs, upvote |
| `GuestView` | 1057 | Guest-facing queue + search UI |
| `SortableUpNextRow` | 1324 | Single draggable row used by HostView's Up Next tab (`@dnd-kit`) |
| `HostView` | 1372 | Host screen: search, Up Next/Played tabs, drag-to-reorder, bottom player bar |
| `HostDashboard` | 2188 | Post-login screen: start new party + room history/reopen |
| `App` | 2276 | Top-level router/state |

Key utility functions (all above the component definitions): `sortPendingQueue` — the anchor/segment merge sort shared by every queue display; `isRoomLive` — computed room-archive check; `bumpRoomActivity` — writes `lastActivityAt`.

## Firestore collections

| Collection | Purpose |
|------------|---------|
| `rooms/{roomCode}` | One doc per party; `queue/` and `roles/` subcollections. See CLAUDE.md for full field list. |
| `hostRequests/{email}` | Pending requests for host access |
| `approvedHosts/{email}` | Emails approved to host — gates both login and (via Firestore rules) room creation |
| `roles/{uid}` (legacy top-level, `firestore.rules:71`) | Backwards-compat only — current code writes to `rooms/{roomCode}/roles/{uid}`, not here |
