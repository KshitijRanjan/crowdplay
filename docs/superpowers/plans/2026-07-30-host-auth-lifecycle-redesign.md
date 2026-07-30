# Host Auth & Room Lifecycle Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace anonymous host identity with real Firebase Auth (Google Sign-In), replace the fixed 12h room expiry with rolling-inactivity-or-manual-end archiving plus a reopenable history, add guest display names with song attribution, and add a Web Share API button for the room join link.

**Architecture:** Everything lives in the existing monolithic `src/App.jsx` (per this project's established convention — do not split into multiple files). New top-level components (`HostDashboard`) follow the same pattern as existing ones (`AdminFlow`, `CreateRoomForm`, etc.). Firestore is the only backend; there are no Cloud Functions, so all lifecycle logic (archiving) is computed client-side on read, never a scheduled server transition.

**Tech Stack:** React 19, Vite 7, Firebase 12 (`firebase/auth`, `firebase/firestore`), Tailwind CSS 4, `qrcode.react`. No new dependencies — `GoogleAuthProvider`/`signInWithPopup` are already part of the installed `firebase` package, and `navigator.share` is a native browser API.

## Global Constraints

- No automated test framework exists in this repo (`package.json` has no test runner). Verification for every task is manual, via `npm run dev`, following this project's established convention (see `docs/superpowers/sdd/progress.md`: "manual browser QA passed"). Do not introduce a test framework as part of this plan — out of scope.
- `src/App.jsx` stays a single file. Do not extract new files unless a task explicitly says to.
- Free tier only — no Cloud Functions, no paid Firebase features.
- Every Firestore write must satisfy `firestore.rules` — when a task changes what gets written, check whether the rule needs updating in the same task.
- Guests remain anonymous (`signInAnonymously`) — only host identity moves to Google Sign-In.

---

## File Structure

All changes are within two files:

- **Modify:** `src/App.jsx` — utility functions, all host-facing components, `QueueSidebar`, `GuestView`, `App`.
- **Modify:** `firestore.rules` — `rooms` collection `create`/`update` rules.

No new files are created. No `package.json` changes.

---

### Task 1: Firebase Auth — Google Sign-In for Host Request & Login

**Files:**
- Modify: `src/App.jsx:1-24` (imports)
- Modify: `src/App.jsx:204-316` (`RequestAccessForm`)
- Modify: `src/App.jsx:346-447` (`HostLoginForm`)

**Interfaces:**
- Consumes: existing `auth`, `db` instances (module-level, already defined at `App.jsx:71-73`); existing `Toast`-style inline error pattern used throughout.
- Produces: `RequestAccessForm({ onBack, onSuccess })` — same signature as today, `onSuccess` still takes no args. `HostLoginForm({ onBack, onSuccess })` — `onSuccess` now called as `onSuccess(uid, email)`, same as today (email now comes from the Google profile instead of a text input).

This task removes the email/name-only request form and the email-only login form, replacing both with a single "Continue with Google" button per screen. `signInWithPopup` on the request screen creates the Firebase Auth account automatically on first use — no separate password step, and no migration needed for hosts already in `approvedHosts` (their first Google sign-in creates their Firebase Auth account transparently).

- [ ] **Step 1: Add Google Auth imports**

In `src/App.jsx`, find the existing auth import (around line 5):

```js
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
```

Replace with:

```js
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
```

- [ ] **Step 2: Add a shared Google provider instance**

Directly below the existing `const db = getFirestore(app);` line (around line 73), add:

```js
const googleProvider = new GoogleAuthProvider();
```

- [ ] **Step 3: Rewrite `RequestAccessForm`**

Replace the entire `RequestAccessForm` function (lines 204-316) with:

```js
// ============================================================================
// REQUEST ACCESS FORM
// ============================================================================
function RequestAccessForm({ onBack, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleRequest = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email.toLowerCase().trim();
      const name = result.user.displayName || email;

      const reqRef = doc(db, 'hostRequests', email);
      const existing = await getDoc(reqRef);

      if (existing.exists()) {
        const status = existing.data().status;
        if (status === 'approved') {
          setError('You already have host access! Use "Host a Party" to log in.');
        } else if (status === 'denied') {
          setError('Your previous request was denied. Contact the admin directly.');
        } else {
          setError('Request already submitted. Please wait for approval.');
        }
        setLoading(false);
        return;
      }

      await setDoc(reqRef, {
        name,
        email,
        requestedAt: serverTimestamp(),
        status: 'pending',
      });

      if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            from_name: name,
            from_email: email,
            admin_url: `${window.location.origin}/admin`,
          },
          EMAILJS_PUBLIC_KEY
        );
      }

      onSuccess();
    } catch (err) {
      console.error('Request access error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User closed the popup — no error needed, just stop loading.
      } else {
        setError('Failed to submit. Please try again.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 w-full max-w-sm border border-purple-500/30 shadow-2xl">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Request Host Access</h2>
          <p className="text-slate-400 text-sm">Sign in with Google to request access. We'll review it and get back to you.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl p-3 border border-red-500/20 mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleRequest}
          disabled={loading}
          className="w-full py-4 bg-white text-slate-900 font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-100 transition-all duration-300 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue with Google'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `HostLoginForm`**

Replace the entire `HostLoginForm` function (now shifted — search for `function HostLoginForm`) with:

```js
// ============================================================================
// HOST LOGIN FORM
// ============================================================================
function HostLoginForm({ onBack, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email.toLowerCase().trim();

      const approvedRef = doc(db, 'approvedHosts', email);
      const approved = await getDoc(approvedRef);

      if (!approved.exists()) {
        const reqRef = doc(db, 'hostRequests', email);
        const req = await getDoc(reqRef);
        if (req.exists()) {
          const status = req.data().status;
          if (status === 'pending') {
            setError('Your request is still pending approval. Please check back later.');
          } else if (status === 'denied') {
            setError('Your host access request was denied.');
          } else {
            setError('Email not found. Please request host access first.');
          }
        } else {
          setError('Email not found. Please request host access first.');
        }
        setLoading(false);
        return;
      }

      sessionStorage.setItem('pinVerified', 'true');
      sessionStorage.setItem('userRole', 'host');
      sessionStorage.setItem('hostEmail', email);

      onSuccess(result.user.uid, email);
    } catch (err) {
      console.error('Host login error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User closed the popup — no error needed.
      } else {
        setError('Login failed. Please try again.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 w-full max-w-sm border border-purple-500/30 shadow-2xl">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Host Login</h2>
          <p className="text-slate-400 text-sm">Sign in with the Google account you requested access with.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl p-3 border border-red-500/20 mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-4 bg-white text-slate-900 font-bold rounded-2xl disabled:opacity-50 hover:bg-slate-100 transition-all duration-300 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue with Google'}
        </button>

        <p className="text-center text-slate-600 text-xs mt-6">
          Don't have access?{' '}
          <button onClick={onBack} className="text-purple-400 hover:text-purple-300">
            Request it
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `http://localhost:5173`. Click "Want to host? Request access" → click "Continue with Google" → complete the Google popup with a test Google account. Confirm: no console errors, and (open Firestore console) a `hostRequests/{your-email}` doc was created with `status: 'pending'`. Then go back to landing, click "Host a Party" → "Continue with Google" with the same account → confirm you see "Your request is still pending approval."

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Replace host email/PIN auth with Google Sign-In

Firebase Auth's Email/Password provider was never enabled — this uses
Google Sign-In instead, which needs no password/reset flow and fixes
the anonymous-auth UID instability across devices that room history
depends on."
```

---

### Task 2: Firestore Rules — Close the Room-Creation Gap

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `approvedHosts/{email}` documents (already exist, written by `AdminFlow`'s `handleApprove`).
- Produces: tightened `rooms` `create` rule; a new `onlyBumpingActivity()` helper used by Task 5.

This task closes the gap where any authenticated (including anonymous/guest) client could create a room directly via the Firestore SDK. It also adds the rule Task 5 needs to let guests bump a room's `lastActivityAt` without granting them full room-update access — this wasn't spelled out in the design spec's rules snippet, but is a direct requirement of "activity is bumped on guest actions" combined with the existing host-only `update` rule, so it belongs here rather than as a late patch.

- [ ] **Step 1: Read the current rule block**

```bash
grep -n "match /rooms" -A 20 firestore.rules
```

Confirm it matches what's expected (the `rooms/{roomCode}` block with `allow create: if isAuthenticated();` and `allow update: if isAuthenticated() && resource.data.hostUid == request.auth.uid;`).

- [ ] **Step 2: Add the `onlyBumpingActivity()` helper**

Find the `onlyUpvoting()` helper function near the top of `firestore.rules`:

```
function onlyUpvoting() {
  return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['upvotes']);
}
```

Add a new helper directly below it:

```
function onlyBumpingActivity() {
  return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastActivityAt']);
}
```

- [ ] **Step 3: Update the `rooms` create and update rules**

Replace:

```
match /rooms/{roomCode} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated();
  allow update: if isAuthenticated() && resource.data.hostUid == request.auth.uid;
  allow delete: if false;
```

With:

```
match /rooms/{roomCode} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated()
                && exists(/databases/$(database)/documents/approvedHosts/$(request.auth.token.email));
  allow update: if isAuthenticated() && (
                  resource.data.hostUid == request.auth.uid ||
                  onlyBumpingActivity()
                );
  allow delete: if false;
```

- [ ] **Step 4: Deploy the rules**

```bash
firebase use wedding-management-de9b1
firebase deploy --only firestore:rules
```

Expected output ends with `✔  Deploy complete!`.

- [ ] **Step 5: Manual verification**

In the Firebase console, open Firestore → Rules Playground (or use the app directly): confirm a host account (in `approvedHosts`) can still create a room, and that attempting `db.collection('rooms').add(...)` from an anonymous/guest session (e.g. via browser devtools console while signed in as a guest) is denied with a permission error.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules
git commit -m "Restrict room creation to approved hosts; allow guests to bump room activity

Closes the gap where any authenticated client (including anonymous
guests) could create a room directly via the Firestore SDK. Adds a
narrow update path so guest actions can update lastActivityAt without
granting full room-update access."
```

---

### Task 3: Room Lifecycle Data Model — `isRoomLive`, Room Name, `endedByHost`

**Files:**
- Modify: `src/App.jsx` (utility functions section, `CreateRoomForm`, `HostView`'s `handleEndRoom`)

**Interfaces:**
- Consumes: `Timestamp`, `serverTimestamp` (already imported from `firebase/firestore`).
- Produces: `isRoomLive(roomData)` — replaces `isRoomActive(roomData)`, same call sites. `CreateRoomForm({ hostUid, hostEmail, onRoomCreated })` — same signature, room docs now include `name`, `lastActivityAt`, `endedByHost` instead of `expiresAt`, `status`.

- [ ] **Step 1: Replace `isRoomActive` with `isRoomLive`**

Find:

```js
function isRoomActive(roomData) {
  if (!roomData || roomData.status !== 'active') return false;
  const expiresAt = roomData.expiresAt?.toMillis ? roomData.expiresAt.toMillis() : 0;
  return expiresAt > Date.now();
}
```

Replace with:

```js
function isRoomLive(roomData) {
  if (!roomData || roomData.endedByHost) return false;
  const last = roomData.lastActivityAt?.toMillis ? roomData.lastActivityAt.toMillis() : 0;
  return (Date.now() - last) < 12 * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Update `clearSession` to also clear `guestName`**

Find:

```js
function clearSession() {
  sessionStorage.removeItem('pinVerified');
  sessionStorage.removeItem('userRole');
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('hostEmail');
}
```

Replace with:

```js
function clearSession() {
  sessionStorage.removeItem('pinVerified');
  sessionStorage.removeItem('userRole');
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('hostEmail');
  sessionStorage.removeItem('guestName');
}
```

- [ ] **Step 3: Update `CreateRoomForm`**

Replace the entire `CreateRoomForm` function with:

```js
// ============================================================================
// CREATE ROOM FORM
// ============================================================================
function CreateRoomForm({ hostUid, hostEmail, onRoomCreated }) {
  const [roomName, setRoomName] = useState('');
  const [guestPin, setGuestPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (guestPin.length !== 4 || !roomName.trim()) return;
    setLoading(true);
    setError('');

    try {
      // End any currently-live room for this host — only one live room per host.
      const existingQuery = query(
        collection(db, 'rooms'),
        where('hostUid', '==', hostUid),
        where('endedByHost', '==', false)
      );
      const existingSnap = await getDocs(existingQuery);
      const liveDocs = existingSnap.docs.filter((d) => isRoomLive(d.data()));
      const endBatch = writeBatch(db);
      liveDocs.forEach((d) => endBatch.update(d.ref, { endedByHost: true }));
      if (liveDocs.length > 0) await endBatch.commit();

      const roomCode = generateRoomCode();

      await setDoc(doc(db, 'rooms', roomCode), {
        hostUid,
        hostEmail,
        guestPin,
        name: roomName.trim(),
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        endedByHost: false,
      });

      await setDoc(doc(db, 'rooms', roomCode, 'roles', hostUid), { role: 'host' });

      sessionStorage.setItem('roomCode', roomCode);

      onRoomCreated({ roomCode, guestPin, roomName: roomName.trim() });
    } catch (err) {
      console.error('Create room error:', err);
      setError('Failed to create room. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 w-full max-w-sm border border-purple-500/30 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hash className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Start a New Party</h2>
          <p className="text-slate-400 text-sm">Give it a name and pick a 4-digit PIN your guests will use to join.</p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="e.g. Friday Night Sessions"
            maxLength={60}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={guestPin}
            onChange={(e) => setGuestPin(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 4729"
            className="w-full text-center text-4xl tracking-[0.5em] py-4 bg-slate-700/50 border border-slate-600 rounded-2xl text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl p-3 border border-red-500/20">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={guestPin.length !== 4 || !roomName.trim() || loading}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl disabled:opacity-50 hover:from-purple-500 hover:to-pink-500 transition-all duration-300"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Start Party 🎉'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: the `where('status', '==', 'active')` query is replaced with `where('endedByHost', '==', false)` — `isRoomLive` is then applied client-side to that result set, since Firestore can't query on the computed 12h window directly.

- [ ] **Step 4: Update `handleEndRoom` in `HostView`**

Find (inside `HostView`):

```js
  const handleEndRoom = async () => {
    if (!window.confirm('End this party? The room will close for all guests.')) return;
    try {
      await updateDoc(doc(db, 'rooms', roomCode), { status: 'expired' });
      clearSession();
      onEndRoom();
    } catch (e) {
      console.error('End room error:', e);
      setToast({ message: 'Failed to end room.', type: 'error' });
    }
  };
```

Replace with:

```js
  const handleEndRoom = async () => {
    if (!window.confirm('End this party? The room will close for all guests.')) return;
    try {
      await updateDoc(doc(db, 'rooms', roomCode), { endedByHost: true });
      clearSession();
      onEndRoom();
    } catch (e) {
      console.error('End room error:', e);
      setToast({ message: 'Failed to end room.', type: 'error' });
    }
  };
```

- [ ] **Step 5: Manual verification**

`npm run dev`, log in as an approved host, create a room with a name — confirm in the Firestore console the new room doc has `name`, `lastActivityAt`, `endedByHost: false`, and no `expiresAt`/`status` fields. Click "End Party" — confirm `endedByHost` flips to `true`.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Replace fixed 12h room expiry with rolling-activity model

isRoomLive() checks lastActivityAt against a 12h rolling window instead
of a fixed expiresAt, and endedByHost replaces the status field so a
host ending a party is a hard stop independent of the timer."
```

---

### Task 4: Bump `lastActivityAt` on Song and Playback Actions

**Files:**
- Modify: `src/App.jsx` (`GuestView`'s `handleAddSong`/`handleUpvote`, `HostView`'s `handleAddSong`/`handlePlayNext`/`handleDeleteSong`/`handleSkip`/`handlePrevious`/`handleRestoreSong`/`handleSongEnded`)

**Interfaces:**
- Consumes: `updateDoc`, `doc`, `db`, `writeBatch` (already imported). Task 2's rule change (guests can update `lastActivityAt` only).
- Produces: every action that should count as "activity" now also touches `rooms/{roomCode}.lastActivityAt`.

- [ ] **Step 1: Add a shared bump helper near the top-level utility functions**

Directly below `isRoomLive` (added in Task 3), add:

```js
function bumpRoomActivity(roomCode) {
  return updateDoc(doc(db, 'rooms', roomCode), { lastActivityAt: serverTimestamp() });
}
```

- [ ] **Step 2: Call it from `GuestView.handleAddSong`**

Find (inside `GuestView`):

```js
    try {
      await addDoc(collection(db, 'rooms', roomCode, 'queue'), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: userId,
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
        isPriority: false,
      });
      recordSongAdd();
```

Add a bump call right after the `addDoc`:

```js
    try {
      await addDoc(collection(db, 'rooms', roomCode, 'queue'), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: userId,
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
        isPriority: false,
      });
      await bumpRoomActivity(roomCode);
      recordSongAdd();
```

- [ ] **Step 3: Call it from `GuestView.handleUpvote`**

Find:

```js
  const handleUpvote = async (song) => {
    try {
      const songRef = doc(db, 'rooms', roomCode, 'queue', song.id);
      const isVoted = song.upvotes?.includes(userId);
      await updateDoc(songRef, {
        upvotes: isVoted ? arrayRemove(userId) : arrayUnion(userId),
      });
    } catch (err) {
```

Replace with:

```js
  const handleUpvote = async (song) => {
    try {
      const songRef = doc(db, 'rooms', roomCode, 'queue', song.id);
      const isVoted = song.upvotes?.includes(userId);
      await updateDoc(songRef, {
        upvotes: isVoted ? arrayRemove(userId) : arrayUnion(userId),
      });
      await bumpRoomActivity(roomCode);
    } catch (err) {
```

- [ ] **Step 4: Call it from `HostView`'s playback/queue actions**

In `HostView`, add `await bumpRoomActivity(roomCode);` at the end of the `try` block (right before the closing `} catch` or the final success line) in each of: `handleAddSong`, `handlePlayNext`, `handleDeleteSong`, `handleSkip`, `handlePrevious`, `handleRestoreSong`, and inside `handleSongEnded` right after `await batch.commit();`. For example, `handleDeleteSong` becomes:

```js
  const handleDeleteSong = async (songId) => {
    if (!window.confirm('Delete this song from queue?')) return;
    try {
      await deleteDoc(roomDocRef(songId));
      await bumpRoomActivity(roomCode);
      setToast({ message: 'Song removed from queue', type: 'success' });
    } catch (e) {
      console.error('Delete song error:', e);
      setToast({ message: 'Failed to delete song', type: 'error' });
    }
  };
```

Apply the same one-line addition (`await bumpRoomActivity(roomCode);` right after the Firestore write succeeds, before the success toast/state update) to `handleAddSong`, `handlePlayNext`, `handleSkip`, `handlePrevious`, `handleRestoreSong`, and `handleSongEnded`.

- [ ] **Step 5: Manual verification**

With a room open in two tabs (host + guest), add a song as the guest — check the Firestore console shows `rooms/{code}.lastActivityAt` updated to a new timestamp. Repeat for an upvote, and for a host action (e.g. delete a song).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Bump room lastActivityAt on song add, upvote, and playback actions

Keeps isRoomLive()'s rolling 12h window accurate — a party that's
still active doesn't silently archive mid-way through."
```

---

### Task 5: Host Dashboard, Login Routing, and History List

**Files:**
- Modify: `src/App.jsx` (new `HostDashboard` component, `App` component's routing and `onAuthStateChanged`/`handleHostLogin` logic)

**Interfaces:**
- Consumes: `isRoomLive`, `query`, `collection`, `where`, `getDocs`, `onSnapshot` (already imported/available).
- Produces: `HostDashboard({ hostUid, onCreateNew, onOpenRoom })` — new component. `onOpenRoom(room)` is called with `{ roomCode, guestPin, roomName }` for a reopened room (same shape `handleRoomCreated` already expects).

This is the biggest UI task: after login, a host with no live room lands on a dashboard showing "Start New Party" plus every room they've ever created, instead of being forced straight into `CreateRoomForm`.

- [ ] **Step 1: Add the `HostDashboard` component**

Add this new function directly above `function App() {`:

```js
// ============================================================================
// HOST DASHBOARD (create new / history)
// ============================================================================
function HostDashboard({ hostUid, onCreateNew, onOpenRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'rooms'), where('hostUid', '==', hostUid));
    getDocs(q).then((snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tb - ta;
        });
      setRooms(list);
      setLoading(false);
    }).catch((err) => {
      console.error('Load room history error:', err);
      setLoading(false);
    });
  }, [hostUid]);

  const handleReopen = async (room) => {
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        lastActivityAt: serverTimestamp(),
        endedByHost: false,
      });
      sessionStorage.setItem('roomCode', room.id);
      onOpenRoom({ roomCode: room.id, guestPin: room.guestPin, roomName: room.name });
    } catch (err) {
      console.error('Reopen room error:', err);
      setToast({ message: 'Failed to reopen party.', type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-lg mx-auto py-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
        </div>

        <button
          onClick={onCreateNew}
          className="w-full py-5 mb-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xl rounded-2xl hover:from-purple-500 hover:to-pink-500 transition-all duration-300 shadow-lg shadow-purple-500/30 flex items-center justify-center gap-3"
        >
          <Music className="w-6 h-6" />
          Start New Party
        </button>

        <h2 className="text-slate-400 font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          History
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No past parties yet.</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => {
              const live = isRoomLive(room);
              return (
                <button
                  key={room.id}
                  onClick={() => handleReopen(room)}
                  className="w-full text-left bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 hover:border-purple-500/40 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{room.name || room.id}</p>
                    <p className="text-slate-500 text-xs font-mono mt-0.5">{room.id}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border flex-shrink-0 ${live ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-700/50 text-slate-400 border-slate-600/50'}`}>
                    {live ? 'Live' : 'Archived'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Update `App`'s login routing**

Find `handleHostLogin` inside `App`:

```js
  const handleHostLogin = async (uid, email) => {
    setHostUid(uid);
    setHostEmail(email);
    setUserId(uid);

    // Check for existing active room
    try {
      const existingQuery = query(
        collection(db, 'rooms'),
        where('hostUid', '==', uid),
        where('status', '==', 'active')
      );
      const snap = await getDocs(existingQuery);
      const activeRoom = snap.docs.find((d) => isRoomActive(d.data()));

      if (activeRoom) {
        const rd = activeRoom.data();
        const roomCode = activeRoom.id;
        sessionStorage.setItem('roomCode', roomCode);
        setCurrentRoom({ roomCode, guestPin: rd.guestPin });
        setView('host-view');
        return;
      }
    } catch (e) {
      console.error('Active room check error:', e);
    }

    setView('create-room');
  };
```

Replace with:

```js
  const handleHostLogin = async (uid, email) => {
    setHostUid(uid);
    setHostEmail(email);
    setUserId(uid);

    try {
      const existingQuery = query(
        collection(db, 'rooms'),
        where('hostUid', '==', uid),
        where('endedByHost', '==', false)
      );
      const snap = await getDocs(existingQuery);
      const liveRoom = snap.docs.find((d) => isRoomLive(d.data()));

      if (liveRoom) {
        const rd = liveRoom.data();
        const roomCode = liveRoom.id;
        sessionStorage.setItem('roomCode', roomCode);
        setCurrentRoom({ roomCode, guestPin: rd.guestPin, roomName: rd.name });
        setView('host-view');
        return;
      }
    } catch (e) {
      console.error('Live room check error:', e);
    }

    setView('host-dashboard');
  };
```

- [ ] **Step 3: Update the session-restore `onAuthStateChanged` block**

Find (inside `App`'s first `useEffect`):

```js
        if (userRole === 'host' && savedRoomCode) {
          try {
            const roomDoc = await getDoc(doc(db, 'rooms', savedRoomCode));
            if (roomDoc.exists() && isRoomActive(roomDoc.data())) {
              const rd = roomDoc.data();
              setCurrentRoom({ roomCode: savedRoomCode, guestPin: rd.guestPin });
              setView('host-view');
              return;
            }
          } catch (e) {
            console.error('Session restore error:', e);
          }
          clearSession();
          setView('landing');
        } else if (userRole === 'guest' && savedRoomCode) {
          setCurrentRoom({ roomCode: savedRoomCode });
          setView('guest-view');
        } else {
          setView(prefilledCode ? 'guest-join' : 'landing');
        }
```

Replace with:

```js
        if (userRole === 'host' && savedRoomCode) {
          try {
            const roomDoc = await getDoc(doc(db, 'rooms', savedRoomCode));
            if (roomDoc.exists() && isRoomLive(roomDoc.data())) {
              const rd = roomDoc.data();
              setHostUid(user.uid);
              setHostEmail(rd.hostEmail);
              setCurrentRoom({ roomCode: savedRoomCode, guestPin: rd.guestPin, roomName: rd.name });
              setView('host-view');
              return;
            }
          } catch (e) {
            console.error('Session restore error:', e);
          }
          setHostUid(user.uid);
          setHostEmail(sessionStorage.getItem('hostEmail') || '');
          setView('host-dashboard');
        } else if (userRole === 'guest' && savedRoomCode) {
          try {
            const roomDoc = await getDoc(doc(db, 'rooms', savedRoomCode));
            if (roomDoc.exists() && isRoomLive(roomDoc.data())) {
              setCurrentRoom({ roomCode: savedRoomCode });
              setView('guest-view');
              return;
            }
          } catch (e) {
            console.error('Guest session restore error:', e);
          }
          clearSession();
          setView(prefilledCode ? 'guest-join' : 'landing');
        } else {
          setView(prefilledCode ? 'guest-join' : 'landing');
        }
```

This also fixes a real bug found during the design walkthrough: a guest whose room had expired previously stayed stuck in a dead `guest-view` with no messaging — now they're routed back to landing/guest-join instead.

- [ ] **Step 4: Add the `host-dashboard` view and its route handlers**

Find the `if (view === 'create-room') { ... }` block inside `App`'s render section and add a new block directly above it:

```js
  if (view === 'host-dashboard') {
    return (
      <HostDashboard
        hostUid={hostUid}
        onCreateNew={() => setView('create-room')}
        onOpenRoom={(room) => { setCurrentRoom(room); setView('host-view'); }}
      />
    );
  }
```

- [ ] **Step 5: Manual verification**

Log in as an approved host with no rooms yet — confirm you land on the dashboard with "Start New Party" and an empty history. Create a room, end it, log out, log back in — confirm you land on the dashboard again (not auto-resumed) and the ended room appears in history marked "Archived." Click it — confirm it reopens into `HostView` and the badge would now read "Live" if you revisited the dashboard.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Add host dashboard with room history and reopen flow

Hosts with no live room now land on a dashboard listing every room
they've created (live/archived), instead of being forced straight
into creating a new one. Also fixes stale guest sessions silently
sitting in a dead view after their room went inactive."
```

---

### Task 6: History Access While Hosting (mid-party room switch)

**Files:**
- Modify: `src/App.jsx` (`HostView` header, `App`'s prop-passing to `HostView`)

**Interfaces:**
- Consumes: `HostDashboard` (Task 5), `onOpenRoom`-style callback.
- Produces: `HostView` gains a new required prop `hostUid` and an optional history-switch affordance in its header.

- [ ] **Step 1: Pass `hostUid` into `HostView`**

Find where `App` renders `HostView`:

```js
  if (view === 'host-view' && currentRoom) {
    return (
      <HostView
        roomCode={currentRoom.roomCode}
        guestPin={currentRoom.guestPin}
        onEndRoom={handleEndRoom}
      />
    );
  }
```

Replace with:

```js
  if (view === 'host-view' && currentRoom) {
    return (
      <HostView
        roomCode={currentRoom.roomCode}
        guestPin={currentRoom.guestPin}
        hostUid={hostUid}
        onEndRoom={handleEndRoom}
        onSwitchRoom={(room) => { setCurrentRoom(room); }}
      />
    );
  }
```

- [ ] **Step 2: Add history state and a switch handler inside `HostView`**

Find the `HostView` function signature and its first state declarations:

```js
function HostView({ roomCode, guestPin, onEndRoom }) {
  const [queue, setQueue] = useState([]);
```

Replace with:

```js
function HostView({ roomCode, guestPin, hostUid, onEndRoom, onSwitchRoom }) {
  const [queue, setQueue] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
```

- [ ] **Step 3: Add a switch-room handler**

Add this function inside `HostView`, near `handleEndRoom`:

```js
  const handleSwitchRoom = async (room) => {
    if (room.id === roomCode) { setShowHistory(false); return; }
    if (!window.confirm('Reopening this party will end your current one. Continue?')) return;
    try {
      await updateDoc(doc(db, 'rooms', roomCode), { endedByHost: true });
      await updateDoc(doc(db, 'rooms', room.id), {
        lastActivityAt: serverTimestamp(),
        endedByHost: false,
      });
      sessionStorage.setItem('roomCode', room.id);
      setShowHistory(false);
      onSwitchRoom({ roomCode: room.id, guestPin: room.guestPin, roomName: room.name });
    } catch (err) {
      console.error('Switch room error:', err);
      setToast({ message: 'Failed to switch parties.', type: 'error' });
    }
  };
```

- [ ] **Step 4: Add the History button and render `HostDashboard` in an overlay**

Find the header's button row in `HostView`:

```js
            <div className="flex items-center gap-2">
              <button
                onClick={handleEndRoom}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                End Party
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5 text-white" />
              </button>
            </div>
```

Replace with:

```js
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-600/50 hover:bg-slate-700/30 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                History
              </button>
              <button
                onClick={handleEndRoom}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                End Party
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5 text-white" />
              </button>
            </div>
```

Then, find the closing of `HostView`'s returned JSX (just before the final `{toast && <Toast ... />}` line and the function's closing `);` / `}`):

```js
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
```

Replace with:

```js
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 overflow-y-auto">
          <div className="max-w-lg mx-auto p-4">
            <button
              onClick={() => setShowHistory(false)}
              className="flex items-center gap-2 text-slate-400 hover:text-white my-4 transition-colors text-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to party
            </button>
          </div>
          <HostDashboard
            hostUid={hostUid}
            onCreateNew={() => setShowHistory(false)}
            onOpenRoom={handleSwitchRoom}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
```

- [ ] **Step 5: Manual verification**

While hosting a live party, click "History" — confirm the same dashboard-style list appears in an overlay, current room included and marked "Live." Click a *different* archived room from the list — confirm the confirm dialog appears, and accepting it ends the current room (`endedByHost: true` in Firestore) and switches you into the other one.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Add in-party History access with confirm-before-switch

Hosts can browse their room history without ending the current party,
but switching to a different room still requires confirmation since
only one room can be live per host."
```

---

### Task 7: Guest Display Names

**Files:**
- Modify: `src/App.jsx` (`GuestJoinForm`, `GuestView`)

**Interfaces:**
- Consumes: existing `roles/{uid}` write pattern in `GuestJoinForm`.
- Produces: `roles/{uid}` guest docs now include `name`. `sessionStorage.getItem('guestName')` is readable by any component from this point on.

- [ ] **Step 1: Add a name field to `GuestJoinForm`**

Find the `GuestJoinForm` state declarations:

```js
function GuestJoinForm({ onBack, onSuccess, prefilledCode = '' }) {
  const [roomCode, setRoomCode] = useState(prefilledCode.toUpperCase());
  const [pin, setPin] = useState('');
```

Replace with:

```js
function GuestJoinForm({ onBack, onSuccess, prefilledCode = '' }) {
  const [roomCode, setRoomCode] = useState(prefilledCode.toUpperCase());
  const [guestName, setGuestName] = useState('');
  const [pin, setPin] = useState('');
```

- [ ] **Step 2: Write the name to the role doc and sessionStorage**

Find:

```js
      const uid = auth.currentUser.uid;

      const roleRef = doc(db, 'rooms', code, 'roles', uid);
      const existingRole = await getDoc(roleRef);
      if (!existingRole.exists()) {
        await setDoc(roleRef, { role: 'guest' });
      }

      sessionStorage.setItem('pinVerified', 'true');
      sessionStorage.setItem('userRole', 'guest');
      sessionStorage.setItem('roomCode', code);
```

Replace with:

```js
      const uid = auth.currentUser.uid;
      const trimmedName = guestName.trim();

      const roleRef = doc(db, 'rooms', code, 'roles', uid);
      const existingRole = await getDoc(roleRef);
      if (!existingRole.exists()) {
        await setDoc(roleRef, { role: 'guest', name: trimmedName });
      }

      sessionStorage.setItem('pinVerified', 'true');
      sessionStorage.setItem('userRole', 'guest');
      sessionStorage.setItem('roomCode', code);
      sessionStorage.setItem('guestName', trimmedName);
```

- [ ] **Step 3: Add the input field and validation to the form**

Find the Room Code input block in `GuestJoinForm`'s JSX and add a name field above it:

```js
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-wider mb-2 block">Room Code</label>
```

Replace with:

```js
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-xs uppercase tracking-wider mb-2 block">Your Name</label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Priya"
              maxLength={30}
              required
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="text-slate-400 text-xs uppercase tracking-wider mb-2 block">Room Code</label>
```

- [ ] **Step 4: Require the name field before submit is enabled**

Find the submit button's `disabled` condition:

```js
          <button
            type="submit"
            disabled={loading || roomCode.length !== 6 || pin.length !== 4}
```

Replace with:

```js
          <button
            type="submit"
            disabled={loading || !guestName.trim() || roomCode.length !== 6 || pin.length !== 4}
```

- [ ] **Step 5: Manual verification**

Join a room as a guest — confirm the "Your Name" field is required (submit stays disabled until filled), and after joining, check `rooms/{code}/roles/{uid}` in the Firestore console has `name` set, and `sessionStorage.getItem('guestName')` (via devtools console) returns the entered name.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Add guest display name field to join form

Stored on the guest's role doc and cached in sessionStorage; feeds
song attribution in the next task."
```

---

### Task 8: Song Attribution — `addedByName`

**Files:**
- Modify: `src/App.jsx` (`GuestView.handleAddSong`, `QueueSidebar`, `GuestView`'s "Up Next" list)

**Interfaces:**
- Consumes: `sessionStorage.getItem('guestName')` (Task 7).
- Produces: queue docs added by guests now carry `addedByName`. `QueueSidebar` and `GuestView` display it.

- [ ] **Step 1: Read the guest's name and attach it when adding a song**

Find, inside `GuestView`:

```js
function GuestView({ userId, roomCode }) {
  const [searchQuery, setSearchQuery] = useState('');
```

Replace with:

```js
function GuestView({ userId, roomCode }) {
  const guestName = sessionStorage.getItem('guestName') || 'Guest';
  const [searchQuery, setSearchQuery] = useState('');
```

Then find `handleAddSong`'s `addDoc` call (already modified by Task 4 to include the activity bump):

```js
      await addDoc(collection(db, 'rooms', roomCode, 'queue'), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: userId,
        addedAt: serverTimestamp(),
        status: 'pending',
        upvotes: [],
        isPriority: false,
      });
      await bumpRoomActivity(roomCode);
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
        isPriority: false,
      });
      await bumpRoomActivity(roomCode);
```

- [ ] **Step 2: Add a display helper**

Add this function directly below `formatTime` in the utility functions section:

```js
function attributionLabel(song) {
  if (song.addedByName) return song.addedByName;
  if (song.addedBy === 'host') return 'Host';
  if (song.addedBy === 'host-seed') return 'Playlist import';
  return null;
}
```

- [ ] **Step 3: Show it in `QueueSidebar`'s "Up Next" list**

Find, inside `QueueSidebar`'s `upNext.map`:

```js
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{song.title}</p>
                  <p className="text-slate-400 text-xs truncate">{song.channelTitle}</p>
                </div>
```

Replace with:

```js
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{song.title}</p>
                  <p className="text-slate-400 text-xs truncate">
                    {song.channelTitle}
                    {attributionLabel(song) && <> · Added by {attributionLabel(song)}</>}
                  </p>
                </div>
```

- [ ] **Step 4: Show it in `GuestView`'s "Up Next" list**

Find, inside `GuestView`'s `upNext.map`:

```js
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm">{song.title}</p>
                    <p className="text-slate-400 text-xs truncate">{song.channelTitle}</p>
                  </div>
```

Replace with:

```js
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm">{song.title}</p>
                    <p className="text-slate-400 text-xs truncate">
                      {song.channelTitle}
                      {attributionLabel(song) && <> · Added by {attributionLabel(song)}</>}
                    </p>
                  </div>
```

- [ ] **Step 5: Manual verification**

Join as a guest named "Priya," add a song — confirm "Added by Priya" appears in both the main Up Next list and the sidebar. Add a song from the host side — confirm it shows "Added by Host." Seed a playlist as host — confirm those show "Playlist import."

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "Show who added each song in the queue

Guest-added songs snapshot the guest's display name at add-time;
host-added and playlist-seeded songs fall back to fixed labels."
```

---

### Task 9: Share Button (Web Share API)

**Files:**
- Modify: `src/App.jsx` (`HostView`'s room-info panel)

**Interfaces:**
- Consumes: `roomCode`, room name (needs to be passed into `HostView` — see Step 1), existing `copyToClipboard` helper already defined in `HostView`.
- Produces: a Share button next to the QR code.

- [ ] **Step 1: Pass the room name into `HostView`**

Find where `App` renders `HostView` (already modified in Task 6):

```js
      <HostView
        roomCode={currentRoom.roomCode}
        guestPin={currentRoom.guestPin}
        hostUid={hostUid}
        onEndRoom={handleEndRoom}
        onSwitchRoom={(room) => { setCurrentRoom(room); }}
      />
```

Replace with:

```js
      <HostView
        roomCode={currentRoom.roomCode}
        roomName={currentRoom.roomName}
        guestPin={currentRoom.guestPin}
        hostUid={hostUid}
        onEndRoom={handleEndRoom}
        onSwitchRoom={(room) => { setCurrentRoom(room); }}
      />
```

And update `HostView`'s signature (from Task 6):

```js
function HostView({ roomCode, guestPin, hostUid, onEndRoom, onSwitchRoom }) {
```

to:

```js
function HostView({ roomCode, roomName, guestPin, hostUid, onEndRoom, onSwitchRoom }) {
```

- [ ] **Step 2: Add a share handler**

Add this function inside `HostView`, near `copyToClipboard`:

```js
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/join/${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join "${roomName}" on Party Playlist`, url: shareUrl });
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Share error:', e);
      }
    } else {
      await copyToClipboard(shareUrl, () => setToast({ message: 'Link copied!', type: 'success' }));
    }
  };
```

Note: `copyToClipboard`'s second argument is currently a `setCopied` state setter — here it's called with an inline function instead, which still works since `copyToClipboard` just calls whatever function it's given with `true`.

- [ ] **Step 3: Add the Share button next to the QR code**

Find the QR code block inside `HostView`'s expanded room-info panel:

```js
                <div className="bg-white p-2 rounded-xl flex-shrink-0">
                  <QRCodeSVG value={`${window.location.origin}/join/${roomCode}`} size={128} />
                </div>
                <div className="flex items-center gap-3">
```

Replace with:

```js
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div className="bg-white p-2 rounded-xl">
                    <QRCodeSVG value={`${window.location.origin}/join/${roomCode}`} size={128} />
                  </div>
                  <button
                    onClick={handleShare}
                    className="text-xs text-purple-300 hover:text-purple-200 transition-colors flex items-center gap-1"
                  >
                    Share link
                  </button>
                </div>
                <div className="flex items-center gap-3">
```

- [ ] **Step 4: Manual verification**

On a mobile browser (or desktop Chrome with Web Share API support), click "Share link" — confirm the native share sheet opens with the join URL. On a browser without support, confirm it falls back to copying the link and shows a "Link copied!" toast. Open the shared link — confirm it lands on the Join screen with the room code pre-filled.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "Add Web Share API button for the room join link

Opens the OS share sheet (WhatsApp among other destinations) with a
join link that carries the room code but not the PIN — falls back to
copy-to-clipboard where navigator.share isn't supported."
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (Host Auth) → Task 1. Section 2 (Lifecycle/Archiving) → Tasks 2–4. Section 3 (Dashboard/History) → Tasks 5–6. Section 4 (Share) → Task 9. Section 5 (Guest Names) → Tasks 7–8. Firestore rules changes from Section 1 and the activity-bump requirement in Section 2 are both in Task 2.
- **Deviation from spec, called out explicitly:** the approved spec's Firestore rules snippet only showed the `create` rule change. Writing this plan surfaced that guests need to write `lastActivityAt` on the room doc (Section 2's activity-bump requirement) but the existing `update` rule is host-only — Task 2 adds a narrow `onlyBumpingActivity()` allowance for this, following the same pattern as the existing `onlyUpvoting()` rule. This is a necessary implementation detail of the approved design, not a scope change.
- **Type/signature consistency check:** `isRoomLive(roomData)` used identically in Tasks 3, 5, 6. `HostView` props accumulate correctly across Tasks 6 (`hostUid`, `onSwitchRoom`) and 9 (`roomName`) — final signature is `HostView({ roomCode, roomName, guestPin, hostUid, onEndRoom, onSwitchRoom })`. `onRoomCreated`/`onOpenRoom`/`onSwitchRoom` all pass the same `{ roomCode, guestPin, roomName }` shape consistently.
