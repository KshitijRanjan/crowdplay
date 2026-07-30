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

| Component | Line | Role |
|-----------|------|------|
| `Toast` | 132 | Notification UI |
| `LandingPage` | 151 | Entry screen — host/join/request-access/admin |
| `RequestAccessForm` | 204 | Non-host requests host access via email |
| `RequestSentScreen` | 321 | Confirmation after request |
| `HostLoginForm` | 346 | Host PIN + email login |
| `CreateRoomForm` | 452 | Host creates a room/party |
| `GuestJoinForm` | 544 | Guest joins via room code — **auth-before-read fixed here** |
| `AdminFlow` | 672 | Admin panel: approve/deny host requests |
| `QueueSidebar` | 905 | Upcoming/played song list |
| `GuestView` | 1025 | Guest-facing queue + search UI |
| `HostView` | 1282 | Host playback controls + queue management |
| `App` | 1976 | Top-level router/state |

## Firestore collections

| Collection | Purpose |
|------------|---------|
| `rooms/{roomCode}` | One doc per party; `queue/` and `roles/` subcollections |
| `hostRequests/{email}` | Pending requests for host access |
| `approvedHosts/{email}` | Emails approved to host |
| `roles/{uid}` (legacy top-level) | Backwards-compat role lookup |
