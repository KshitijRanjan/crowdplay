# Party Playlist — Claude Context

> For file locations, consult [index.md](index.md) before exploring the codebase.

## What This App Does

Makes sharing music playlists easier: host plays music through the app, guests suggest songs from their own devices, multiple guests upvote suggestions to shape what plays next. Synced live via Firestore.

**Pivoting** (as of 2026-07-30) from a single 2-day wedding-event tool to a full-fledged app for regular, recurring use by any group — not tied to one event date. See `context.docx` for full product context and `PROGRESS.md` for what this pivot still needs.

**Live app:** https://party-playlist-seven.vercel.app/
**GitHub:** https://github.com/KshitijRanjan/party-playlist

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Styling | Tailwind CSS 4 (glassmorphism dark theme) |
| Icons | Lucide React |
| Routing | React Router DOM 7 |
| Database | Firebase Firestore (real-time) |
| Auth | Firebase Anonymous Auth + PIN gating |
| Media | YouTube Data API v3 + YouTube IFrame API |
| Deployment | Vercel (SPA rewrites via vercel.json) |

No backend service — Firebase is the only server-side dependency (free tier, no Cloud Functions).

---

## Firestore Data Model

```
rooms/{roomCode}                          # one doc per party
rooms/{roomCode}/queue/{docId}            # { videoId, title, thumbnailUrl, channelTitle,
                                           #   addedBy, addedAt, status, upvotes[], isPriority }
rooms/{roomCode}/roles/{uid}              # { role: "host" | "guest" } — write-once
hostRequests/{email}                      # pending host-access requests
approvedHosts/{email}                     # emails approved to host
```
Client-side queue sort: `isPriority → upvote count → addedAt (FIFO)`.

## Auth Flow

1. User enters 4-digit PIN → validated client-side against `VITE_HOST_PIN`/`VITE_GUEST_PIN`
2. `signInAnonymously(auth)` runs **before any Firestore read** (rules require `isAuthenticated()` — see `firestore.rules:37`)
3. Role written once to `roles/{uid}`
4. PIN verification cached in sessionStorage for refresh

---

## Conventions Observed

- **Everything lives in `src/App.jsx`** (~2170 lines). Components are top-level `function Name(props) {}`, PascalCase. Do not split into files unless explicitly asked.
- **Error handling:** every async Firestore/YouTube call wrapped in `try { ... } catch (err) { ... }`, surfaced to the user via the `Toast` component — not `alert()`, not silent console-only failures.
- **State:** local `useState` per component, no global store (Redux/Zustand/Context) — Firestore's `onSnapshot` listeners are the source of truth for shared state.
- **New features:** add a new top-level component function in `App.jsx`, wire it into the router/state in the `App` component at the bottom of the file.
- **Styling:** Tailwind utility classes inline, dark glassmorphism theme. No CSS modules, no styled-components.
- **Tests:** none currently in this repo.

---

## Security Model (two layers)

1. **Firestore Security Rules** (`firestore.rules`) — the real trust boundary. Checks role before writes.
2. **Client-side PIN gate** — UI convenience only, not the security layer.

Rules enforce: only hosts delete/update queue fields (except `upvotes`), guests can only toggle their own uid in `upvotes`, role docs are write-once, all unauthenticated access denied.

**Never weaken `isAuthenticated()` checks in `firestore.rules` without explicit instruction** — this was the root cause of a guest-login outage (auth must happen before any `getDoc`/`getDocs` call, not after).

---

## Development Workflow

- `main` — production, auto-deployed to Vercel on push
- `feature/<name>` or `fix/<name>` — all work branches, PR into main
- After changing `firestore.rules`, deploy separately: `firebase use wedding-management-de9b1 && firebase deploy --only firestore:rules` (Vercel push does NOT deploy rules)

```bash
npm run dev        # localhost:5173
npm run build       # dist/
npm run lint
```

---

## Known Constraints — Never Do

- Don't split `App.jsx` into multiple files without being asked.
- Don't add Firebase Cloud Functions or paid infra (free-tier-only project).
- Don't move PIN validation server-side — accepted trade-off; Firestore rules are the real gate.
- Don't rely on client-side rate limiting (5 songs/min via localStorage) as a security control — it's not tamper-proof, just abuse-reduction.
- Don't load the YouTube IFrame API as an npm package — it's a script tag in `index.html` by design.
