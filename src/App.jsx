import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import emailjs from '@emailjs/browser';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  deleteDoc,
  getDocs,
  writeBatch,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import {
  Search,
  Plus,
  Music,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
  SkipForward,
  Users,
  Lock,
  ListPlus,
  Pause,
  SkipBack,
  Trash2,
  Menu,
  ChevronUp,
  ChevronDown,
  X,
  ArrowUpCircle,
  UserPlus,
  LogIn,
  ChevronLeft,
  Shield,
  Copy,
  Check,
  Mail,
  Clock,
  Crown,
  Hash,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBNJGDVck2R1mcUYYWsgzMN-Sr9UVh-x5Q",
  authDomain: "wedding-management-de9b1.firebaseapp.com",
  projectId: "wedding-management-de9b1",
  storageBucket: "wedding-management-de9b1.firebasestorage.app",
  messagingSenderId: "630346302482",
  appId: "1:630346302482:web:d551060fcf6e6b805544cb",
  measurementId: "G-7BBGT56074"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN;
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function attributionLabel(song) {
  if (song.addedByName) return song.addedByName;
  if (song.addedBy === 'host') return 'Host';
  if (song.addedBy === 'host-seed') return 'Playlist import';
  return null;
}

function canAddSong() {
  const now = Date.now();
  const recentAdds = JSON.parse(localStorage.getItem('recentAdds') || '[]');
  return recentAdds.filter((t) => t > now - 60000).length < 5;
}

function recordSongAdd() {
  const now = Date.now();
  const recentAdds = JSON.parse(localStorage.getItem('recentAdds') || '[]');
  const updated = [...recentAdds.filter((t) => t > now - 60000), now];
  localStorage.setItem('recentAdds', JSON.stringify(updated));
}

function generateRoomCode() {
  // Omit 0/O, 1/I/L to avoid confusion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function isRoomLive(roomData) {
  if (!roomData || roomData.endedByHost) return false;
  const last = roomData.lastActivityAt?.toMillis ? roomData.lastActivityAt.toMillis() : 0;
  return (Date.now() - last) < 12 * 60 * 60 * 1000;
}

function bumpRoomActivity(roomCode) {
  return updateDoc(doc(db, 'rooms', roomCode), { lastActivityAt: serverTimestamp() });
}

function clearSession() {
  sessionStorage.removeItem('pinVerified');
  sessionStorage.removeItem('userRole');
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('hostEmail');
  sessionStorage.removeItem('guestName');
}

// ============================================================================
// TOAST COMPONENT
// ============================================================================
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl text-zinc-100 font-medium transition-all duration-300 ${
      type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-zinc-800'
    }`}>
      {type === 'success' ? <CheckCircle className="w-5 h-5" /> : type === 'error' ? <XCircle className="w-5 h-5" /> : null}
      <span>{message}</span>
    </div>
  );
}

// ============================================================================
// LANDING PAGE
// ============================================================================
function LandingPage({ onHostParty, onJoinParty, onRequestAccess, onAdmin }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <div className="w-24 h-24 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Music className="w-12 h-12 text-zinc-100" />
          </div>
          <h1 className="text-4xl font-medium text-zinc-100 mb-2">Party Playlist</h1>
          <p className="text-zinc-400">Shared music for your crew</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={onHostParty}
            className="w-full py-5 bg-indigo-500 text-zinc-100 font-medium text-xl rounded-2xl hover:bg-indigo-400 transition-all duration-300 flex items-center justify-center gap-3"
          >
            <Crown className="w-6 h-6" />
            Host a Party
          </button>

          <button
            onClick={onJoinParty}
            className="w-full py-5 bg-zinc-900 border border-zinc-800 text-zinc-100 font-medium text-xl rounded-2xl hover:bg-zinc-800 transition-all duration-300 flex items-center justify-center gap-3"
          >
            <Music className="w-6 h-6 text-indigo-400" />
            Join a Party
          </button>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={onRequestAccess}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Want to host? Request access →
          </button>
        </div>

        {/* Admin — deliberately subtle */}
        <div className="mt-6 text-center">
          <button onClick={onAdmin} className="text-zinc-900 hover:text-zinc-700 text-xs transition-colors select-none">
            ···
          </button>
        </div>
      </div>
    </div>
  );
}

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
      if (sessionStorage.getItem('userRole') === 'guest') {
        clearSession();
      }
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-800">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 mb-6 transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-zinc-100" />
          </div>
          <h2 className="text-2xl font-medium text-zinc-100 mb-2">Request Host Access</h2>
          <p className="text-zinc-400 text-sm">Sign in with Google to request access. We'll review it and get back to you.</p>
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
          className="w-full py-4 bg-white text-zinc-950 font-medium rounded-2xl disabled:opacity-50 hover:bg-zinc-100 transition-all duration-300 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue with Google'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// REQUEST SENT SCREEN
// ============================================================================
function RequestSentScreen({ onBack }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-green-500/30 text-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-2xl font-medium text-zinc-100 mb-3">Request Sent!</h2>
        <p className="text-zinc-400 mb-8">
          Your request has been submitted. You'll hear back once it's reviewed. Come back to "Host a Party" once approved.
        </p>
        <button
          onClick={onBack}
          className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium rounded-2xl transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

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
      if (sessionStorage.getItem('userRole') === 'guest') {
        clearSession();
      }
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-800">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 mb-6 transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-8 h-8 text-zinc-100" />
          </div>
          <h2 className="text-2xl font-medium text-zinc-100 mb-2">Host Login</h2>
          <p className="text-zinc-400 text-sm">Sign in with the Google account you requested access with.</p>
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
          className="w-full py-4 bg-white text-zinc-950 font-medium rounded-2xl disabled:opacity-50 hover:bg-zinc-100 transition-all duration-300 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue with Google'}
        </button>

        <p className="text-center text-zinc-700 text-xs mt-6">
          Don't have access?{' '}
          <button onClick={onBack} className="text-indigo-400 hover:text-indigo-300">
            Request it
          </button>
        </p>
      </div>
    </div>
  );
}

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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-800">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hash className="w-8 h-8 text-zinc-100" />
          </div>
          <h2 className="text-2xl font-medium text-zinc-100 mb-2">Start a New Party</h2>
          <p className="text-zinc-400 text-sm">Give it a name and pick a 4-digit PIN your guests will use to join.</p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="e.g. Friday Night Sessions"
            maxLength={60}
            className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={guestPin}
            onChange={(e) => setGuestPin(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 4729"
            className="w-full text-center text-4xl tracking-[0.5em] py-4 bg-zinc-800/50 border border-zinc-700 rounded-2xl text-zinc-100 placeholder:text-zinc-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="w-full py-4 bg-indigo-500 text-zinc-100 font-medium rounded-2xl disabled:opacity-50 hover:bg-indigo-400 transition-all duration-300"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Start Party 🎉'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GUEST JOIN FORM
// ============================================================================
function GuestJoinForm({ onBack, onSuccess, prefilledCode = '' }) {
  const [roomCode, setRoomCode] = useState(prefilledCode.toUpperCase());
  const [guestName, setGuestName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const code = roomCode.toUpperCase().trim();

    try {
      if (sessionStorage.getItem('userRole') === 'host') {
        clearSession();
      }

      // Auth required before any Firestore read
      await signInAnonymously(auth);

      const roomRef = doc(db, 'rooms', code);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists()) {
        setError('Room not found. Check the code and try again.');
        setLoading(false);
        return;
      }

      const roomData = roomDoc.data();

      if (!isRoomLive(roomData)) {
        setError('This room has expired. Ask your host to start a new one.');
        setLoading(false);
        return;
      }

      if (roomData.guestPin !== pin) {
        setError('Wrong PIN. Ask your host for the correct one.');
        setLoading(false);
        return;
      }

      const uid = auth.currentUser.uid;
      const trimmedName = guestName.trim() || 'Guest';

      const roleRef = doc(db, 'rooms', code, 'roles', uid);
      const existingRole = await getDoc(roleRef);
      if (!existingRole.exists()) {
        await setDoc(roleRef, { role: 'guest', name: trimmedName });
      }

      sessionStorage.setItem('pinVerified', 'true');
      sessionStorage.setItem('userRole', 'guest');
      sessionStorage.setItem('roomCode', code);
      sessionStorage.setItem('guestName', trimmedName);

      onSuccess(uid, code);
    } catch (err) {
      console.error('Guest join error:', err);
      setError('Failed to join. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-800">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 mb-6 transition-colors text-sm">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Music className="w-8 h-8 text-zinc-100" />
          </div>
          <h2 className="text-2xl font-medium text-zinc-100 mb-2">Join a Party</h2>
          <p className="text-zinc-400 text-sm">Ask your host for the room code and PIN.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wider mb-2 block">Room Code</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="e.g. XK29TM"
              maxLength={6}
              required
              className="w-full text-center text-2xl tracking-widest py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wider mb-2 block">Guest PIN</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="4-digit PIN"
              required
              className="w-full text-center text-3xl tracking-[0.5em] py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs uppercase tracking-wider mb-2 block">Your Name <span className="normal-case text-zinc-600">(optional)</span></label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Priya"
              maxLength={30}
              className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl p-3 border border-red-500/20">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || roomCode.length !== 6 || pin.length !== 4}
            className="w-full py-4 bg-indigo-500 text-zinc-100 font-medium rounded-2xl disabled:opacity-50 hover:bg-indigo-400 transition-all duration-300"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Join Party'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN PANEL
// ============================================================================
function AdminFlow({ onBack }) {
  const [adminView, setAdminView] = useState('login');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState(null);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setAdminView('panel');
      loadRequests();
    } else {
      setError('Wrong PIN.');
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'hostRequests'));
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      reqs.sort((a, b) => {
        const ta = a.requestedAt?.toMillis ? a.requestedAt.toMillis() : 0;
        const tb = b.requestedAt?.toMillis ? b.requestedAt.toMillis() : 0;
        return tb - ta;
      });
      setRequests(reqs);
    } catch (err) {
      console.error('Load requests error:', err);
    }
    setLoading(false);
  };

  const handleApprove = async (req) => {
    setActionLoading(req.id);
    try {
      await updateDoc(doc(db, 'hostRequests', req.id), { status: 'approved' });
      await setDoc(doc(db, 'approvedHosts', req.id), {
        name: req.name,
        email: req.email,
        approvedAt: serverTimestamp(),
      });
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'approved' } : r));
      setToast({ message: `${req.name} approved!`, type: 'success' });
    } catch (e) {
      console.error('Approve error:', e);
      setToast({ message: 'Failed to approve.', type: 'error' });
    }
    setActionLoading('');
  };

  const handleDeny = async (req) => {
    setActionLoading(req.id + '-deny');
    try {
      await updateDoc(doc(db, 'hostRequests', req.id), { status: 'denied' });
      // Remove from approvedHosts if previously approved
      try { await deleteDoc(doc(db, 'approvedHosts', req.id)); } catch (e) { void e; }
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'denied' } : r));
      setToast({ message: `${req.name} denied.`, type: 'error' });
    } catch (e) {
      console.error('Deny error:', e);
      setToast({ message: 'Failed to deny.', type: 'error' });
    }
    setActionLoading('');
  };

  if (adminView === 'login') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-700/30">
          <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 mb-6 transition-colors text-sm">
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-zinc-300" />
            </div>
            <h2 className="text-2xl font-medium text-zinc-100 mb-2">Admin</h2>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Admin PIN"
              className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={!pin}
              className="w-full py-4 bg-zinc-700 hover:bg-zinc-500 text-zinc-100 font-medium rounded-2xl disabled:opacity-50 transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const others = requests.filter((r) => r.status !== 'pending');

  const statusBadge = (status) => {
    if (status === 'approved') return <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">Approved</span>;
    if (status === 'denied') return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">Denied</span>;
    return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full border border-yellow-500/30">Pending</span>;
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-950/80 border-b border-zinc-800/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-zinc-400" />
            <h1 className="text-xl font-medium text-zinc-100">Admin Panel</h1>
          </div>
          <button
            onClick={loadRequests}
            className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <>
            <h2 className="text-zinc-100 font-semibold mb-4">
              Pending Requests
              {pending.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">{pending.length}</span>
              )}
            </h2>

            {pending.length === 0 ? (
              <p className="text-zinc-500 text-sm italic mb-8">No pending requests.</p>
            ) : (
              <div className="space-y-3 mb-8">
                {pending.map((req) => (
                  <div key={req.id} className="bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800/50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-zinc-100 font-medium">{req.name}</p>
                        <p className="text-zinc-400 text-sm">{req.email}</p>
                        <p className="text-zinc-700 text-xs mt-1">
                          {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={!!actionLoading}
                          className="px-3 py-2 bg-green-600 hover:bg-green-500 text-zinc-100 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeny(req)}
                          disabled={!!actionLoading}
                          className="px-3 py-2 bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-red-300 text-sm font-semibold rounded-xl border border-red-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {actionLoading === req.id + '-deny' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          Deny
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {others.length > 0 && (
              <>
                <h2 className="text-zinc-400 font-semibold text-sm uppercase tracking-wider mb-4">Previous</h2>
                <div className="space-y-2">
                  {others.map((req) => (
                    <div key={req.id} className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800/30 flex items-center justify-between">
                      <div>
                        <p className="text-zinc-300 text-sm font-medium">{req.name}</p>
                        <p className="text-zinc-500 text-xs">{req.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(req.status)}
                        {req.status === 'denied' && (
                          <button
                            onClick={() => handleApprove(req)}
                            disabled={!!actionLoading}
                            className="px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 text-xs rounded-lg transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {req.status === 'approved' && (
                          <button
                            onClick={() => handleDeny(req)}
                            disabled={!!actionLoading}
                            className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg transition-colors disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ============================================================================
// QUEUE SIDEBAR COMPONENT
// ============================================================================
function QueueSidebar({
  showSidebar,
  setShowSidebar,
  queue,
  handlePlayNext,
  handleDeleteSong,
  handleRestoreSong,
  isHost,
  userId,
  handleUpvote,
}) {
  const upNext = queue.filter((s) => s.status === 'pending');
  const playedHistory = queue.filter((s) => s.status === 'played');

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

                {isHost ? (
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handlePlayNext(song)}
                      className={`p-1.5 hover:bg-zinc-800 rounded-full transition-colors ${song.isPriority ? 'text-green-400' : 'text-blue-400 hover:text-blue-300'}`}
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
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleUpvote(song)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full transition-colors ${song.upvotes?.includes(userId) ? 'bg-indigo-500 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'}`}
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">{song.upvotes?.length || 0}</span>
                    </button>
                  </div>
                )}
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
                  {isHost && handleRestoreSong && (
                    <button
                      onClick={() => handleRestoreSong(song)}
                      className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-green-400 transition-colors flex-shrink-0"
                      title="Add back to queue"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ============================================================================
// GUEST VIEW COMPONENT
// ============================================================================
function GuestView({ userId, roomCode }) {
  const guestName = sessionStorage.getItem('guestName') || 'Guest';
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [queue, setQueue] = useState([]);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'rooms', roomCode, 'queue'),
      where('status', 'in', ['pending', 'playing', 'played'])
    );

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

    return () => unsubscribe();
  }, [roomCode]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoCategoryId=10&maxResults=10&key=${YOUTUBE_API_KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      if (!searchData.items || searchData.items.length === 0) {
        setSearchResults([]);
        setLoading(false);
        return;
      }

      const videoIds = searchData.items.map((item) => item.id.videoId).join(',');
      const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();

      const filteredResults = detailsData.items
        .filter((video) => parseDuration(video.contentDetails.duration) <= 480)
        .map((video) => ({
          videoId: video.id,
          title: video.snippet.title,
          channelTitle: video.snippet.channelTitle,
          thumbnailUrl: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
          duration: parseDuration(video.contentDetails.duration),
        }));

      setSearchResults(filteredResults);
    } catch (err) {
      console.error('Search error:', err);
      setToast({ message: 'Search failed. Please try again.', type: 'error' });
    }
    setLoading(false);
  };

  const handleAddSong = async (song) => {
    if (!canAddSong()) {
      setToast({ message: 'Slow down! Max 5 songs per minute.', type: 'error' });
      return;
    }
    const isDuplicate = queue.some((s) => s.videoId === song.videoId && s.status !== 'played');
    if (isDuplicate) {
      setToast({ message: 'Song already in the queue!', type: 'error' });
      return;
    }
    try {
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
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
      recordSongAdd();
      setToast({ message: 'Song added to queue!', type: 'success' });
      setSearchResults((prev) => prev.filter((s) => s.videoId !== song.videoId));
    } catch (err) {
      console.error('Add song error:', err);
      setToast({ message: 'Failed to add song.', type: 'error' });
    }
  };

  const handleUpvote = async (song) => {
    try {
      const songRef = doc(db, 'rooms', roomCode, 'queue', song.id);
      const isVoted = song.upvotes?.includes(userId);
      await updateDoc(songRef, {
        upvotes: isVoted ? arrayRemove(userId) : arrayUnion(userId),
      });
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
    } catch (err) {
      console.error('Upvote error:', err);
      setToast({ message: 'Failed to update vote', type: 'error' });
    }
  };

  const nowPlaying = queue.find((s) => s.status === 'playing');
  const upNext = queue.filter((s) => s.status === 'pending');

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-40 bg-zinc-950/90 border-b border-zinc-800/50 px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center">
              <Music className="w-5 h-5 text-zinc-100" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-zinc-100">Party Playlist</h1>
              <p className="text-zinc-500 text-xs font-mono">{roomCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-sm hidden sm:inline">{queue.length} in queue</span>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-zinc-100" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-32">
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a song..."
              className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !searchQuery.trim()}
            className="w-full mt-3 py-4 bg-indigo-500 text-zinc-100 font-medium rounded-2xl disabled:opacity-50 hover:bg-indigo-400 transition-all duration-300"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Search'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-100">Search Results</h2>
              <button
                onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="space-y-3">
              {searchResults.map((song) => (
                <div key={song.videoId} className="flex items-center gap-4 bg-zinc-900/80 rounded-2xl p-3 border border-zinc-800/50">
                  <img src={song.thumbnailUrl} alt={song.title} className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-100 font-medium truncate">{song.title}</p>
                    <p className="text-zinc-400 text-sm truncate">{song.channelTitle}</p>
                    <p className="text-zinc-500 text-xs">{formatTime(song.duration)}</p>
                  </div>
                  <button
                    onClick={() => handleAddSong(song)}
                    className="flex-shrink-0 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center transition-transform"
                  >
                    <Plus className="w-6 h-6 text-zinc-100" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {nowPlaying && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-green-400" />
              Now Playing
            </h2>
            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <div className="flex items-center gap-4">
                <img src={nowPlaying.thumbnailUrl} alt={nowPlaying.title} className="w-20 h-20 rounded-2xl object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-100 font-medium text-lg truncate">{nowPlaying.title}</p>
                  <p className="text-indigo-300 text-sm truncate">{nowPlaying.channelTitle}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {upNext.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
              <SkipForward className="w-5 h-5 text-zinc-400" />
              Up Next ({upNext.length})
            </h2>
            <div className="space-y-3">
              {upNext.map((song, index) => (
                <div key={song.id} className="flex items-center gap-4 bg-zinc-900/60 rounded-2xl p-3 border border-zinc-800/30">
                  <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-medium text-sm">{index + 1}</div>
                  <img src={song.thumbnailUrl} alt={song.title} className="w-12 h-12 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-100 font-medium truncate text-sm">{song.title}</p>
                    <p className="text-zinc-400 text-xs truncate">
                      {song.channelTitle}
                      {attributionLabel(song) && <> · Added by {attributionLabel(song)}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!nowPlaying && upNext.length === 0 && searchResults.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
              <Music className="w-12 h-12 text-zinc-700" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100 mb-2">Queue is empty</h3>
            <p className="text-zinc-400">Search for a song to get the party started!</p>
          </div>
        )}
      </main>

      <QueueSidebar
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        queue={queue}
        isHost={false}
        userId={userId}
        handleUpvote={handleUpvote}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ============================================================================
// HOST VIEW COMPONENT
// ============================================================================
function HostView({ roomCode, roomName, guestPin, hostUid, onEndRoom, onSwitchRoom }) {
  const [queue, setQueue] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const queueRef = useRef([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerInstanceReady, setPlayerInstanceReady] = useState(false);
  const [playlistId, setPlaylistId] = useState('');
  const [seedingPlaylist, setSeedingPlaylist] = useState(false);
  const [toast, setToast] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueTab, setQueueTab] = useState('upNext');
  const [pinCopied, setPinCopied] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const isInitialLoad = useRef(true);
  const transitionTriggeredRef = useRef(false);

  useEffect(() => {
    transitionTriggeredRef.current = false;
  }, [currentSong]);

  const roomQueueRef = () => collection(db, 'rooms', roomCode, 'queue');
  const roomDocRef = (id) => doc(db, 'rooms', roomCode, 'queue', id);

  const handleClearPlaylist = async () => {
    if (!window.confirm('Are you sure you want to clear the entire playlist?')) return;
    try {
      const snapshot = await getDocs(roomQueueRef());
      const deletions = snapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletions);
      setToast({ message: 'Playlist cleared!', type: 'success' });
      if (playerRef.current?.stopVideo) playerRef.current.stopVideo();
      setCurrentSong(null);
      setProgress(0);
      setDuration(0);
      setIsPlaying(false);
    } catch (err) {
      console.error('Clear playlist error:', err);
      setToast({ message: 'Failed to clear playlist.', type: 'error' });
    }
  };

  const handleSeedPlaylist = async () => {
    if (!playlistId.trim()) return;
    setSeedingPlaylist(true);
    try {
      let extractedId = playlistId.trim();
      const urlMatch = playlistId.match(/[?&]list=([^&]+)/);
      if (urlMatch) extractedId = urlMatch[1];

      let allCount = 0;
      let nextPageToken = '';

      do {
        const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${extractedId}&maxResults=50&pageToken=${nextPageToken}&key=${YOUTUBE_API_KEY}`;
        const playlistRes = await fetch(playlistUrl);
        const playlistData = await playlistRes.json();

        if (playlistData.error) throw new Error(playlistData.error.message || 'Failed to fetch playlist');
        if (!playlistData.items?.length) break;

        const videoIds = playlistData.items.map((item) => item.snippet.resourceId?.videoId).filter(Boolean).join(',');
        const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`);
        const detailsData = await detailsRes.json();

        const durationMap = new Map();
        detailsData.items.forEach((item) => durationMap.set(item.id, parseDuration(item.contentDetails.duration)));

        const validVideos = playlistData.items
          .map((item) => {
            const videoId = item.snippet.resourceId?.videoId;
            const dur = durationMap.get(videoId);
            if (dur === undefined || dur > 480) return null;
            return {
              videoId,
              title: item.snippet.title,
              thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
              channelTitle: item.snippet.channelTitle,
            };
          })
          .filter(Boolean);

        for (const video of validVideos) {
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
          allCount++;
        }

        nextPageToken = playlistData.nextPageToken;
      } while (nextPageToken);

      setToast({ message: allCount > 0 ? `Added ${allCount} songs!` : 'No valid videos found.', type: allCount > 0 ? 'success' : 'error' });
      setPlaylistId('');
    } catch (err) {
      console.error('Seed playlist error:', err);
      setToast({ message: `Failed to import: ${err.message}`, type: 'error' });
    }
    setSeedingPlaylist(false);
  };

  useEffect(() => {
    if (window.YT) { setPlayerReady(true); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.getElementsByTagName('script')[0].parentNode.insertBefore(tag, document.getElementsByTagName('script')[0]);
    window.onYouTubeIframeAPIReady = () => setPlayerReady(true);
  }, []);

  const handleSongEnded = useCallback(async () => {
    if (!currentSong) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'rooms', roomCode, 'queue', currentSong.id), { status: 'played' });
    const nextSong = queueRef.current.filter((s) => s.status === 'pending')[0];
    if (nextSong) {
      batch.update(doc(db, 'rooms', roomCode, 'queue', nextSong.id), { status: 'playing' });
    } else {
      setCurrentSong(null);
    }
    await batch.commit();
    bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
    if (!nextSong) { setProgress(0); setDuration(0); }
  }, [currentSong, roomCode]);

  const onStateChangeRef = useRef(null);

  const handlePlayerStateChange = useCallback((event) => {
    if (event.data === 0) handleSongEnded();
    setIsPlaying(event.data === 1);
  }, [handleSongEnded]);

  useEffect(() => { onStateChangeRef.current = handlePlayerStateChange; }, [handlePlayerStateChange]);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let wakeLock = null;
    const acquire = async () => {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { void e; }
    };
    const release = () => { if (wakeLock) { wakeLock.release(); wakeLock = null; } };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) acquire();
    };
    if (isPlaying) {
      acquire();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      release();
    }
    return () => { release(); document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.channelTitle || 'Party Playlist',
      artwork: currentSong.thumbnailUrl ? [{ src: currentSong.thumbnailUrl, sizes: '480x360', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo());
    navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo());
    navigator.mediaSession.setActionHandler('nexttrack', () => handleSongEnded());
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [currentSong, handleSongEnded]);

  useEffect(() => {
    if (!playerReady || playerRef.current) return;
    playerRef.current = new window.YT.Player('youtube-player', {
      height: '1', width: '1',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0 },
      events: {
        onStateChange: (event) => { if (onStateChangeRef.current) onStateChangeRef.current(event); },
        onReady: () => setPlayerInstanceReady(true),
      },
    });
    return () => {
      if (playerRef.current?.destroy) playerRef.current.destroy();
      playerRef.current = null;
      setPlayerInstanceReady(false);
    };
  }, [playerReady]);

  useEffect(() => {
    if (!playerInstanceReady || !playerRef.current || !currentSong) return;
    if (playerRef.current.getVideoData) {
      const vd = playerRef.current.getVideoData();
      if (vd?.video_id === currentSong.videoId) {
        if (playerRef.current.getPlayerState?.() !== 1) playerRef.current.playVideo();
        return;
      }
    }
    if (isInitialLoad.current) {
      let startSeconds = 0;
      try {
        const saved = localStorage.getItem('party_playlist_progress');
        if (saved) {
          const { videoId, timestamp, savedAt } = JSON.parse(saved);
          if (videoId === currentSong.videoId && (Date.now() - savedAt < 24 * 60 * 60 * 1000)) startSeconds = timestamp;
        }
      } catch (e) { void e; }
      playerRef.current.cueVideoById?.({ videoId: currentSong.videoId, startSeconds, suggestedQuality: 'default' });
      isInitialLoad.current = false;
    } else {
      playerRef.current.loadVideoById?.({ videoId: currentSong.videoId, startSeconds: 0, suggestedQuality: 'default' });
    }
  }, [currentSong, playerInstanceReady]);

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

  useEffect(() => {
    if (!playerRef.current) return;
    const interval = setInterval(() => {
      if (playerRef.current?.getCurrentTime && playerRef.current?.getDuration) {
        try {
          const current = playerRef.current.getCurrentTime();
          const total = playerRef.current.getDuration();
          if (total > 0) {
            setProgress(current);
            setDuration(total);
            if (currentSong) {
              localStorage.setItem('party_playlist_progress', JSON.stringify({ videoId: currentSong.videoId, timestamp: current, savedAt: Date.now() }));
            }
            if (total - current < 2 && !transitionTriggeredRef.current && isPlaying) {
              transitionTriggeredRef.current = true;
              handleSongEnded();
            }
          }
        } catch (e) { void e; }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [playerReady, isPlaying, currentSong, handleSongEnded]);

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setProgress(time);
    if (playerRef.current?.seekTo) playerRef.current.seekTo(time, true);
  };

  const handleSkip = async () => {
    if (!currentSong) return;
    playerRef.current?.stopVideo?.();
    const batch = writeBatch(db);
    batch.update(roomDocRef(currentSong.id), { status: 'played' });
    const nextSong = queue.filter((s) => s.status === 'pending')[0];
    if (nextSong) {
      batch.update(roomDocRef(nextSong.id), { status: 'playing' });
    } else {
      setCurrentSong(null);
    }
    await batch.commit();
    bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
    setProgress(0);
    setDuration(0);
  };

  const handlePrevious = async () => {
    if (playerRef.current?.getCurrentTime) {
      const currentTime = playerRef.current.getCurrentTime();
      if (currentTime > 10) { playerRef.current.seekTo(0); return; }
    }
    const playedSongs = queue.filter((s) => s.status === 'played');
    if (playedSongs.length === 0) return;
    const lastPlayed = playedSongs[playedSongs.length - 1];
    if (currentSong) await updateDoc(roomDocRef(currentSong.id), { status: 'pending' });
    await updateDoc(roomDocRef(lastPlayed.id), { status: 'playing' });
    bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
  };

  const handleDeleteSong = async (songId) => {
    if (!window.confirm('Delete this song from queue?')) return;
    try {
      await deleteDoc(roomDocRef(songId));
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
      setToast({ message: 'Song removed from queue', type: 'success' });
    } catch (e) {
      console.error('Delete song error:', e);
      setToast({ message: 'Failed to delete song', type: 'error' });
    }
  };

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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoCategoryId=10&maxResults=10&key=${YOUTUBE_API_KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      if (!searchData.items?.length) { setSearchResults([]); setSearchLoading(false); return; }

      const videoIds = searchData.items.map((item) => item.id.videoId).join(',');
      const detailsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`);
      const detailsData = await detailsRes.json();

      setSearchResults(
        detailsData.items
          .filter((v) => parseDuration(v.contentDetails.duration) <= 480)
          .map((v) => ({
            videoId: v.id,
            title: v.snippet.title,
            channelTitle: v.snippet.channelTitle,
            thumbnailUrl: v.snippet.thumbnails.medium?.url || v.snippet.thumbnails.default?.url,
            duration: parseDuration(v.contentDetails.duration),
          }))
      );
    } catch (e) {
      console.error('Host search error:', e);
      setToast({ message: 'Search failed.', type: 'error' });
    }
    setSearchLoading(false);
  };

  const handleAddSong = async (song) => {
    const isDuplicate = queue.some((s) => s.videoId === song.videoId && s.status !== 'played');
    if (isDuplicate) { setToast({ message: 'Song already in the queue!', type: 'error' }); return; }
    try {
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
      bumpRoomActivity(roomCode).catch((e) => console.error('Activity bump failed:', e));
      setToast({ message: 'Song added!', type: 'success' });
      setSearchResults((prev) => prev.filter((s) => s.videoId !== song.videoId));
    } catch (e) {
      console.error('Host add song error:', e);
      setToast({ message: 'Failed to add song.', type: 'error' });
    }
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playerRef.current.getPlayerState() === 1) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const copyToClipboard = async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { void e; }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/join/${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join "${roomName || roomCode}" on Party Playlist`, url: shareUrl });
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Share error:', e);
      }
    } else {
      await copyToClipboard(shareUrl, () => setToast({ message: 'Link copied!', type: 'success' }));
    }
  };

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

  const handleSwitchRoom = async (room) => {
    if (room.roomCode === roomCode) { setShowHistory(false); return; }
    if (!window.confirm('Reopening this party will end your current one. Continue?')) return;
    try {
      await updateDoc(doc(db, 'rooms', roomCode), { endedByHost: true });
      await updateDoc(doc(db, 'rooms', room.roomCode), {
        lastActivityAt: serverTimestamp(),
        endedByHost: false,
      });
      sessionStorage.setItem('roomCode', room.roomCode);
      setShowHistory(false);
      onSwitchRoom({ roomCode: room.roomCode, guestPin: room.guestPin, roomName: room.roomName });
    } catch (err) {
      console.error('Switch room error:', err);
      setToast({ message: 'Failed to switch parties.', type: 'error' });
    }
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const upNext = queue.filter((s) => s.status === 'pending');
  const playedHistory = queue.filter((s) => s.status === 'played').slice().reverse();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <div className="absolute" style={{ width: 1, height: 1, overflow: 'hidden' }}>
        <div id="youtube-player" ref={playerContainerRef}></div>
      </div>

      {/* Header */}
      <header className="bg-zinc-950/80 border-b border-zinc-800/50 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center">
                <Crown className="w-5 h-5 text-zinc-100" />
              </div>
              <div>
                <h1 className="text-xl font-medium text-zinc-100">Party Playlist</h1>
                <p className="text-zinc-400 text-xs">Host View</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700/50 hover:bg-zinc-800/30 rounded-lg transition-colors flex items-center gap-1.5"
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
            </div>
          </div>

          {/* Room info row — guests join using these */}
          {panelExpanded ? (
            <div className="bg-zinc-900/80 rounded-2xl px-4 py-3 border border-zinc-800/40">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div className="bg-white p-2 rounded-xl">
                    <QRCodeSVG value={`${window.location.origin}/join/${roomCode}`} size={128} />
                  </div>
                  <button
                    onClick={handleShare}
                    className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors flex items-center gap-1"
                  >
                    Share link
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider mb-0.5">Guest PIN</p>
                    <p className="text-zinc-100 font-mono font-medium text-lg tracking-widest">{guestPin}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(guestPin, setPinCopied)}
                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
                    title="Copy guest PIN"
                  >
                    {pinCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setPanelExpanded(false)}
                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
                    title="Collapse"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-zinc-500 text-xs text-center mt-2">Scan to join — guests still need the PIN</p>
            </div>
          ) : (
            <div className="bg-zinc-900/80 rounded-2xl px-4 py-2.5 border border-zinc-800/40 flex items-center justify-between">
              <p className="text-zinc-400 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white inline-block" />
                Guests can join with PIN <span className="font-mono font-medium text-indigo-400">{guestPin}</span>
              </p>
              <button
                onClick={() => setPanelExpanded(true)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
                title="Expand"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search — always visible */}
          <form onSubmit={handleSearch} className="flex gap-2 mt-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search and add a song..."
                className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="px-4 py-2.5 bg-indigo-500 text-zinc-100 font-semibold rounded-xl disabled:opacity-50 hover:bg-indigo-400 transition-all text-sm flex items-center gap-1.5"
            >
              {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className={`px-3 py-2.5 rounded-xl transition-all border text-sm flex items-center gap-1.5 ${showImport ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100'}`}
              title="Import playlist"
            >
              <ListPlus className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearPlaylist}
              type="button"
              className="px-3 py-2.5 bg-zinc-900 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 rounded-xl transition-all border border-zinc-800 hover:border-red-500/30"
              title="Clear Playlist"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </form>

          {/* Import playlist — expandable */}
          {showImport && (
            <div className="flex gap-2 mt-2">
              <div className="flex-1 relative">
                <ListPlus className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  placeholder="Paste YouTube Playlist ID or URL..."
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <button
                onClick={async () => { await handleSeedPlaylist(); setShowImport(false); }}
                disabled={seedingPlaylist || !playlistId.trim()}
                className="px-4 py-2.5 bg-indigo-500 text-zinc-100 font-semibold rounded-xl disabled:opacity-50 hover:bg-indigo-400 transition-all text-sm flex items-center gap-1.5"
              >
                {seedingPlaylist ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                Import
              </button>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-3 py-2.5 bg-zinc-900 text-zinc-400 hover:text-zinc-100 rounded-xl border border-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-4">
        <div className="max-w-2xl mx-auto">
          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-zinc-400">Search Results</h2>
                <button
                  onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                  className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((song) => (
                  <div key={song.videoId} className="flex items-center gap-3 bg-zinc-900/80 rounded-xl p-2 border border-zinc-800/50">
                    <img src={song.thumbnailUrl} alt={song.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-100 text-sm font-medium truncate">{song.title}</p>
                      <p className="text-zinc-400 text-xs truncate">{song.channelTitle} · {formatTime(song.duration)}</p>
                    </div>
                    <button
                      onClick={() => handleAddSong(song)}
                      className="flex-shrink-0 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center transition-transform"
                    >
                      <Plus className="w-5 h-5 text-zinc-100" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Up Next / Played tabs */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setQueueTab('upNext')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${queueTab === 'upNext' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Up Next ({upNext.length})
            </button>
            <button
              onClick={() => setQueueTab('played')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${queueTab === 'played' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Played ({playedHistory.length})
            </button>
          </div>

          {queueTab === 'upNext' ? (
            upNext.length === 0 ? (
              <div className="text-center py-16">
                <h2 className="text-lg font-medium text-zinc-100 mb-2">Queue is empty</h2>
                <p className="text-zinc-400 text-sm">Search above to add the first song</p>
              </div>
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
                  </div>
                ))}
              </div>
            )
          ) : (
            playedHistory.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-zinc-500 text-sm">No songs played yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {playedHistory.map((song) => (
                  <div key={song.id} className="flex items-center gap-3 bg-zinc-900/30 rounded-xl p-2">
                    <img src={song.thumbnailUrl} alt={song.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 grayscale" />
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-400 text-sm font-medium truncate">{song.title}</p>
                      <p className="text-zinc-600 text-xs truncate">
                        {attributionLabel(song) && <>Added by {attributionLabel(song)}</>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestoreSong(song)}
                      className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-emerald-400 transition-colors flex-shrink-0"
                      title="Add back to queue"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      {/* Persistent player bar */}
      {currentSong && (
        <div className="border-t border-zinc-800/50 bg-zinc-950/95 px-4 py-2.5">
          <div className="max-w-2xl mx-auto">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={progress}
              onChange={handleSeek}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer mb-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-100 [&::-webkit-slider-thumb]:rounded-full"
              style={{ background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${progressPercent}%, #27272a ${progressPercent}%, #27272a 100%)` }}
            />
            <div className="flex items-center gap-3">
              <img
                src={currentSong.thumbnailUrl}
                alt={currentSong.title}
                className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-zinc-100 text-sm font-medium truncate">{currentSong.title}</p>
                <p className="text-zinc-500 text-xs truncate">{currentSong.channelTitle}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button onClick={handlePrevious} className="text-zinc-400 hover:text-zinc-100 transition-colors" title="Previous">
                  <SkipBack className="w-5 h-5" />
                </button>
                <button onClick={togglePlay} className="w-9 h-9 bg-zinc-100 hover:bg-white text-zinc-950 rounded-full flex items-center justify-center transition-colors" title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-0.5" />}
                </button>
                <button onClick={handleSkip} className="text-zinc-400 hover:text-zinc-100 transition-colors" title="Skip">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 overflow-y-auto">
          <div className="max-w-lg mx-auto p-4">
            <button
              onClick={() => setShowHistory(false)}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 my-4 transition-colors text-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to party
            </button>
          </div>
          <HostDashboard
            hostUid={hostUid}
            onCreateNew={handleEndRoom}
            onOpenRoom={handleSwitchRoom}
          />
        </div>
      )}
    </div>
  );
}

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

  const handleReopen = (room) => {
    onOpenRoom({ roomCode: room.id, guestPin: room.guestPin, roomName: room.name });
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="max-w-lg mx-auto py-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-10 h-10 text-zinc-100" />
          </div>
          <h1 className="text-2xl font-medium text-zinc-100">Welcome back</h1>
        </div>

        <button
          onClick={onCreateNew}
          className="w-full py-5 mb-8 bg-indigo-500 text-zinc-100 font-medium text-xl rounded-2xl hover:bg-indigo-400 transition-all duration-300 flex items-center justify-center gap-3"
        >
          <Music className="w-6 h-6" />
          Start New Party
        </button>

        <h2 className="text-zinc-400 font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          History
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-zinc-500 text-sm italic">No past parties yet.</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => {
              const live = isRoomLive(room);
              return (
                <button
                  key={room.id}
                  onClick={() => handleReopen(room)}
                  className="w-full text-left bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800/50 hover:border-indigo-500/30 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-zinc-100 font-medium truncate">{room.name || room.id}</p>
                    <p className="text-zinc-500 text-xs font-mono mt-0.5">{room.id}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border flex-shrink-0 ${live ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50'}`}>
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

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
function App() {
  const initialPath = window.location.pathname;
  const initialJoinMatch = initialPath.match(/^\/join\/([A-Z0-9]+)$/i);

  const [view, setView] = useState(() => {
    if (initialPath === '/admin') return 'admin';
    return 'loading';
  });
  const [userId, setUserId] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null); // { roomCode, guestPin? }
  const [hostUid, setHostUid] = useState(null);
  const [hostEmail, setHostEmail] = useState('');
  const [prefilledCode] = useState(() => initialJoinMatch ? initialJoinMatch[1].toUpperCase() : '');

  useEffect(() => {
    if (view === 'admin') return;

    const pinVerified = sessionStorage.getItem('pinVerified');
    const userRole = sessionStorage.getItem('userRole');
    const savedRoomCode = sessionStorage.getItem('roomCode');

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && pinVerified) {
        setUserId(user.uid);

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
      } else {
        setView(prefilledCode ? 'guest-join' : 'landing');
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHostLogin = async (uid, email) => {
    setHostUid(uid);
    setHostEmail(email);
    setUserId(uid);

    // Check for existing live room
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

  const handleRoomCreated = (room) => {
    setCurrentRoom(room);
    setView('host-view');
  };

  const handleGuestJoined = (uid, roomCode) => {
    setUserId(uid);
    setCurrentRoom({ roomCode });
    setView('guest-view');
  };

  const handleEndRoom = () => {
    setCurrentRoom(null);
    setHostUid(null);
    setHostEmail('');
    setView('landing');
  };

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (view === 'admin') {
    return <AdminFlow onBack={() => setView('landing')} />;
  }

  if (view === 'landing') {
    return (
      <LandingPage
        onHostParty={() => setView('host-login')}
        onJoinParty={() => setView('guest-join')}
        onRequestAccess={() => setView('request-access')}
        onAdmin={() => setView('admin')}
      />
    );
  }

  if (view === 'request-access') {
    return (
      <RequestAccessForm
        onBack={() => setView('landing')}
        onSuccess={() => setView('request-sent')}
      />
    );
  }

  if (view === 'request-sent') {
    return <RequestSentScreen onBack={() => setView('landing')} />;
  }

  if (view === 'host-login') {
    return (
      <HostLoginForm
        onBack={() => setView('landing')}
        onSuccess={handleHostLogin}
      />
    );
  }

  if (view === 'host-dashboard') {
    return (
      <HostDashboard
        hostUid={hostUid}
        onCreateNew={() => setView('create-room')}
        onOpenRoom={async (room) => {
          try {
            await updateDoc(doc(db, 'rooms', room.roomCode), { lastActivityAt: serverTimestamp(), endedByHost: false });
            sessionStorage.setItem('roomCode', room.roomCode);
            setCurrentRoom(room);
            setView('host-view');
          } catch (err) {
            console.error('Reopen room error:', err);
          }
        }}
      />
    );
  }

  if (view === 'create-room') {
    return (
      <CreateRoomForm
        hostUid={hostUid}
        hostEmail={hostEmail}
        onRoomCreated={handleRoomCreated}
      />
    );
  }

  if (view === 'host-view' && currentRoom) {
    return (
      <HostView
        key={currentRoom.roomCode}
        roomCode={currentRoom.roomCode}
        roomName={currentRoom.roomName}
        guestPin={currentRoom.guestPin}
        hostUid={hostUid}
        onEndRoom={handleEndRoom}
        onSwitchRoom={(room) => { setCurrentRoom(room); }}
      />
    );
  }

  if (view === 'guest-join') {
    return (
      <GuestJoinForm
        onBack={() => setView('landing')}
        onSuccess={handleGuestJoined}
        prefilledCode={prefilledCode}
      />
    );
  }

  if (view === 'guest-view' && currentRoom) {
    return <GuestView userId={userId} roomCode={currentRoom.roomCode} />;
  }

  // Fallback
  return (
    <LandingPage
      onHostParty={() => setView('host-login')}
      onJoinParty={() => setView('guest-join')}
      onRequestAccess={() => setView('request-access')}
      onAdmin={() => setView('admin')}
    />
  );
}

export default App;
