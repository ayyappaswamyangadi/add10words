#Daily10 — Vocabulary Builder (Monorepo)

Daily10 is a full-stack vocabulary-building application that helps users add and track up to 10 new words every day, with powerful filtering, secure login, duplicate checks, and cloud-synced storage.

This monorepo contains:

Frontend: React + TypeScript (Vite)

Backend / API: Node.js (ES Modules)

Database: MongoDB Atlas

Deployment: Vercel Serverless API + Vercel Frontend Hosting

Workspace Management: npm workspaces

daily10-monorepo/
│
├── frontend/            # React + TypeScript (Vite)
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/             # Models, helper libs (for serverless API)
│   ├── models/
│   ├── lib/
│   └── package.json
│
├── api/                 # Vercel serverless functions (auth, words)
│   ├── auth.js
│   └── words.js
│
├── package.json         # npm workspace root
└── README.md

🚀 Features
🎯 Vocabulary Management

Add up to 10 new words per day

Duplicate word prevention

Date filtering (from, to)

Alphabetical sorting (A–Z, Z–A)

Search filter

CSV export for all stored words

🔐 Authentication

Email + password auth

HttpOnly secure cookies

JWT-based session management

Auto-restore session on page load

☁️ Cloud Storage

MongoDB Atlas stores user data reliably

Cached connections for serverless performance

⚡ Fully Serverless Backend

All endpoints run through Vercel’s /api functions:

/api/auth?action=signup

/api/auth?action=login

/api/auth?action=me

/api/auth?action=logout

/api/words (GET + POST)

🧱 Technology Stack
Layer	Technologies
Frontend	React, TypeScript, Vite, Axios
Backend	Node.js (ESM), Mongoose
Database	MongoDB Atlas
Deployment	Vercel (static + serverless)
Auth	JWT + HttpOnly cookies
Workspace	npm workspaces

🛠 Installation & Setup
1️⃣ Clone the repo
git clone <your-repo-url>
cd daily10-monorepo

2️⃣ Install dependencies for all workspaces
npm install

This installs deps in:

/frontend

/backend (models/helpers for serverless functions)

root

⚙️ Environment Variables
Create a .env file for Vercel (Project Settings → Environment Variables)

Required:

Key	Description
MONGODB_URI	MongoDB Atlas connection string
JWT_SECRET	Strong random string for signing JWT tokens
VITE_API_BASE	Usually /api in production

For local development:

Create frontend/.env:
VITE_API_BASE=/api

Create backend/.env (only if you run backend locally — not needed for serverless in Vercel):
MONGODB_URI=your-uri
JWT_SECRET=your-secret

cd frontend
npm run dev
npx vercel dev
http://localhost:3000/api

☁️ Deployment (Vercel)
Deploying the Monorepo

Push your project to GitHub.

Go to https://vercel.com
 → New Project → Import Repo.

Vercel auto-detects:

Frontend → Vite

Backend → /api functions

Add required environment variables:

MONGODB_URI

JWT_SECRET

VITE_API_BASE=/api

Deploy.

Your app will be available at:
https://your-project.vercel.app

API routes will be under:
https://your-project.vercel.app/api/*

🔒 Authentication Flow

User logs in or signs up → serverless API returns JWT in HttpOnly cookie

Frontend loads /api/auth?action=me on app entry

If cookie is valid → user restored

If invalid/missing → user redirected to /login

📡 API Endpoints Overview
Endpoint	Method	Purpose
/api/auth?action=signup	POST	Sign up new user
/api/auth?action=login	POST	Log in user
/api/auth?action=me	GET	Validate session
/api/auth?action=logout	POST	Log out
/api/words	POST	Add up to 10 words
/api/words	GET	Fetch words with filters

📦 Scripts

At the repo root:

Command	Action
npm install	Install all workspace deps
npm run dev	Start frontend + Vercel dev (if configured)
npm run build	Build frontend
vercel --prod	Deploy to Vercel
🧩 Future Enhancements (ideas)

Word difficulty tagging

Spaced repetition suggestions

Daily reminder notifications (email or push)

Word definitions via dictionary API integration

Flashcard mode

User analytics dashboard

🤝 Contributing

PRs are welcome!
Please follow conventional commits (feat:, fix:, chore:).
