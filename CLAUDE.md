# Party Playlist — Claude Context

## What This App Does

A real-time collaborative music queue for weddings/parties. Guests join with a PIN, search YouTube, and add songs to a shared queue. The host has a separate PIN to access full playback controls and queue management. Everything syncs live across devices via Firestore.

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

---

## Project Structure

```
Wedding_Planning/
├── src/
│   ├── App.jsx              # Main monolithic component (~1420 lines)
│   ├── ErrorBoundary.jsx    # React error boundary
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles + Tailwind directives
├── public/
├── index.html
├── firestore.rules          # Firestore security rules (deploy separately)
├── firebase.json            # Firebase project config
├── vercel.json              # SPA rewrite rules for Vercel
├── .env                     # Local secrets (never commit)
├── .env.example             # Template for required env vars
├── tailwind.config.js
├── vite.config.js
└── package.json
```

---

## Key Components (all in App.jsx)

- **`PinGate`** — PIN entry UI, validates against env vars, writes role to Firestore
- **`GuestView`** — YouTube search, add to queue, upvote, view now-playing
- **`HostView`** — YouTube IFrame player with custom controls, queue management, playlist seeding
- **`QueueSidebar`** — Right panel showing upcoming songs and played history
- **`Toast`** — Notification system (success/error/info)

---

## Firestore Data Model

### `roles/{uid}`
```js
{ role: "host" | "guest" }
```
Written once on sign-in. Users cannot update or delete their own role document (prevents escalation).

### `queue/{docId}`
```js
{
  videoId: string,
  title: string,
  thumbnailUrl: string,
  channelTitle: string,
  addedBy: string,       // uid or "host-seed"
  addedAt: Timestamp,
  status: "pending" | "playing" | "played",
  upvotes: string[],     // array of uids
  isPriority: boolean    // host-set flag
}
```

**Client-side sort order:** isPriority → upvote count → addedAt (FIFO)

---

## Authentication Flow

1. User enters 4-digit PIN
2. Validated client-side against `VITE_HOST_PIN` or `VITE_GUEST_PIN`
3. Firebase Anonymous Auth signs in the user
4. Role written to `roles/{uid}` in Firestore
5. PIN verification stored in sessionStorage for page refresh

---

## Environment Variables

All secrets live in `.env` (local) and Vercel environment settings (production). See `.env.example` for the full list. Key ones:

```
VITE_YOUTUBE_API_KEY       # YouTube Data API v3 key
VITE_HOST_PIN              # 4-digit host PIN
VITE_GUEST_PIN             # 4-digit guest PIN
```

Firebase config (apiKey, projectId, etc.) is embedded in `src/App.jsx` directly — this is intentional and safe for Firebase web apps since Firestore rules are the real security layer.

---

## Security Model

Security is enforced at **two layers**:

1. **Firestore Security Rules** (`firestore.rules`) — the primary layer. Rules check the user's role document before allowing writes. Even if someone bypasses the frontend, Firestore blocks unauthorized operations.
2. **Client-side PIN gate** — secondary. Guards the UI but is not the trust boundary.

Key rules enforced:
- Only hosts can delete queue items
- Only hosts can update queue fields other than `upvotes`
- Guests can only toggle their own uid in/out of `upvotes`
- Role documents are write-once (no privilege escalation)
- All unauthenticated access is denied

**YouTube API key** is restricted in Google Cloud Console to only work from `party-playlist-seven.vercel.app`.

---

## Development Workflow

### Branching Convention
- `main` — production, auto-deployed to Vercel
- `feature/<name>` — all new work goes here, PR into main

### Common Commands
```bash
npm run dev        # local dev server (localhost:5173)
npm run build      # production build to dist/
npm run lint       # ESLint check
```

### Deploying Firestore Rules
After changing `firestore.rules`, deploy separately:
```bash
firebase use wedding-management-de9b1
firebase deploy --only firestore:rules
```
This is separate from Vercel deploys which only push the frontend.

---

## Known Constraints & Decisions

- **Free tier only** — no Firebase Functions (requires paid plan), no paid infrastructure. Vercel free tier is acceptable for serverless if needed in future.
- **Monolithic App.jsx** — all components are in one file by design for this project's scope. Do not split unless explicitly asked.
- **Client-side rate limiting** — song add rate limit (5/min) uses localStorage. Not tamper-proof but sufficient for a party app.
- **No server-side PIN validation** — accepted trade-off for free hosting. Firestore rules limit the blast radius if bypassed.
- **YouTube IFrame API** loaded via script tag in `index.html`, not as an npm package.
