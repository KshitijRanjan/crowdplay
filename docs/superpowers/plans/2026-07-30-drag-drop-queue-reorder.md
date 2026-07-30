# Drag-and-Drop Queue Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let hosts drag songs to any position in the Up Next queue. Dragged songs become fixed anchors; guest upvotes reorder only the songs around/between anchors, never past one. Retires the old "Play Next" priority mechanism entirely.

**Architecture:** A single shared `sortPendingQueue` function (segment-based: anchors sorted by `order`, unanchored songs sorted by votes and slotted into the segment their add-time places them in) replaces the three duplicated inline sort comparators in `GuestView`, `HostView`, and `QueueSidebar`. Drag-and-drop itself uses `@dnd-kit` and only appears in `HostView`'s Up Next tab — everything else (guest views, the sidebar) only needs the new sort function, not the drag UI.

**Tech Stack:** React 19, Firebase Firestore, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new dependency).

## Global Constraints

- No automated test framework exists in this repo — verification is `npm run lint` + `npm run build` + manual browser QA, per this project's established convention this session.
- `src/App.jsx` stays a single file.
- Upvoting must not trigger any additional Firestore writes beyond the existing single-document vote toggle — the sort must be computed client-side from data already being fetched.
- Only the dragged song's document is written on drop — no batch writes to other queue documents.
- No `firestore.rules` changes — the host's existing `isRoomHost(roomCode)` update rule already permits writing arbitrary fields, which covers the new `order`/`manuallyPositioned` fields.

---

## File Structure

All changes are within two files:

- **Modify:** `src/App.jsx` — utility functions section, `QueueSidebar`, `GuestView`, `HostView`.
- **Modify:** `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

No new files.

---

### Task 1: Shared Sort Utilities + Wire into GuestView

**Files:**
- Modify: `src/App.jsx:104` (utility functions section, directly below `attributionLabel`)
- Modify: `src/App.jsx` (`GuestView`'s `onSnapshot` listener, its `upNext` derivation, and its `handleAddSong`)

**Interfaces:**
- Consumes: nothing new — only existing Firestore data shapes (`upvotes`, `addedAt`, and the two new fields this task introduces).
- Produces: `effectiveOrder(song)`, `sortPendingQueue(songs)`, `computeDropOrder(prevNeighbor, nextNeighbor)` — all three defined here, used by every later task. `sortPendingQueue` takes an array of songs with `status === 'pending'` and returns them correctly ordered; it does not filter by status itself.

This task lays the foundation and proves it end-to-end in the simplest consumer (`GuestView`, no drag UI, just needs correct read-only ordering).

- [ ] **Step 1: Add the three utility functions**

Directly below the existing `attributionLabel` function (`src/App.jsx:99-104`), add:

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

function computeDropOrder(prevNeighbor, nextNeighbor) {
  const GAP = 60000;
  const prevOrder = prevNeighbor ? effectiveOrder(prevNeighbor) : (nextNeighbor ? effectiveOrder(nextNeighbor) - GAP * 2 : Date.now());
  const nextOrder = nextNeighbor ? effectiveOrder(nextNeighbor) : prevOrder + GAP * 2;
  return (prevOrder + nextOrder) / 2;
}
```

- [ ] **Step 2: Remove the inline sort from `GuestView`'s `onSnapshot` listener**

Find (inside `GuestView`, currently around line 1064-1076):

```js
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      songs.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        const votesA = a.upvotes?.length || 0;
        const votesB = b.upvotes?.length || 0;
        if (votesA !== votesB) return votesB - votesA;
        const ta = a.addedAt?.toMillis ? a.addedAt.toMillis() : (a.addedAt?.seconds * 1000 || 0);
        const tb = b.addedAt?.toMillis ? b.addedAt.toMillis() : (b.addedAt?.seconds * 1000 || 0);
        return ta - tb;
      });
      setQueue(songs);
    }, (error) => {
      console.error('Queue subscription error:', error);
      setToast({ message: 'Error syncing queue', type: 'error' });
    });
```

Replace with:

```js
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setQueue(songs);
    }, (error) => {
      console.error('Queue subscription error:', error);
      setToast({ message: 'Error syncing queue', type: 'error' });
    });
```

- [ ] **Step 3: Apply `sortPendingQueue` where `upNext` is derived in `GuestView`**

Find (currently around line 1170-1171):

```js
  const nowPlaying = queue.find((s) => s.status === 'playing');
  const upNext = queue.filter((s) => s.status === 'pending');
```

