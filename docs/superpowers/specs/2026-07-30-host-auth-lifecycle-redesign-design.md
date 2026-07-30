# Host Auth & Room Lifecycle Redesign — Design Spec

**Date:** 2026-07-30
**Status:** Approved by user, ready for implementation planning

## Context

Party Playlist is pivoting from a single 2-day wedding-event tool to a full-fledged app used regularly by a group of trusted hosts (see `context.docx`). This surfaced three gaps that need to be closed together, because they share the same underlying dependency (a stable host identity):

1. **Host identity has no real authentication.** `HostLoginForm` grants host access to any authenticated user who supplies an email that exists in `approvedHosts`. Worse, `firestore.rules` sets `approvedHosts` to `allow read: if isAuthenticated()`, which covers Firestore `list` queries too — any anonymous guest can enumerate every approved host's email and log in as them. There is no password, magic link, or ownership proof anywhere in this path.
2. **Room lifecycle is hardcoded to a single 12-hour event.** Rooms hard-expire 12h after creation, one room per host max, no history, no way to resume or re-run a room. This actively worked against the regular-use pivot.
3. **Sharing a room today means reading a PIN aloud or scanning a QR code in person.** No shareable link flow for remote guests.

This spec covers all three because history/reopen (gap 2) depends on a stable per-host UID across devices, which only a real auth provider gives you — anonymous auth issues a new UID per browser/device, so a host logging in from a second phone would silently lose their "current room" lookup.

## Goals

- Replace anonymous host identity with real Firebase Auth via **Google Sign-In** — no passwords to create, store, forget, or reset.
- No migration step needed for existing `approvedHosts` entries — a Google account is created/linked automatically on first sign-in for any email already on the approved list.
- Close the Firestore rule gap that lets any authenticated (including anonymous/guest) client create a room directly via the SDK, bypassing host approval.
- Replace fixed 12h room expiry with a rolling-inactivity-or-manual-end model, computed client-side (no Cloud Functions — free tier constraint).
- Give hosts a history of every room they've created, and let them reopen an archived room with its queue intact.
- Add a Web-Share-API based share button for the room join link (PIN still entered manually by the guest).

## Non-goals

- Concurrent live rooms per host (still capped at one live room at a time — creating a new one ends whichever was previously live).
- Guest identity/authentication changes — guests remain anonymous, PIN-gated, unchanged.
- Cloud Functions or any paid infrastructure — everything here runs client-side against Firestore, same as today.

## 1. Host Authentication

**Firebase Console (manual, one-time):** enable the **Google** sign-in provider under Authentication. This cannot be done from code — see "What you need to do" below.

**`RequestAccessForm`** — replaces the name/email form with a single "Continue with Google" button.
1. `signInWithPopup(auth, new GoogleAuthProvider())` — Firebase creates the account automatically on first use; email comes from the verified Google profile, no typing/typos possible.
2. Write `hostRequests/{email}` with `status: 'pending'`, using the Google profile's email + `displayName` in place of the old name field; send the existing admin-notification email via EmailJS exactly as today.
3. No sign-out needed afterward — being authenticated has never conveyed host privileges on its own (anonymous guests are "authenticated" too); only `approvedHosts` membership does.

**`HostLoginForm`** — replaces the email input with the same "Continue with Google" button.
1. `signInWithPopup(auth, new GoogleAuthProvider())`.
2. Check `approvedHosts/{email}` exactly as today, using the Google-verified email.
3. Not yet approved → same pending/denied messaging that exists today, keyed off `hostRequests/{email}.status`.

**Known edge case:** if a host originally requested access with one email but signs in with a Google account under a different email, the `approvedHosts` lookup won't match. This is a one-time, self-evident failure ("email not found, request access first") — no special handling needed since it surfaces through the existing not-approved messaging.

**Firestore rules:**
```
match /rooms/{roomCode} {
  allow create: if isAuthenticated()
                && exists(/databases/$(database)/documents/approvedHosts/$(request.auth.token.email));
  allow read: if isAuthenticated();
  allow update: if isAuthenticated() && resource.data.hostUid == request.auth.uid;
  allow delete: if false;
  ...
}
```
This closes the gap where any authenticated (including anonymous/guest) client could create a room directly via the SDK.

## 2. Room Lifecycle & Archiving

No Cloud Functions exist on this stack (free tier), so there is no scheduled job to flip a room's status. Archiving is **computed on read**, never a stored transition.

**Room doc field changes:**
- Add `name` (string, required at creation — host-given room name).
- Add `lastActivityAt` (Timestamp) — replaces `expiresAt`.
- Add `endedByHost` (boolean, default `false`) — replaces the `status: 'active' | 'expired'` field.

```js
function isRoomLive(roomData) {
  if (roomData.endedByHost) return false;
  const last = roomData.lastActivityAt?.toMillis?.() ?? 0;
  return (Date.now() - last) < 12 * 60 * 60 * 1000;
}
```

