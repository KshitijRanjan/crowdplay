# QR Code Join — Design Spec

**Date:** 2026-07-07
**Status:** Approved (pending final review)

## Problem

Hosts currently share the room via a plain text room code + PIN, read aloud or copy-pasted. The host wants to hand guests a QR code they can scan to join, so guests don't have to type a 6-character room code by hand. The 4-digit guest PIN stays a manual, out-of-band step (told verbally or via chat) — the QR only carries the room code, not the PIN.

## Existing Infrastructure (reused, not built)

The app already supports deep-link joining:

- `App.jsx:1961` — on load, matches `window.location.pathname` against `/^\/join\/([A-Z0-9]+)$/i` and extracts the room code.
- `App.jsx:1971` — stores it as `prefilledCode`, passed down to pre-fill the `JoinPartyForm`'s room code input (`App.jsx:542`).
- `vercel.json` — catch-all rewrite (`/(.*)  → /index.html`) means `/join/VH3Z4Y` resolves correctly in production (no 404 on direct load).

This means a URL of the form `https://party-playlist-seven.vercel.app/join/VH3Z4Y` already does everything needed: it loads the app and pre-fills the room code field on the join form. **No routing or state-machine changes are required.**

## Scope

**In scope:**
- Render a QR code encoding the join URL, displayed in `HostView` next to the existing Room Code / Guest PIN display.
- QR encodes `${window.location.origin}/join/${roomCode}` — room code only, no PIN.

**Out of scope (explicitly excluded per user decisions):**
- No WhatsApp share button / `wa.me` integration. Host shares the QR (e.g. via screenshot) however they choose.
- No auto-focus or pre-fill of the PIN field — guest always types the PIN manually after landing on the join form.
- No changes to Firestore rules, room creation flow, or PIN validation logic.

## Approach

Use `qrcode.react` (`QRCodeSVG` component) to render the QR client-side as an inline SVG:
- No network call at render time (unlike a hosted QR-image API), so no third-party service sees the room link.
- Small (~3KB), actively maintained, standard choice for React QR rendering.

## UI Placement

Extend the existing "Room info row" card in `HostView` (`src/App.jsx:1761-1787`), which currently shows Room Code and Guest PIN side by side with copy buttons. Add the QR code inside the same card (e.g. to the right, or below on narrow viewports) rather than a separate modal — keeps the host's "how do I get guests in" information in one place.

## Data Flow

```
HostView renders
  → roomCode already in component state (existing prop)
  → joinUrl = `${window.location.origin}/join/${roomCode}`
  → <QRCodeSVG value={joinUrl} />

Guest scans QR
  → phone camera opens joinUrl
  → App.jsx loads, matches /join/:code path (existing logic)
  → JoinPartyForm renders with roomCode pre-filled, PIN field empty
  → Guest types PIN, submits (existing flow, unchanged)
```

## Error Handling

None needed beyond what already exists — `roomCode` is always a valid non-empty string when `HostView` renders (it's only mounted once a room is created), so `QRCodeSVG`'s `value` prop is never empty/undefined. No new failure modes introduced.

## Testing

Manual verification (no existing test suite for UI in this project):
1. Start a party as host, confirm QR renders in the room info row.
2. Scan QR with a phone (or manually navigate to the encoded URL in another browser/incognito tab) and confirm the join form loads with room code pre-filled and PIN field empty.
3. Complete guest join with correct PIN, confirm guest reaches `GuestView` normally.
4. Confirm existing Room Code / Guest PIN text + copy buttons still work unchanged.

## Dependencies

- Add `qrcode.react` to `package.json` dependencies.
