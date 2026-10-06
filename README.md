# NoteShare — MEAN Stack Online Note Sharing System

A full-stack note sharing app: MongoDB, Express, Angular, Node.js.

Users register/login (JWT auth), create notes, mark a note public, or share
it with another user by email. Only the owner can edit/delete/share a note.

**Share on creation** — when creating a note you can choose "send to all
registered users" or pick specific people from a checklist, and attach files
right in that same step — no need to save first and share/upload separately.

**Search, tags & folders** — every note can carry a folder and up to 15 tags;
the note list has a search box plus tag/folder dropdowns (built from the
distinct values across your notes), backed by a MongoDB text index.

**Rich text editor** — notes are written in a built-in formatting toolbar
(bold, italic, underline, bullet/numbered lists, headings) instead of plain
text; content is stored as HTML and rendered safely (Angular sanitizes it on
display).

**Version history** — every time a note's title or content changes, the
previous version is kept (last 20). Open "Version History" on a note to
preview any past version or restore it — restoring itself is saved as a new
version first, so nothing is ever lost.

**Dark mode** — a toggle in the note list switches the whole app between a
light "ruled notebook paper" theme and a dark variant; your choice is
remembered (falls back to your system preference on first visit).

**Real-time, multi-user** — powered by Socket.IO on the same port as the API:
- Your note list refreshes live the moment a note you own/collaborate on is
  created, edited, deleted, shared with you, or gets a new attachment —
  across every open tab/device, for every affected user, with no page reload.
- While two people have the *same* note open, keystrokes are broadcast live
  to everyone else viewing it (debounced ~300ms), and each note shows how
  many other people are currently viewing it.

## Structure
```
mean-note-app/
  backend/    Express + MongoDB API (port 5000)
  frontend/   Angular app (port 4200)
```

## Prerequisites
- Node.js 18+ and npm
- MongoDB running locally (or a MongoDB Atlas connection string)
- Angular CLI: `npm install -g @angular/cli`

## 1. Backend setup
```
cd backend
npm install
cp .env.example .env
```
Edit `.env` and set MONGO_URI and a strong JWT_SECRET.

Start MongoDB locally if needed (e.g. `mongod`), then run:
```
npm run dev      # with nodemon, auto-restart
# or
npm start
```
API runs at http://localhost:5000

## 2. Frontend setup
Open a second terminal:
```
cd frontend
npm install
npm start
```
App runs at http://localhost:4200 and calls the API at http://localhost:5000.

## 3. Using the app
1. Go to http://localhost:4200 — you'll land on Login.
2. Register a new account.
3. Create a note; optionally mark it "public".
4. To share a note with another user, they must already have an account —
   click "Share" on a note you own and enter their registered email.
5. Log out from the top-right button.

## API summary
- POST /api/auth/register
- POST /api/auth/login
- GET  /api/auth/users                             (list other registered users, for the recipient picker)
- GET  /api/notes                                 (your notes + notes shared with you; query: q, tag, folder)
- GET  /api/notes/meta/tags-and-folders            (distinct tags/folders across your notes, for filter dropdowns)
- GET  /api/notes/:id
- POST /api/notes                                  (multipart: title, content, isPublic, shareWithAll, shareWith, tags (JSON array), folder, files)
- PUT  /api/notes/:id                               (also accepts tags, folder; snapshots the previous version when title/content changes)
- GET  /api/notes/:id/versions                      (past snapshots, most recent first)
- POST /api/notes/:id/versions/:versionId/restore   (owner only)
- DELETE /api/notes/:id
- POST /api/notes/:id/share  { email }
- POST /api/notes/:id/attachments                 (multipart form field: files)
- GET  /api/notes/:id/attachments
- GET  /api/notes/:id/attachments/:attachmentId/download
- DELETE /api/notes/:id/attachments/:attachmentId

## Trying the multi-user features
1. Register two different accounts (e.g. in two browser windows, or one
   normal + one incognito, since the JWT lives in localStorage per browser
   profile).
2. Have user A create a note and share it with user B's email.
3. Open the same note in both windows. Type in one — the other updates live,
   and you'll see the "N other(s) viewing now" badge.
4. Upload a file as the owner in one window; it appears in the other window's
   file list without refreshing.

## Notes on scope
This is a working starting point, not production-hardened:
- Add rate limiting / input validation (e.g. express-validator) before deploying.
- Move the frontend API base URL and Socket.IO origin into environment files for prod builds.
- Live co-editing here is "last write broadcast wins" (no operational
  transform/CRDT) — fine for a couple of collaborators, not a full Google-Docs-grade merge engine.
- Uploaded files are stored on local disk (backend/uploads); for multi-server
  deployments, swap in S3/GridFS instead.
- Consider adding password reset and rich text if needed.
