# Drag-and-Drop Queue Reordering — Design Spec

**Date:** 2026-07-30
**Status:** Approved by user, ready for implementation planning

## Context

Hosts can currently only influence queue order indirectly: guests upvote songs, and a "Play Next" button forces a song to the top by backdating its `addedAt`. There's no way for a host to place a song at an arbitrary position — e.g. "this one third, that one after the current song, this one dead last." This spec adds drag-and-drop reordering for hosts, with a precise rule for how it coexists with guest upvoting (confirmed with the user via a worked example — see below).

**Retiring "Play Next":** per user decision, drag-and-drop fully replaces the existing "Play Next" (priority arrow) button on the host side. That button, its `isPriority` field, and the `addedAt`-backdating mechanism are removed entirely, not kept alongside the new feature.

**A related cleanup surfaces here:** `QueueSidebar`'s `isHost={true}` branch (which rendered the now-retired Play Next button plus a delete button) is dead code — the only remaining call site (`GuestView`) always passes `isHost={false}`, since `HostView` stopped using `QueueSidebar` entirely in the prior layout-restructure work this session. This spec removes that dead branch as part of retiring Play Next, simplifying `QueueSidebar` to a guest-only, upvote-only component.

## Goals

- Let hosts drag songs to any position in the Up Next list (host's inline list only — the one in `HostView`'s main content area, not `QueueSidebar`).
- Define exactly how manually-dragged position interacts with guest upvotes: dragged songs become fixed anchors; upvotes reorder only the songs between/around anchors, never past one.
- Keep the cost of upvoting exactly what it is today — one Firestore write per vote, no cascade of writes to other songs.
- Remove "Play Next" (the `isPriority` field, `handlePlayNext`, its UI) entirely from the host side.
- Simplify `QueueSidebar` to guest-only, removing its now-dead host branch.

## Non-goals

- Guests do not get drag-and-drop — they still only upvote.
- No reordering of played history — drag only applies to the pending Up Next list.
- No migration of existing `isPriority` field values on old queue docs — the field is simply never read or written by new code going forward (harmless orphaned field on old docs, consistent with how prior schema changes this session were handled).
- No changes to Firestore rules — the host already has unrestricted `update` rights on queue docs (`isRoomHost(roomCode)` in the existing rule), which covers writing the two new fields below.

## Data Model

Two new fields on `rooms/{roomCode}/queue/{docId}`:

```
order: number              // only meaningful when manuallyPositioned is true
manuallyPositioned: boolean // default false; true once a host has dragged this song
```

`isPriority` is removed from all future writes (no longer set on song add, no longer read by sort logic). Existing docs that still have it are left alone — it's just an inert field on old data.

## Sort Algorithm

A single shared function, `sortPendingQueue(songs)`, replaces the inline `.sort()` comparators currently duplicated in `GuestView`'s and `HostView`'s `onSnapshot` listeners. Used by every place that renders the pending queue: `GuestView`'s inline list, `HostView`'s inline list, and `QueueSidebar`'s (guest) list.

```js
function effectiveOrder(song) {
  if (song.manuallyPositioned) return song.order;
  return song.addedAt?.toMillis ? song.addedAt.toMillis() : (song.addedAt?.seconds * 1000 || 0);
}

function sortPendingQueue(songs) {
  const anchored = songs
    .filter((s) => s.manuallyPositioned)
    .sort((a, b) => effectiveOrder(a) - effectiveOrder(b));

  const unanchored = songs
    .filter((s) => !s.manuallyPositioned)
    .sort((a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0) || effectiveOrder(a) - effectiveOrder(b));

  const segments = Array.from({ length: anchored.length + 1 }, () => []);
  for (const song of unanchored) {
    let seg = 0;
    for (const a of anchored) {
      if (effectiveOrder(song) >= effectiveOrder(a)) seg++;
      else break;
    }
    segments[seg].push(song);
  }

  const result = [];
  for (let i = 0; i < anchored.length; i++) {
    result.push(...segments[i]);
    result.push(anchored[i]);
  }
  result.push(...segments[anchored.length]);
  return result;
}
```

**Worked example (matches what was confirmed with the user):**
- Songs A, B, C, D added in that order, no drags yet → sorted by add-time: A, B, C, D.
- Host drags D to position 1 → D gets `manuallyPositioned: true`, `order` set below A's effective order (see "Computing the drop `order`" below). Result: **D, A, B, C** — D is segment boundary 0, A/B/C fall in segment 1 (their add-time is after D's new `order`).
- Guest upvotes C → within segment 1, C now outranks A and B by vote count. Result: **D, C, A, B**. D never moves.
- Guest upvotes A → A and C duel by vote count within segment 1; D stays pinned regardless of vote counts elsewhere.

