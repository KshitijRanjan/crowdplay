# CrowdPlay — Claude Context

> For file locations, consult [index.md](index.md) before exploring the codebase.

## What This App Does

Makes sharing music playlists easier: host plays music through the app, guests suggest songs from their own devices, multiple guests upvote suggestions to shape what plays next. Synced live via Firestore.

**Pivoting** (as of 2026-07-30) from a single 2-day wedding-event tool to a full-fledged app for regular, recurring use by any group — not tied to one event date. See `context.docx` for full product context and `PROGRESS.md` for what this pivot still needs.

**Live app:** https://crowdplay-host.vercel.app/
**GitHub:** https://github.com/KshitijRanjan/crowdplay

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Styling | Tailwind CSS 4 (glassmorphism dark theme) |
| Icons | Lucide React |
| Routing | React Router DOM 7 |
| Database | Firebase Firestore (real-time) |
| Auth | Firebase Auth — Google Sign-In for hosts, Anonymous for guests |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` (host queue reordering) |
| Media | YouTube Data API v3 + YouTube IFrame API |
| Deployment | Vercel (SPA rewrites via vercel.json) |

No backend service — Firebase is the only server-side dependency (free tier, no Cloud Functions).

---

## Firestore Data Model

```
rooms/{roomCode}
  hostUid, hostEmail, guestPin, name        # name = host-given room name
  createdAt, lastActivityAt                  # lastActivityAt drives rolling 12h archive
  endedByHost: boolean                       # host "End Party" hard-stop, independent of the timer

rooms/{roomCode}/queue/{docId}
  videoId, title, thumbnailUrl, channelTitle
  addedBy                                    # uid, or 'host' / 'host-seed'
  addedByName                                # guest's display name at add-time (omitted for host/seed — UI falls back)
  addedAt, status: 'pending' | 'playing' | 'played'
  upvotes: string[]                          # array of guest uids
  order: number                              # only meaningful when manuallyPositioned
  manuallyPositioned: boolean                # true once a host has dragged this song

rooms/{roomCode}/roles/{uid}
  role: 'host' | 'guest'
  name: string                               # guest display name, optional, defaults to 'Guest' — write-once

hostRequests/{email}                         # pending host-access requests
approvedHosts/{email}                        # emails approved to host
```

**Client-side queue sort** (`sortPendingQueue`, shared by GuestView/HostView/QueueSidebar):
anchored songs (`manuallyPositioned: true`) sort by `order`; unanchored songs sort by
upvote count then add-time, and are placed into whichever segment their add-time falls
into relative to the anchors — so a manual drag pins a song in place, and later upvotes
on other songs can never cross past it, only reorder within their own segment.

## Auth Flow

**Host:** `RequestAccessForm`/`HostLoginForm` call `signInWithPopup(auth, googleProvider)` —
Firebase Auth's Google provider, real per-account identity, stable UID across devices.
`approvedHosts/{email}` (keyed by the Google-verified email) gates actual host access;
having a Google account alone only proves identity, not approval. No password anywhere.

**Guest:** unchanged — `signInAnonymously(auth)` runs **before any Firestore read**
(rules require `isAuthenticated()`), gated by room code + 4-digit PIN
(`VITE_HOST_PIN`/`VITE_GUEST_PIN` env vars are gone; PINs are per-room, host-chosen,
stored on the room doc as `guestPin`).

Session (host or guest) is cached in `sessionStorage` (`pinVerified`, `userRole`,
`roomCode`, `hostEmail`/`guestName`) so a refresh restores the right view without
re-authenticating, as long as the room is still live (`isRoomLive()`).

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
