# CrowdPlay

A collaborative, real-time music queue for weddings and parties. Guests join with a PIN, search YouTube, and add songs to a shared queue. The host has full playback control and queue management — all synced live across every device.

**Live Demo:** https://crowdplay-host.vercel.app/

---

## Features

### Guest Experience
- Join with a 4-digit PIN
- Search YouTube for songs and add them to the shared queue
- See "Now Playing" and "Up Next" in real-time
- Upvote songs to move them higher in the queue
- Rate limiting: max 5 songs per minute, no duplicates
- Duration limit: songs over 8 minutes are blocked

### Host Controls
- Separate PIN for host access
- YouTube player with Play/Pause, Skip, Previous, and seek bar
- Prioritize songs ("Play Next"), remove songs, or clear the full queue
- Seed the queue by importing any YouTube playlist
- View recently played history

---

## Tech Stack

- **Frontend:** React 19 + Vite 7
- **Styling:** Tailwind CSS 4 with glassmorphism dark theme
- **Database:** Firebase Firestore (real-time sync)
- **Auth:** Firebase Anonymous Auth + PIN gating
- **Media:** YouTube Data API v3 + YouTube IFrame API
- **Deployment:** Vercel

---

## Prerequisites

Before setting up, you need accounts and credentials from three services:

| Service | What you need |
|---------|--------------|
| [Firebase](https://console.firebase.google.com) | A project with Firestore + Anonymous Auth enabled |
| [Google Cloud Console](https://console.cloud.google.com) | YouTube Data API v3 key |
| [Vercel](https://vercel.com) | Account for deployment (free) |
| [Firebase CLI](https://firebase.google.com/docs/cli) | Installed locally to deploy Firestore rules |

---

## Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/KshitijRanjan/crowdplay.git
cd crowdplay
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project
2. In the project, go to **Build → Firestore Database** and create a database (start in production mode)
3. Go to **Build → Authentication**, click **Get Started**, and enable the **Anonymous** sign-in provider
4. Go to **Project Settings → General** and scroll to "Your apps" → Add a Web app
5. Copy the Firebase config object — you'll need it in the next step

### 4. Set up environment variables

Copy the example file:

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
# Firebase config (from your Firebase project settings)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# YouTube Data API v3 key (from Google Cloud Console)
VITE_YOUTUBE_API_KEY=your_youtube_api_key

# Access PINs (choose any 4-digit numbers)
VITE_HOST_PIN=1234
VITE_GUEST_PIN=5678
```

### 5. Deploy Firestore security rules

The app uses Firestore security rules to enforce role-based access. Deploy them before running the app:

```bash
npm install -g firebase-tools
firebase login
firebase use your_project_id
firebase deploy --only firestore:rules
```

### 6. Run locally

```bash
npm run dev
```

App runs at `http://localhost:5173`. Open two browser tabs — one with the guest PIN and one with the host PIN to test both views.

---

## Deploying to Vercel

### 1. Push your code to GitHub (fork or your own repo)

### 2. Import the project on Vercel

1. Go to [vercel.com](https://vercel.com) and click **Add New Project**
2. Import your GitHub repository
3. Framework preset: **Vite** (auto-detected)

### 3. Add environment variables

In the Vercel project settings under **Environment Variables**, add all the same variables from your `.env` file.

### 4. Deploy

Click **Deploy**. Vercel will build and host the app. All routes are handled by React Router via the `vercel.json` rewrite config included in the repo.

---

## Restrict Your YouTube API Key (Important)

After deploying, restrict your YouTube API key so it only works from your domain:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Click your YouTube API key
3. Under **Application restrictions**, select **HTTP referrers**
4. Add your Vercel domain: `your-app.vercel.app/*`
5. Save

This prevents the key from being used if someone extracts it from the browser bundle.

---

## Project Structure

```
crowdplay/
├── src/
│   ├── App.jsx              # All components and app logic
│   ├── ErrorBoundary.jsx    # React error boundary
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles
├── firestore.rules          # Firestore security rules
├── firebase.json            # Firebase CLI config
├── vercel.json              # SPA rewrite rules
├── .env.example             # Environment variable template
├── vite.config.js
└── package.json
```

---

## Security Model

Security is enforced at two layers:

1. **Firestore Security Rules** — the primary trust boundary. Rules check the authenticated user's role before allowing any write. Even if someone bypasses the frontend, Firestore blocks them.
2. **Client-side PIN gate** — guards the UI. Not tamper-proof on its own, which is why Firestore rules are essential.

What the rules enforce:
- Only hosts can delete or fully update queue items
- Guests can only toggle their own upvote
- Role documents are write-once (no privilege escalation)
- All unauthenticated access is denied

---

## Contributing

1. Fork the project
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request into `main`

---

Built for the perfect party atmosphere.