This is a pure client-side computation over data already being fetched — **no additional Firestore writes are triggered by upvoting**, matching the goal of keeping vote cost unchanged.

## Computing the drop `order`

On drop, given the dragged song's new neighbors in the *currently rendered* list (which is already the output of `sortPendingQueue`):

```js
function computeDropOrder(prevNeighbor, nextNeighbor) {
  const GAP = 60000; // 1 minute, in ms — arbitrary spacing unit, comfortably collision-free within a single party's timeframe
  const prevOrder = prevNeighbor ? effectiveOrder(prevNeighbor) : (nextNeighbor ? effectiveOrder(nextNeighbor) - GAP * 2 : Date.now());
  const nextOrder = nextNeighbor ? effectiveOrder(nextNeighbor) : prevOrder + GAP * 2;
  return (prevOrder + nextOrder) / 2;
}
```

Dropped at the very top: `prevNeighbor` is `null`, order goes below the current first song. Dropped at the very bottom: `nextNeighbor` is `null`, order goes above the current last song. Dropped in the middle: order is the midpoint of its new neighbors' effective order — this is what makes the segment-boundary math in `sortPendingQueue` work correctly for future unanchored insertions.

**Firestore write on drop:** one `updateDoc` on the dragged song's doc — `{ order: <computed>, manuallyPositioned: true }` — plus the existing `bumpRoomActivity(roomCode)` call, consistent with every other host action already bumping activity. No batch, no writes to any other document.

## Drag Interaction (Host Only)

**Library:** `@dnd-kit/core` + `@dnd-kit/sortable` (+ `@dnd-kit/utilities` for the transform helper). This is the current-generation standard for React drag-and-drop — actively maintained, touch-friendly out of the box (unlike `react-beautiful-dnd`, which is unmaintained and desktop-mouse-oriented). New dependency, added to `package.json`.

**Where:** only `HostView`'s inline "Up Next" tab (the list added in the earlier layout-restructure work this session). The "Played" tab is not draggable — it's history, not a queue to reorder.

**UI:** each row gets a small grip handle (`GripVertical` icon from `lucide-react`, already the icon set in use) on the left, before the rank number — not the whole row — so dragging doesn't conflict with tapping the delete button or scrolling the list. Delete (`Trash2`) stays exactly as it is today; only the Play Next (`ArrowUpCircle`) button is removed from this row.

**Behavior:** standard sortable-list drag — press and hold the handle, drag up/down, other rows shift to show the drop position live, release to commit. On release: compute the new `order` per above, write it, `sortPendingQueue` naturally reflects the new position on the next render via the `onSnapshot` update (no local-only reordering needed — Firestore round-trip is fast enough here, consistent with how every other host action already works in this app).

## QueueSidebar Simplification

Remove the dead `isHost={true}` branch entirely. New signature:

```js
function QueueSidebar({ showSidebar, setShowSidebar, queue, userId, handleUpvote }) {
```

Drops `isHost`, `handlePlayNext`, `handleDeleteSong`, `handleRestoreSong` params and the JSX branch that used them (the Play Next / Delete button row). The played-history section (currently host-only "restore" button, per the existing `isHost && handleRestoreSong` guard) also loses that guard's true-branch since it can never fire — guests just see history with no restore action, which is already the actual behavior today since this branch was already unreachable.

## Files Touched

- `src/App.jsx` — utility functions section (new `effectiveOrder`, `sortPendingQueue`, `computeDropOrder`), `GuestView` (replace inline sort, drop `isPriority` from `addDoc`), `HostView` (replace inline sort, drop `isPriority` from `addDoc` calls, remove `handlePlayNext`, add drag-and-drop to the Up Next tab, remove Play Next button), `QueueSidebar` (simplify to guest-only).
- `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- No `firestore.rules` changes.

## Error Handling

- Drop's `updateDoc` failure: same pattern as every other host mutation in this file — `try/catch`, `console.error`, error `Toast`. The dragged item visually snaps back to its pre-drag position since the render is driven by the Firestore snapshot, not local drag state persisted past the drop.
- No new error classes introduced — `@dnd-kit`'s drag state is entirely local/synchronous (no network calls during drag itself, only on drop).

## Out of Scope / Explicitly Deferred

- Guest drag-and-drop — not requested, guests keep upvote-only.
- Un-anchoring a song (returning a dragged song to pure vote-sort behavior) — not requested; once dragged, a song stays anchored until deleted or played. Could be a future "reset to auto" action if wanted later.
- Rebalancing `order` values over a very long-running room (theoretically, enough drags could produce floating-point precision issues from repeated midpoint bisection) — not a practical concern at party scale (dozens of songs, one event), not addressed here.
