import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,

  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  deleteDoc,
  getDocs,
  writeBatch,
  Timestamp,
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
  X,
  ArrowUpCircle,
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

// YouTube API Key
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

// Hardcoded PINs
const HOST_PIN = '2508';
const GUEST_PIN = '2502';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Parse ISO 8601 duration to seconds
function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// Format seconds to mm:ss
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Rate limiting check
function canAddSong() {
  const now = Date.now();
  const recentAdds = JSON.parse(localStorage.getItem('recentAdds') || '[]');
  const oneMinuteAgo = now - 60000;
  const recentInWindow = recentAdds.filter((t) => t > oneMinuteAgo);
  return recentInWindow.length < 5;
}

function recordSongAdd() {
  const now = Date.now();
  const recentAdds = JSON.parse(localStorage.getItem('recentAdds') || '[]');
  const oneMinuteAgo = now - 60000;
  const recentInWindow = recentAdds.filter((t) => t > oneMinuteAgo);
  recentInWindow.push(now);
  localStorage.setItem('recentAdds', JSON.stringify(recentInWindow));
}

// ============================================================================
// TOAST NOTIFICATION COMPONENT
// ============================================================================
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 z-50 animate-bounce ${type === 'success'
        ? 'bg-green-500 text-white'
        : type === 'error'
          ? 'bg-red-500 text-white'
          : 'bg-slate-700 text-white'
        }`}
    >
      {type === 'success' && <CheckCircle className="w-5 h-5" />}
      {type === 'error' && <XCircle className="w-5 h-5" />}
      <span className="font-medium">{message}</span>
    </div>
  );
}

// ============================================================================
// PIN GATE COMPONENT
// ============================================================================
function PinGate({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (pin === HOST_PIN || pin === GUEST_PIN) {
      try {
        await signInAnonymously(auth);
        sessionStorage.setItem('pinVerified', 'true');
        onSuccess(pin === HOST_PIN ? 'host' : 'guest');
      } catch (_) {
        setError('Authentication failed. Please try again.');
      }
    } else {
      setError('Invalid PIN. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800/80 backdrop-blur-xl rounded-3xl p-8 w-full max-w-sm border border-purple-500/30 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Party Playlist</h1>
          <p className="text-slate-400">Enter the party PIN to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 4-digit PIN"
              className="w-full text-center text-3xl tracking-[0.5em] py-4 bg-slate-700/50 border border-slate-600 rounded-2xl text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-red-400 text-center text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={pin.length !== 4 || loading}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-lg rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-pink-500 transition-all duration-300 shadow-lg shadow-purple-500/30"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            ) : (
              'Enter Party'
            )}
          </button>
        </form>
      </div>
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
  isHost
}) {
  const upNext = queue.filter((s) => s.status === 'pending');
  const playedHistory = queue.filter(s => s.status === 'played');

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${showSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => setShowSidebar(false)}
      />
      <aside
        className={`fixed right-0 bg-slate-900/95 backdrop-blur-lg border-l border-slate-700/50 p-6 overflow-y-auto z-50 transform transition-transform duration-300 top-0 bottom-0 w-80 ${showSidebar ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <SkipForward className="w-5 h-5 text-purple-400" />
            Up Next ({upNext.length})
          </h3>
          <button
            onClick={() => setShowSidebar(false)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-3">
          {upNext.length === 0 ? (
            <p className="text-slate-500 text-sm italic">Queue is empty...</p>
          ) : (
            upNext.map((song, index) => (
              <div key={song.id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl p-2 group">
                <span className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-xs text-slate-400 font-bold flex-shrink-0">
                  {index + 1}
                </span>
                <img
                  src={song.thumbnailUrl}
                  alt={song.title}
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{song.title}</p>
                  <p className="text-slate-400 text-xs truncate">{song.channelTitle}</p>
                </div>

                {/* Actions - Only if Host */}
                {isHost && (
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handlePlayNext(song)}
                      className="p-1.5 hover:bg-slate-700 rounded-full text-blue-400 hover:text-blue-300 transition-colors"
                      title="Play Next"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSong(song.id)}
                      className="p-1.5 hover:bg-slate-700 rounded-full text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* History Section */}
        {playedHistory.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-700/50 opacity-60 hover:opacity-100 transition-opacity">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              History
            </h3>
            <div className="space-y-3">
              {playedHistory.slice().reverse().map((song) => (
                <div key={song.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-2 grayscale">
                  <img
                    src={song.thumbnailUrl}
                    alt={song.title}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-400 text-sm font-medium truncate">{song.title}</p>
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

// ============================================================================
// GUEST VIEW COMPONENT
// ============================================================================
function GuestView({ userId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [queue, setQueue] = useState([]);
  const [showSidebar, setShowSidebar] = useState(false);

  // Listen to queue for display
  useEffect(() => {
    const q = query(
      collection(db, 'queue'),
      where('status', 'in', ['pending', 'playing', 'played'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Client-side sort to avoid composite index requirement
      songs.sort((a, b) => {
        const ta = a.addedAt?.seconds || 0;
        const tb = b.addedAt?.seconds || 0;
        return ta - tb;
      });
      setQueue(songs);
    }, (error) => {
      console.error('Queue subscription error:', error);
      setToast({ message: 'Error syncing queue', type: 'error' });
    });

    return () => unsubscribe();
  }, []);

  // Search YouTube
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      // Search with videoCategoryId: 10 (Music)
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        searchQuery
      )}&type=video&videoCategoryId=10&maxResults=10&key=${YOUTUBE_API_KEY}`;

      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      if (!searchData.items || searchData.items.length === 0) {
        setSearchResults([]);
        setLoading(false);
        return;
      }

      // Get video details for duration filtering
      const videoIds = searchData.items.map((item) => item.id.videoId).join(',');
      const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();

      // Filter videos under 8 minutes
      const filteredResults = detailsData.items
        .filter((video) => {
          const duration = parseDuration(video.contentDetails.duration);
          return duration <= 480; // 8 minutes
        })
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

  // Add song to queue
  const handleAddSong = async (song) => {
    // Rate limiting
    if (!canAddSong()) {
      setToast({ message: 'Slow down! Max 5 songs per minute.', type: 'error' });
      return;
    }

    // Duplicate check
    const isDuplicate = queue.some(s => s.videoId === song.videoId);
    if (isDuplicate) {
      setToast({ message: 'Song already in the queue!', type: 'error' });
      return;
    }

    try {
      await addDoc(collection(db, 'queue'), {
        videoId: song.videoId,
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        channelTitle: song.channelTitle,
        addedBy: userId,
        addedAt: serverTimestamp(),
        status: 'pending',
      });

      recordSongAdd();
      setToast({ message: 'Song added to queue!', type: 'success' });

      // Remove from search results
      setSearchResults((prev) => prev.filter((s) => s.videoId !== song.videoId));
    } catch (err) {
      console.error('Add song error:', err);
      setToast({ message: 'Failed to add song.', type: 'error' });
    }
  };

  const nowPlaying = queue.find((s) => s.status === 'playing');
  const upNext = queue.filter((s) => s.status === 'pending');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-lg border-b border-slate-700/50 px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Party Playlist</h1>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{queue.length} in queue</span>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 ml-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-32">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a song..."
              className="w-full pl-12 pr-4 py-4 bg-slate-800/80 border border-slate-700 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !searchQuery.trim()}
            className="w-full mt-3 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-2xl disabled:opacity-50 hover:from-purple-500 hover:to-pink-500 transition-all duration-300"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              'Search'
            )}
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Search Results</h2>
            <div className="space-y-3">
              {searchResults.map((song) => (
                <div
                  key={song.videoId}
                  className="flex items-center gap-4 bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50"
                >
                  <img
                    src={song.thumbnailUrl}
                    alt={song.title}
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{song.title}</p>
                    <p className="text-slate-400 text-sm truncate">{song.channelTitle}</p>
                    <p className="text-slate-500 text-xs">{formatTime(song.duration)}</p>
                  </div>
                  <button
                    onClick={() => handleAddSong(song)}
                    className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 hover:scale-105 transition-transform"
                  >
                    <Plus className="w-6 h-6 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Now Playing */}
        {nowPlaying && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-green-400" />
              Now Playing
            </h2>
            <div className="bg-gradient-to-br from-purple-900/80 to-pink-900/80 rounded-3xl p-4 border border-purple-500/30">
              <div className="flex items-center gap-4">
                <img
                  src={nowPlaying.thumbnailUrl}
                  alt={nowPlaying.title}
                  className="w-20 h-20 rounded-2xl object-cover shadow-xl"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-lg truncate">{nowPlaying.title}</p>
                  <p className="text-purple-300 text-sm truncate">{nowPlaying.channelTitle}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Up Next */}
        {upNext.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <SkipForward className="w-5 h-5 text-slate-400" />
              Up Next ({upNext.length})
            </h2>
            <div className="space-y-3">
              {upNext.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center gap-4 bg-slate-800/40 rounded-2xl p-3 border border-slate-700/30"
                >
                  <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-slate-400 font-bold text-sm">
                    {index + 1}
                  </div>
                  <img
                    src={song.thumbnailUrl}
                    alt={song.title}
                    className="w-12 h-12 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm">{song.title}</p>
                    <p className="text-slate-400 text-xs truncate">{song.channelTitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!nowPlaying && upNext.length === 0 && searchResults.length === 0 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Music className="w-12 h-12 text-slate-600" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Queue is empty</h3>
            <p className="text-slate-400">Search for a song to get the party started!</p>
          </div>
        )}
      </main>

      {/* Up Next Sidebar */}
      <QueueSidebar
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        queue={queue}
        isHost={false}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// HOST VIEW COMPONENT
// ============================================================================
function HostView() {
  const [queue, setQueue] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const [playerReady, setPlayerReady] = useState(false); // API Ready
  const [playerInstanceReady, setPlayerInstanceReady] = useState(false); // Instance Ready
  const [playlistId, setPlaylistId] = useState('');
  const [seedingPlaylist, setSeedingPlaylist] = useState(false);
  const [toast, setToast] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const isInitialLoad = useRef(true);

  const transitionTriggeredRef = useRef(false);

  // Reset transition flag when song changes
  useEffect(() => {
    transitionTriggeredRef.current = false;
  }, [currentSong]);

  // Clear Playlist with PIN
  const handleClearPlaylist = async () => {
    const pin = window.prompt('Enter PIN to clear playlist:');
    if (pin === '2508') {
      if (!window.confirm('Are you sure you want to clear the entire playlist?')) return;

      try {
        const q = query(collection(db, 'queue'));
        const snapshot = await getDocs(q);

        const deletions = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletions);

        setToast({ message: 'Playlist cleared!', type: 'success' });
        // Stop player
        if (playerRef.current && playerRef.current.stopVideo) {
          playerRef.current.stopVideo();
        }
        setCurrentSong(null);
        setProgress(0);
        setDuration(0);
        setIsPlaying(false);
      } catch (err) {
        console.error('Clear playlist error:', err);
        setToast({ message: 'Failed to clear playlist.', type: 'error' });
      }
    } else if (pin !== null) {
      alert('Incorrect PIN');
    }
  };

  // Seed playlist from YouTube
  const handleSeedPlaylist = async () => {
    if (!playlistId.trim()) return;

    setSeedingPlaylist(true);
    try {
      // Extract playlist ID if full URL was pasted
      let extractedId = playlistId.trim();
      const urlMatch = playlistId.match(/[?&]list=([^&]+)/);
      if (urlMatch) {
        extractedId = urlMatch[1];
      }

      let allValidVideos = [];
      let nextPageToken = '';
      let addedCount = 0;

      do {
        // Fetch playlist items from YouTube API with pagination
        // This returns items in the user-defined order
        const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${extractedId}&maxResults=50&pageToken=${nextPageToken}&key=${YOUTUBE_API_KEY}`;
        const playlistRes = await fetch(playlistUrl);
        const playlistData = await playlistRes.json();

        if (playlistData.error) {
          throw new Error(playlistData.error.message || 'Failed to fetch playlist');
        }

        if (!playlistData.items || playlistData.items.length === 0) {
          if (allValidVideos.length === 0) {
            setToast({ message: 'Playlist is empty or not found.', type: 'error' });
            setSeedingPlaylist(false);
            return;
          }
          break;
        }

        // Get video IDs to fetch duration
        const videoIds = playlistData.items
          .map((item) => item.snippet.resourceId?.videoId)
          .filter(Boolean)
          .join(',');

        // Fetch video details for duration
        // Note: The order of items in this response is NOT guaranteed to match the request
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        // Create a map of videoId -> duration
        const durationMap = new Map();
        detailsData.items.forEach(item => {
          durationMap.set(item.id, parseDuration(item.contentDetails.duration));
        });

        // Filter and map using the ORIGINAL playlistData.items to preserve order
        const validVideos = playlistData.items
          .map((item) => {
            const videoId = item.snippet.resourceId?.videoId;
            const duration = durationMap.get(videoId);

            // If duration is missing (e.g. deleted video) or > 8 mins, skip
            // Also sometimes duration might be 0 for live streams, we might want to skip those too
            if (duration === undefined || duration > 480) return null;

            return {
              videoId: videoId,
              title: item.snippet.title,
              thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
              channelTitle: item.snippet.channelTitle
            };
          })
          .filter(Boolean); // Remove nulls

        // Add to Firestore sequentially to preserve order in addedAt timestamps
        for (const video of validVideos) {
          await addDoc(collection(db, 'queue'), {
            videoId: video.videoId,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            channelTitle: video.channelTitle,
            addedBy: 'host-seed',
            addedAt: serverTimestamp(),
            status: 'pending',
          });
          addedCount++;
        }

        nextPageToken = playlistData.nextPageToken;
      } while (nextPageToken);

      if (addedCount === 0) {
        setToast({ message: 'No valid videos found (all over 8 min).', type: 'error' });
      } else {
        setToast({ message: `Added ${addedCount} songs from playlist!`, type: 'success' });
      }
      setPlaylistId('');
    } catch (err) {
      console.error('Seed playlist error:', err);
      setToast({ message: `Failed to import: ${err.message}`, type: 'error' });
    }
    setSeedingPlaylist(false);
  };

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT) {
      setPlayerReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setPlayerReady(true);
    };
  }, []);

  // Handle song ended
  const handleSongEnded = async () => {
    if (currentSong) {
      // Atomic update: Mark current as played AND next as playing
      const batch = writeBatch(db);
      const currentRef = doc(db, 'queue', currentSong.id);
      batch.update(currentRef, { status: 'played' });

      // Find next song (first pending)
      const nextSong = queue.filter(s => s.status === 'pending')[0];

      if (nextSong) {
        const nextRef = doc(db, 'queue', nextSong.id);
        batch.update(nextRef, { status: 'playing' });
      } else {
        setCurrentSong(null);
      }

      await batch.commit();

      // Reset local player state if no next song
      if (!nextSong) {
        setProgress(0);
        setDuration(0);
      }
    }
  };

  // Ref to hold the latest version of the handler to avoid stale closures in YouTube API
  const onStateChangeRef = useRef(null);

  // Handle player state changes
  const handlePlayerStateChange = useCallback((event) => {
    // YT.PlayerState.ENDED = 0
    if (event.data === 0) {
      handleSongEnded();
    }
    // YT.PlayerState.PLAYING = 1
    setIsPlaying(event.data === 1);
  }, [queue, currentSong, handleSongEnded]); // Properly include dependencies

  // Update ref on every render so the player always calls the latest version
  useEffect(() => {
    onStateChangeRef.current = handlePlayerStateChange;
  }, [handlePlayerStateChange]);

  // Initialize player when ready
  useEffect(() => {
    if (!playerReady || playerRef.current) return;

    playerRef.current = new window.YT.Player('youtube-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        // Delegate to the ref to key access to fresh state
        onStateChange: (event) => {
          if (onStateChangeRef.current) {
            onStateChangeRef.current(event);
          }
        },
        onReady: () => {
          console.log('YouTube Player Ready');
          setPlayerInstanceReady(true);
        },
      },
    });
    // Cleanup function to destroy player and clear ref
    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
      playerRef.current = null;
      setPlayerInstanceReady(false);
    };
  }, [playerReady]);

  // Sync Player with Current Song
  useEffect(() => {
    if (!playerInstanceReady || !playerRef.current || !currentSong) return;

    // Check if player is already playing this video
    if (playerRef.current.getVideoData) {
      const playerVideoData = playerRef.current.getVideoData();
      if (playerVideoData && playerVideoData.video_id === currentSong.videoId) {
        // Force play if we are in this state to be sure
        if (playerRef.current.getPlayerState && playerRef.current.getPlayerState() !== 1) { // 1 = Playing
          playerRef.current.playVideo();
        }
        return;
      }
    }

    if (isInitialLoad.current) {
      if (playerRef.current.cueVideoById) {
        playerRef.current.cueVideoById({
          videoId: currentSong.videoId,
          startSeconds: 0,
          suggestedQuality: 'default'
        });
      }
      isInitialLoad.current = false;
    } else {
      if (playerRef.current.loadVideoById) {
        playerRef.current.loadVideoById({
          videoId: currentSong.videoId,
          startSeconds: 0,
          suggestedQuality: 'default'
        });
      }
    }
  }, [currentSong, playerInstanceReady]);

  // Listen to queue
  useEffect(() => {
    const q = query(
      collection(db, 'queue'),
      where('status', 'in', ['pending', 'playing', 'played'])
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const songs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Client-side sort
      songs.sort((a, b) => {
        const ta = a.addedAt?.seconds || 0;
        const tb = b.addedAt?.seconds || 0;
        return ta - tb;
      });

      setQueue(songs);

      // Find currently playing song
      const playing = songs.find((s) => s.status === 'playing');

      if (playing) {
        // If we have a playing song and it's different from current, load it
        if (!currentSong || currentSong.id !== playing.id) {
          setCurrentSong(playing);
        }
      } else {
        // No song playing, start the first pending one
        // Note: We rely on handleSongEnded to trigger this transition usually.
        // But if the app loads fresh and nothing is playing but there are pending songs, we kickstart it.
        const nextSong = songs.find((s) => s.status === 'pending');
        if (nextSong) {
          // Check if we just finished a song to avoid double-trigger? 
          // If 'playing' is undefined, and we have pending, we should play.
          await updateDoc(doc(db, 'queue', nextSong.id), { status: 'playing' });
        } else {
          setCurrentSong(null);
        }
      }
    });

    return () => unsubscribe();
  }, [currentSong]);

  // Update progress
  useEffect(() => {
    if (!playerRef.current) return;

    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime && playerRef.current.getDuration) {
        try {
          const current = playerRef.current.getCurrentTime();
          const total = playerRef.current.getDuration();
          if (total > 0) {
            setProgress(current);
            setDuration(total);

            // Proactive transition: If less than 2 seconds remain, trigger next song
            if (total - current < 2 && !transitionTriggeredRef.current && isPlaying) {
              console.log('Proactive transition triggered');
              transitionTriggeredRef.current = true;
              handleSongEnded();
            }
          }
        } catch (_) {
          // Player not ready
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [playerReady, isPlaying]);

  // Handle Seek
  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setProgress(time); // Immediate visual feedback
    if (playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(time, true);
    }
  };

  // Handle song ended


  // Skip song
  const handleSkip = async () => {
    if (currentSong) {
      if (playerRef.current && playerRef.current.stopVideo) {
        playerRef.current.stopVideo();
      }

      const batch = writeBatch(db);
      const currentRef = doc(db, 'queue', currentSong.id);
      batch.update(currentRef, { status: 'played' });

      const nextSong = queue.filter(s => s.status === 'pending')[0];

      if (nextSong) {
        const nextRef = doc(db, 'queue', nextSong.id);
        batch.update(nextRef, { status: 'playing' });
      } else {
        setCurrentSong(null);
      }

      await batch.commit();

      setProgress(0);
      setDuration(0);
    }
  };

  // Previous song
  const handlePrevious = async () => {
    // Smart Previous: Restart if > 10s
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const currentTime = playerRef.current.getCurrentTime();
      if (currentTime > 10) {
        playerRef.current.seekTo(0);
        return;
      }
    }

    const playedSongs = queue.filter(s => s.status === 'played');
    if (playedSongs.length === 0) return;

    const lastPlayed = playedSongs[playedSongs.length - 1];

    if (currentSong) {
      await updateDoc(doc(db, 'queue', currentSong.id), { status: 'pending' });
    }

    await updateDoc(doc(db, 'queue', lastPlayed.id), { status: 'playing' });
  };

  // Delete song from queue
  const handleDeleteSong = async (songId) => {
    if (!window.confirm('Delete this song from queue?')) return;
    try {
      await deleteDoc(doc(db, 'queue', songId));
      setToast({ message: 'Song removed from queue', type: 'success' });
    } catch (err) {
      console.error('Delete song error:', err);
      setToast({ message: 'Failed to delete song', type: 'error' });
    }
  };

  // Play next (prioritize)
  const handlePlayNext = async (song) => {
    try {
      const pendingSongs = queue.filter(s => s.status === 'pending');
      if (pendingSongs.length === 0) return;

      const topSong = pendingSongs[0];

      if (topSong.id === song.id) {
        setToast({ message: 'Song is already up next!', type: 'success' });
        return;
      }

      let newTime;
      if (topSong.addedAt && typeof topSong.addedAt.toMillis === 'function') {
        newTime = Timestamp.fromMillis(topSong.addedAt.toMillis() - 1000);
      } else {
        const baseTime = topSong.addedAt?.toMillis ? topSong.addedAt.toMillis() : Date.now();
        newTime = Timestamp.fromMillis(baseTime - 1000);
      }

      await updateDoc(doc(db, 'queue', song.id), {
        addedAt: newTime
      });

      setToast({ message: 'Song moved to top of queue!', type: 'success' });
      setShowSidebar(false);
    } catch (err) {
      console.error('Play next error:', err);
      setToast({ message: 'Failed to prioritize song', type: 'error' });
    }
  };

  const togglePlay = () => {
    if (playerRef.current) {
      if (playerRef.current.getPlayerState() === 1) { // Playing
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    }
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      {/* Hidden YouTube Player */}
      <div className="absolute" style={{ width: 1, height: 1, overflow: 'hidden' }}>
        <div id="youtube-player" ref={playerContainerRef}></div>
      </div>

      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <Music className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Party Playlist</h1>
              <p className="text-slate-400 text-sm">Host View</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Users className="w-5 h-5" />
            <span className="text-lg hidden md:inline">{queue.length} songs</span>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 ml-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        {/* Seed Playlist Section */}
        <div className="max-w-4xl mx-auto mt-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <ListPlus className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
                placeholder="Paste YouTube Playlist ID or URL to seed..."
                className="w-full pl-12 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={handleSeedPlaylist}
              disabled={seedingPlaylist || !playlistId.trim()}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:from-purple-500 hover:to-pink-500 transition-all duration-300 flex items-center gap-2 text-sm"
            >
              {seedingPlaylist ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <ListPlus className="w-4 h-4" />
                  Seed Playlist
                </>
              )}
            </button>
            <button
              onClick={handleClearPlaylist}
              className="px-4 py-3 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 text-sm border border-slate-700 hover:border-red-500/30"
              title="Clear Playlist"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {currentSong ? (
          <div className="w-full max-w-2xl">
            {/* Album Art */}
            <div className="relative mb-8">
              <img
                src={currentSong.thumbnailUrl?.replace('mqdefault', 'maxresdefault') || currentSong.thumbnailUrl}
                alt={currentSong.title}
                className="w-full aspect-video rounded-3xl object-cover shadow-2xl shadow-purple-500/20"
                onError={(e) => {
                  e.target.src = currentSong.thumbnailUrl;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-3xl" />
              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-sm text-purple-300 uppercase tracking-wider mb-2">Now Playing</p>
                <h2 className="text-3xl font-bold text-white mb-2 line-clamp-2">{currentSong.title}</h2>
                <p className="text-lg text-slate-300">{currentSong.channelTitle}</p>
              </div>
            </div>

            {/* Progress Bar / Seeker */}
            <div className="mb-6 group">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={progress}
                onChange={handleSeek}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-125"
                style={{
                  background: `linear-gradient(to right, #a855f7 0%, #ec4899 ${progressPercent}%, #334155 ${progressPercent}%, #334155 100%)`
                }}
              />
              <div className="flex justify-between text-sm text-slate-400 mt-2">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-6">
              <button
                onClick={handlePrevious}
                className="w-14 h-14 bg-slate-700 hover:bg-slate-600 text-white rounded-full flex items-center justify-center transition-colors"
                title="Previous Song"
              >
                <SkipBack className="w-6 h-6" />
              </button>

              <button
                onClick={togglePlay}
                className="w-16 h-16 bg-white hover:bg-slate-200 text-purple-900 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-white/10"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : (
                  <Play className="w-8 h-8 fill-current translate-x-1" />
                )}
              </button>

              <button
                onClick={handleSkip}
                className="w-14 h-14 bg-slate-700 hover:bg-slate-600 text-white rounded-full flex items-center justify-center transition-colors"
                title="Skip Song"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-32 h-32 bg-slate-800/80 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
              <Music className="w-16 h-16 text-slate-600" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Waiting for songs...</h2>
            <p className="text-slate-400 text-lg">Share the QR code to let guests add songs!</p>
          </div>
        )}
      </main>

      {/* Up Next Sidebar */}
      <QueueSidebar
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        queue={queue}
        handlePlayNext={handlePlayNext}
        handleDeleteSong={handleDeleteSong}
        isHost={true}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check for existing session
  useEffect(() => {
    const pinVerified = sessionStorage.getItem('pinVerified');

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && pinVerified) {
        setUserId(user.uid);
        setAuthenticated(true);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handlePinSuccess = (role) => {
    setAuthenticated(true);
    if (auth.currentUser) {
      setUserId(auth.currentUser.uid);
    }
    if (role === 'host') {
      navigate('/host');
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return <PinGate onSuccess={handlePinSuccess} />;
  }

  return (
    <Routes>
      <Route path="/" element={<GuestView userId={userId} />} />
      <Route path="/host" element={<HostView />} />
    </Routes>
  );
}

export default App;