Replace with:

```js
  const nowPlaying = queue.find((s) => s.status === 'playing');
  const upNext = sortPendingQueue(queue.filter((s) => s.status === 'pending'));
```

- [ ] **Step 4: Drop `isPriority` from `GuestView`'s `handleAddSong`**

Find (currently around line 1134-1145):

```js
      await addDoc(collection(db, 'rooms', roomCode, 'queue'), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: userId,
        addedByName: guestName,
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
        isPriority: false,
      });
```

Replace with:

```js
      await addDoc(collection(db, 'rooms', roomCode, 'queue'), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: userId,
        addedByName: guestName,
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
      });
```

- [ ] **Step 5: Manual verification**

Run `npm run lint` and `npm run build` — both must pass clean. Then `npm run dev`, join a room as a guest with a few songs already queued, and confirm the Up Next list still shows songs sorted by votes then add-time (the default no-anchors case should look identical to before this change, since `sortPendingQueue` with zero anchored songs reduces to the old vote-then-time sort).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Add sortPendingQueue utility; wire into GuestView

Shared segment-based sort (anchors from drag-and-drop, sorted around
by upvotes) replaces the inline comparator. GuestView is the first
consumer — no anchors exist yet, so behavior is unchanged until
Task 4 adds the drag UI that actually creates them."
```

---

### Task 2: Simplify QueueSidebar

**Files:**
- Modify: `src/App.jsx` (`QueueSidebar` function signature and body, its one call site in `GuestView`)

**Interfaces:**
- Consumes: `sortPendingQueue` (Task 1).
- Produces: `QueueSidebar({ showSidebar, setShowSidebar, queue, userId, handleUpvote })` — new, smaller signature. The call site in `GuestView` already only ever passed `isHost={false}` and never passed `handlePlayNext`/`handleDeleteSong`/`handleRestoreSong`, so this is a pure simplification with no call-site behavior change.

`QueueSidebar`'s `isHost={true}` branch is dead code — `HostView` stopped rendering `QueueSidebar` entirely in the layout-restructure work done earlier this session. This task removes that unreachable branch as part of retiring "Play Next" (which lived inside it).

- [ ] **Step 1: Replace `QueueSidebar`'s signature and body**

Replace the entire function (currently `src/App.jsx:926-1044`) with:

```js
function QueueSidebar({ showSidebar, setShowSidebar, queue, userId, handleUpvote }) {
  const upNext = sortPendingQueue(queue.filter((s) => s.status === 'pending'));
  const playedHistory = queue
    .filter((s) => s.status === 'played')
    .sort((a, b) => effectiveOrder(a) - effectiveOrder(b));

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${showSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowSidebar(false)}
      />
      <aside
        className={`fixed right-0 bg-zinc-950/95 border-l border-zinc-800/50 p-6 overflow-y-auto z-50 transform transition-transform duration-300 top-0 bottom-0 w-80 ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <SkipForward className="w-5 h-5 text-indigo-400" />
            Up Next ({upNext.length})
          </h3>
          <button
            onClick={() => setShowSidebar(false)}
            className="p-2 hover:bg-zinc-900 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="space-y-3">
          {upNext.length === 0 ? (
            <p className="text-zinc-500 text-sm italic">Queue is empty...</p>
          ) : (
            upNext.map((song, index) => (
              <div key={song.id} className="flex items-center gap-3 bg-zinc-900/80 rounded-xl p-2 group">
                <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs text-zinc-400 font-medium flex-shrink-0">
                  {index + 1}
                </span>
                <img
                  src={song.thumbnailUrl}
                  alt={song.title}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-100 text-sm font-medium truncate">{song.title}</p>
                  <p className="text-zinc-400 text-xs truncate">
                    {song.channelTitle}
                    {attributionLabel(song) && <> · Added by {attributionLabel(song)}</>}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleUpvote(song)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full transition-colors ${song.upvotes?.includes(userId) ? 'bg-indigo-500 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'}`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">{song.upvotes?.length || 0}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {playedHistory.length > 0 && (
          <div className="mt-8 pt-6 border-t border-zinc-800/50 opacity-60 hover:opacity-100 transition-opacity">
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">History</h3>
            <div className="space-y-3">
              {playedHistory.slice().reverse().map((song) => (
                <div key={song.id} className="flex items-center gap-3 bg-zinc-900/60 rounded-xl p-2">
                  <img src={song.thumbnailUrl} alt={song.title} className="w-10 h-10 rounded-lg object-cover grayscale" />
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-400 text-sm font-medium truncate">{song.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
```

Note what changed from the original: the `isHost`/`handlePlayNext`/`handleDeleteSong`/`handleRestoreSong` parameters and the entire `isHost ? (...) : (...)` branch are gone, replaced by the single guest-only upvote button that was already the only reachable path. The `playedHistory` restore button (previously gated by `isHost && handleRestoreSong`, always false) is also removed since it could never render.

- [ ] **Step 2: Confirm the call site still matches**

Find where `GuestView` renders `<QueueSidebar ... />` (search `grep -n "<QueueSidebar" src/App.jsx`). It should already read:

```js
      <QueueSidebar
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        queue={queue}
        isHost={false}
        userId={userId}
        handleUpvote={handleUpvote}
      />
```

Remove the now-nonexistent `isHost={false}` prop (harmless to pass an extra prop to a component that ignores it, but the plan should leave no dead references):

```js
      <QueueSidebar
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        queue={queue}
        userId={userId}
        handleUpvote={handleUpvote}
      />
```

- [ ] **Step 3: Manual verification**

`npm run lint` and `npm run build` clean. In the running dev server, join as a guest, open the sidebar (hamburger icon) — confirm Up Next and History both render correctly with upvote buttons working, and no console errors about missing props.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Simplify QueueSidebar to guest-only, drop dead isHost branch

HostView stopped using QueueSidebar in the earlier layout-restructure
work this session, so the isHost=true branch (Play Next + delete
buttons) was already unreachable. Removes it as part of retiring Play
Next, and applies sortPendingQueue to the sidebar's own upNext list."
```

---

### Task 3: Retire Play Next, Wire sortPendingQueue into HostView

**Files:**
- Modify: `src/App.jsx` (`HostView`'s `onSnapshot` listener, `upNext`/`playedHistory` derivation, `handleAddSong`, `handleSeedPlaylist`'s `addDoc`, `handleRestoreSong`, removal of `handlePlayNext`, removal of the Play Next button in the Up Next tab row, removal of the now-unused `Timestamp` import)

**Interfaces:**
- Consumes: `sortPendingQueue`, `effectiveOrder` (Task 1).
- Produces: `HostView`'s Up Next tab row loses its Play Next button — Task 4 will add a drag handle in its place.

This is the biggest task in the plan — it touches six separate spots in `HostView`. Work through them in order; each is independent of the others within this task.

- [ ] **Step 1: Remove `Timestamp` from the Firebase imports**

`Timestamp` is only used inside `handlePlayNext`, which this task deletes. Find the `firebase/firestore` import block (`grep -n "Timestamp," src/App.jsx` to confirm it's only referenced inside `handlePlayNext` before removing — if Step 5 below hasn't been done yet when you check, `Timestamp.fromMillis` will still show up there; remove the import only after Step 5). Remove `Timestamp,` from the import list.

- [ ] **Step 2: Remove the inline sort from `HostView`'s `onSnapshot`, fix the auto-advance-to-playing logic**

Find (currently around line 1556-1588):

```js
  useEffect(() => {
    const q = query(
      collection(db, 'rooms', roomCode, 'queue'),
      where('status', 'in', ['pending', 'playing', 'played'])
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const songs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      songs.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        const vA = a.upvotes?.length || 0, vB = b.upvotes?.length || 0;
        if (vA !== vB) return vB - vA;
        const ta = a.addedAt?.toMillis ? a.addedAt.toMillis() : (a.addedAt?.seconds * 1000 || 0);
        const tb = b.addedAt?.toMillis ? b.addedAt.toMillis() : (b.addedAt?.seconds * 1000 || 0);
        return ta - tb;
      });
      setQueue(songs);
      queueRef.current = songs;

      const playing = songs.find((s) => s.status === 'playing');
      if (playing) {
        if (!currentSong || currentSong.id !== playing.id) setCurrentSong(playing);
      } else {
        const nextSong = songs.find((s) => s.status === 'pending');
        if (nextSong) {
          await updateDoc(doc(db, 'rooms', roomCode, 'queue', nextSong.id), { status: 'playing' });
        } else {
          setCurrentSong(null);
        }
      }
    });
    return () => unsubscribe();
  }, [currentSong, roomCode]);
```

Replace with:

```js
  useEffect(() => {
    const q = query(
      collection(db, 'rooms', roomCode, 'queue'),
      where('status', 'in', ['pending', 'playing', 'played'])
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const songs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setQueue(songs);
      queueRef.current = songs;

      const playing = songs.find((s) => s.status === 'playing');
      if (playing) {
        if (!currentSong || currentSong.id !== playing.id) setCurrentSong(playing);
      } else {
        const pendingSorted = sortPendingQueue(songs.filter((s) => s.status === 'pending'));
        const nextSong = pendingSorted[0];
        if (nextSong) {
          await updateDoc(doc(db, 'rooms', roomCode, 'queue', nextSong.id), { status: 'playing' });
        } else {
          setCurrentSong(null);
        }
      }
    });
    return () => unsubscribe();
  }, [currentSong, roomCode]);
```

**This is the detail that's easy to miss:** the song that auto-starts playing when nothing is currently playing must be `sortPendingQueue(...)[0]`, not just "whichever pending doc happens to come back first from Firestore" — otherwise the correctly-ordered queue in the UI wouldn't match what actually plays next.

- [ ] **Step 3: Apply `sortPendingQueue` and fix `playedHistory`'s sort where derived**

Find (currently around line 1811-1813):

```js
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const upNext = queue.filter((s) => s.status === 'pending');
  const playedHistory = queue.filter((s) => s.status === 'played').slice().reverse();
```

Replace with:

```js
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const upNext = sortPendingQueue(queue.filter((s) => s.status === 'pending'));
  const playedHistory = queue
    .filter((s) => s.status === 'played')
    .sort((a, b) => effectiveOrder(a) - effectiveOrder(b))
    .reverse();
```

- [ ] **Step 4: Drop `isPriority` from `handleSeedPlaylist`'s `addDoc`**

Find (currently around line 1420-1430):

```js
          await addDoc(roomQueueRef(), {
            videoId: video.videoId,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            channelTitle: video.channelTitle,
            addedBy: 'host-seed',
            addedAt: serverTimestamp(),
            status: 'pending',
            upvotes: [],
            isPriority: false,
          });
```

Replace with:

```js
          await addDoc(roomQueueRef(), {
            videoId: video.videoId,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            channelTitle: video.channelTitle,
            addedBy: 'host-seed',
            addedAt: serverTimestamp(),
            status: 'pending',
            upvotes: [],
          });
```

- [ ] **Step 5: Remove `handlePlayNext` entirely, drop `isPriority` from `handleRestoreSong`**

Find (currently around line 1662-1693):

```js
  const handlePlayNext = async (song) => {
    try {
      const pendingSongs = queue.filter((s) => s.status === 'pending');
      if (pendingSongs.length === 0) return;
      const topSong = pendingSongs[0];
      if (topSong.id === song.id) { setToast({ message: 'Song is already up next!', type: 'success' }); return; }
      let newTime;
      if (topSong.addedAt?.toMillis) {
        newTime = Timestamp.fromMillis(topSong.addedAt.toMillis() - 1000);
      } else {
        const base = topSong.addedAt?.toMillis ? topSong.addedAt.toMillis() : Date.now();
        newTime = Timestamp.fromMillis(base - 1000);
      }
      await updateDoc(roomDocRef(song.id), { isPriority: true, addedAt: newTime });
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
      setToast({ message: 'Song moved to top!', type: 'success' });
    } catch (e) {
      console.error('Play next error:', e);
      setToast({ message: 'Failed to prioritize song', type: 'error' });
    }
  };

  const handleRestoreSong = async (song) => {
    try {
      await updateDoc(roomDocRef(song.id), { status: 'pending', isPriority: false, addedAt: serverTimestamp() });
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
      setToast({ message: 'Song added back to queue!', type: 'success' });
    } catch (e) {
      console.error('Restore song error:', e);
      setToast({ message: 'Failed to restore song.', type: 'error' });
    }
  };
```

Replace with (only `handleRestoreSong` remains, `isPriority` dropped, and it also resets `manuallyPositioned` so a restored song re-enters as a normal unanchored song rather than keeping a stale anchor from before it was played):

```js
  const handleRestoreSong = async (song) => {
    try {
      await updateDoc(roomDocRef(song.id), { status: 'pending', manuallyPositioned: false, addedAt: serverTimestamp() });
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
      setToast({ message: 'Song added back to queue!', type: 'success' });
    } catch (e) {
      console.error('Restore song error:', e);
      setToast({ message: 'Failed to restore song.', type: 'error' });
    }
  };
```

Now go back and complete Step 1 (removing the `Timestamp` import) — it's safe now that `handlePlayNext` is gone.

- [ ] **Step 6: Drop `isPriority` from `HostView`'s own `handleAddSong`**

Find (currently around line 1731-1741):

```js
      await addDoc(roomQueueRef(), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: 'host',
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
        isPriority: false,
      });
```

Replace with:

```js
      await addDoc(roomQueueRef(), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: 'host',
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
      });
```

- [ ] **Step 7: Remove the Play Next button from the Up Next tab row**

Find (currently around line 2047-2062, inside the `upNext.map` in the Up Next tab):

```js
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handlePlayNext(song)}
                        className={`p-1.5 hover:bg-zinc-800 rounded-full transition-colors ${song.isPriority ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                        title="Play Next"
                      >
                        <ArrowUpCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSong(song.id)}
                        className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
```

Replace with (Play Next button removed, delete button unchanged — Task 4 adds a drag handle elsewhere in this same row):

```js
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDeleteSong(song.id)}
                        className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
```

- [ ] **Step 8: Manual verification**

`npm run lint` and `npm run build` clean (this will also catch any leftover reference to `handlePlayNext` or `Timestamp` if Step 1/5 weren't done correctly — an undefined-variable reference is a build error, not just a lint warning, so a clean build is strong evidence this task is complete). In the dev server, host a room, add a few songs, confirm: no Play Next button appears, delete still works, the currently-playing song is still the correct one (first in vote/time order) when nothing was manually reordered yet.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "Retire Play Next; wire sortPendingQueue into HostView

Removes handlePlayNext, isPriority, and the priority-arrow button
entirely from the host side. HostView's queue listener and Up Next/
Played derivation now use the shared sortPendingQueue, including
picking the correct next song to auto-play when nothing is playing."
```

---

### Task 4: Drag-and-Drop in HostView's Up Next Tab

**Files:**
- Modify: `package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Modify: `src/App.jsx` (imports, `HostView`'s Up Next tab row — add drag handle and drop handler)

**Interfaces:**
- Consumes: `computeDropOrder`, `effectiveOrder` (Task 1), `bumpRoomActivity` (existing), `handleDeleteSong` row (Task 3's already-simplified row).
- Produces: nothing new consumed elsewhere — this is the final task in the plan.

- [ ] **Step 1: Install the dependency**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: `package.json`'s `dependencies` gains three new entries; `package-lock.json` updates accordingly.

- [ ] **Step 2: Add imports**

At the top of `src/App.jsx`, alongside the existing imports, add:

```js
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

Also add `GripVertical` to the existing `lucide-react` import list (find it via `grep -n "from 'lucide-react'" src/App.jsx` and add `GripVertical,` alongside the other icon names already imported there, e.g. next to `Trash2`).

- [ ] **Step 3: Add a `SortableUpNextRow` component**

Add this new component directly above `function HostView(...)` (search `grep -n "^function HostView"` to find the insertion point):

```js
// ============================================================================
// SORTABLE UP NEXT ROW (drag-and-drop, host only)
// ============================================================================
function SortableUpNextRow({ song, index, handleDeleteSong }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-zinc-900/60 rounded-xl p-2 border border-zinc-800/50 group"
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1.5 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-xs text-zinc-500 font-medium">{index + 1}</span>
      <img src={song.thumbnailUrl} alt={song.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-zinc-100 text-sm font-medium truncate">{song.title}</p>
        <p className="text-zinc-500 text-xs truncate">
          {song.channelTitle}
          {attributionLabel(song) && <> · Added by {attributionLabel(song)}</>}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => handleDeleteSong(song.id)}
          className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add a `handleReorderSong` function inside `HostView`**

Add this near `handleDeleteSong` (search `grep -n "const handleDeleteSong = async" src/App.jsx` inside `HostView`):

```js
  const handleReorderSong = async (songId, newIndex, currentUpNext) => {
    try {
      const reordered = arrayMove(currentUpNext, currentUpNext.findIndex((s) => s.id === songId), newIndex);
      const draggedIndex = reordered.findIndex((s) => s.id === songId);
      const prevNeighbor = draggedIndex > 0 ? reordered[draggedIndex - 1] : null;
      const nextNeighbor = draggedIndex < reordered.length - 1 ? reordered[draggedIndex + 1] : null;
      const newOrder = computeDropOrder(
        prevNeighbor && prevNeighbor.id !== songId ? prevNeighbor : null,
        nextNeighbor && nextNeighbor.id !== songId ? nextNeighbor : null
      );
      await updateDoc(roomDocRef(songId), { order: newOrder, manuallyPositioned: true });
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
    } catch (e) {
      console.error('Reorder song error:', e);
      setToast({ message: 'Failed to reorder song.', type: 'error' });
    }
  };
```

- [ ] **Step 5: Add `dndSensors` inside `HostView`**

Add near the top of `HostView`, alongside its other hooks (search for `const isInitialLoad = useRef(true);` as an anchor point, add directly below it):

```js
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );
```

- [ ] **Step 6: Wrap the Up Next list in `DndContext`/`SortableContext`, use `SortableUpNextRow`**

Find the Up Next tab's list rendering (from Task 3's Step 7, the `<div className="space-y-2">{upNext.map(...)}</div>` block inside `queueTab === 'upNext' ? upNext.length === 0 ? (...) : (...)`):

```js
            ) : (
              <div className="space-y-2">
                {upNext.map((song, index) => (
                  <div key={song.id} className="flex items-center gap-3 bg-zinc-900/60 rounded-xl p-2 border border-zinc-800/50 group">
                    <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-xs text-zinc-500 font-medium">{index + 1}</span>
                    <img src={song.thumbnailUrl} alt={song.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-100 text-sm font-medium truncate">{song.title}</p>
                      <p className="text-zinc-500 text-xs truncate">
                        {song.channelTitle}
                        {attributionLabel(song) && <> · Added by {attributionLabel(song)}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDeleteSong(song.id)}
                        className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
```

Replace with:

```js
            ) : (
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  const { active, over } = event;
                  if (!over || active.id === over.id) return;
                  const newIndex = upNext.findIndex((s) => s.id === over.id);
                  handleReorderSong(active.id, newIndex, upNext);
                }}
              >
                <SortableContext items={upNext.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {upNext.map((song, index) => (
                      <SortableUpNextRow key={song.id} song={song} index={index} handleDeleteSong={handleDeleteSong} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
```

- [ ] **Step 7: Manual verification**

`npm run lint` and `npm run build` clean. In the dev server, host a room with at least 4 songs queued. Confirm:
- Each row shows a grip handle; dragging it (mouse) reorders the list, and the new position persists after a page refresh.
- Dragging a song to the top, then having a different (unanchored) song's vote count change — confirm the dragged song stays put and the vote-driven reordering only happens among the other songs, per the worked example in the spec.
- Deleting a song still works (unaffected by the grip handle addition).
- On a touch device or browser touch emulation, confirm dragging works via touch (press-and-hold per the `TouchSensor` delay, then drag).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx package.json package-lock.json
git commit -m "Add drag-and-drop reordering to HostView's Up Next list

Uses @dnd-kit for touch-friendly sortable drag. Dropping a song
computes its new order as the midpoint of its drop-target neighbors
and marks it manuallyPositioned, making it an anchor that future
upvote-driven sorting respects per sortPendingQueue's segment logic."
```

---

## Self-Review Notes

- **Spec coverage:** Data Model → Task 1 (fields introduced via writes in Task 4, read everywhere via `effectiveOrder`). Sort Algorithm → Task 1 (`sortPendingQueue`), applied in Tasks 1-3. Computing the drop order → Task 1 (`computeDropOrder`), used in Task 4. Drag Interaction → Task 4. QueueSidebar Simplification → Task 2. Retiring Play Next → Task 3.
- **Ordering dependency called out explicitly:** Task 3, Step 2's fix to the auto-advance-to-playing logic (`sortPendingQueue(...)[0]` instead of `songs.find(...)`) is a detail the spec's prose didn't spell out but is required for correctness — flagged inline in that step with an explanation, not left implicit.
- **Type/signature consistency check:** `sortPendingQueue(songs)` takes a plain array and returns a plain array — same shape used identically in Tasks 1, 2, 3. `effectiveOrder(song)` used consistently for both the anchored-sort and the `playedHistory` sort (Task 3, Step 3) instead of duplicating a timestamp-extraction expression a fourth time. `handleReorderSong(songId, newIndex, currentUpNext)` in Task 4 takes the already-`sortPendingQueue`-ordered `upNext` array from the render scope, consistent with how `onDragEnd` computes `newIndex` against that same array.