- `lastActivityAt` is bumped (via `updateDoc` on the room doc) alongside: song added, upvote toggled, and any host playback action (play/pause/skip/priority/delete/restore).
- Host manually ending a party sets `endedByHost: true` — a hard stop independent of the timer, matching "12h of inactivity or host ends it, whichever is first."
- A room is "archived" purely as the negation of `isRoomLive()` — no write is needed for a room to become archived; it just falls out of the live window.

**Reopening an archived room:**
```js
updateDoc(roomRef, { lastActivityAt: serverTimestamp(), endedByHost: false });
```
That's the entire action. The room becomes live again because the computed check now passes. Same room code, PIN, queue, and play history — nothing is reset. Guests rejoin with whatever code/PIN/link they already have, or the host re-shares it.

**One live room per host is preserved.** Creating a new room still ends whichever room was previously live for that host, same as the existing "expire prior active rooms" step, just using `endedByHost: true` instead of a status field. History retains every past room regardless of live/archived state.

## 3. Host Dashboard & History

**Login routing:** after successful host login, check for a live room (`isRoomLive`) belonging to this host.
- **Live room found** → auto-enter `HostView` for it, unchanged from today's behavior.
- **No live room** → new `HostDashboard` screen: "Start New Party" as the primary action, with a History list directly on the same screen below it — each entry shows name, created date, room code, and a live/archived badge, sorted newest first. Tapping an archived entry reopens it (per section 2) and enters `HostView`.

**While hosting** (`HostView` header): a History icon next to "End Party" opens the same history list without ending the current party. Selecting a different room from there shows a confirm dialog — *"Reopening this party will end your current one. Continue?"* — since only one room can be live per host at a time.

**`CreateRoomForm`** gains a required "Room Name" text field alongside the existing 4-digit PIN field.

## 4. Sharing via Web Share API

Added next to (not replacing) the existing QR code in `HostView`'s room-info panel.

```js
const shareUrl = `${window.location.origin}/join/${roomCode}`;
if (navigator.share) {
  await navigator.share({ title: `Join "${roomName}" on Party Playlist`, url: shareUrl });
} else {
  await copyToClipboard(shareUrl);
}
```

- Opens the OS-native share sheet; WhatsApp is one destination among whatever's installed. No hardcoded WhatsApp-only link.
- The link carries only the room code via the existing `/join/:code` route (already wired to prefill `GuestJoinForm`'s room-code field) — the PIN is never included. Guest opens the link, sees the code pre-filled, and still types the PIN.
- Browsers without `navigator.share` (some desktop browsers) fall back to the existing copy-to-clipboard pattern already used for the PIN, with the existing toast confirmation.

## Data model (final)

```
rooms/{roomCode}
  hostUid, hostEmail, guestPin, name        # name is new, required
  createdAt, lastActivityAt                  # expiresAt removed
  endedByHost: boolean                       # replaces status: 'active' | 'expired'
  rooms/{roomCode}/queue/{docId}             # unchanged
  rooms/{roomCode}/roles/{uid}                # unchanged
```

`hostRequests/{email}` and `approvedHosts/{email}` docs are unchanged in shape — no password field, nothing new to store; identity lives entirely in Firebase Auth via Google.

## Error handling

- Firebase Auth popup errors (`auth/popup-closed-by-user`, `auth/popup-blocked`, `auth/network-request-failed`, `auth/cancelled-popup-request`) map to existing `Toast`/inline-error patterns already used throughout the app — no new error-handling paradigm introduced. Closing the Google popup should just silently reset the form, not show a scary error.
- Reopening a room the host no longer owns (shouldn't be reachable via UI, but rules-enforced): `update` rule already requires `resource.data.hostUid == request.auth.uid`, so a stale/forged reopen attempt fails at the rules layer, not just the UI layer.
- Email mismatch between request and login (per section 1's known edge case) surfaces through the existing "email not found, request access first" messaging — no new error path required.

## Out of scope / explicitly deferred

- Per-room or per-guest rate-limit scoping (currently global per-browser via `localStorage`) — unchanged by this spec.
- `HostView`'s missing `onSnapshot` error handler and `GuestView`'s stale-session-after-expiry UX gap — real bugs, noted during the walkthrough, but independent of this spec's scope. Worth a follow-up.
- PIN brute-force throttling — unchanged; noted as a known gap, not addressed here since it's orthogonal to host identity.

## What the user needs to do (manual, cannot be done from code)

1. **Firebase Console → Authentication → Sign-in method** → enable the **Google** provider on the `wedding-management-de9b1` project (the screen already shown, via "Add new provider" or the "Enable" shortcut on the recommendation banner).
2. **Firebase Console → Authentication → Settings → Authorized domains** → confirm `party-playlist-seven.vercel.app` is listed. Firebase auto-authorizes its own `*.firebaseapp.com`/`*.web.app` domains, but a custom Vercel domain needs to be added manually or the Google sign-in popup will fail on the live site.
3. Review this spec and confirm before implementation planning begins.
