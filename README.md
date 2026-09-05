# Anime Ledger

A personal anime tracker: search, add entries, mark Good/Bad, track season status,
and keep a separate watchlist — synced across every device through Firebase.

## What you get
- Search by English title or rōmaji
- Add / edit / delete entries
- Good / Bad rating (shown as a stamp)
- Season status per anime (only one season / caught up / new season out / sequel not out yet)
- One-click lookup on MyAnimeList to auto-fill the rōmaji title and check whether a sequel exists
- A separate Watchlist tab for "want to watch" titles, with a one-tap "mark watched" to promote an entry
- Real-time sync: edit on your laptop, see it instantly on your phone
- Sign-in protected, so your data isn't publicly editable even though the site itself is public

## Part 1 — Create your Firebase project (~5 minutes)

1. Go to https://console.firebase.google.com and sign in with any Google account.
2. Click **Add project**, give it a name (e.g. "anime-ledger"), and finish the wizard
   (you can disable Google Analytics — not needed here).
3. In the left sidebar, click **Build > Authentication**. Click **Get started**.
   Under **Sign-in method**, enable **Email/Password** and save.
4. In the left sidebar, click **Build > Firestore Database**. Click **Create database**.
   - Choose **Start in production mode**.
   - Pick any region close to you.
5. Once created, go to the **Rules** tab of Firestore and replace the contents with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/anime/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

   Click **Publish**. This makes sure each signed-in account can only ever read or write
   its own data — important since your GitHub repo (and this config) will be public.

6. Go to **Project settings** (the gear icon, top left) > scroll to **Your apps** >
   click the **</>** (web) icon to register a new web app. Give it any nickname,
   you don't need Firebase Hosting.
7. Firebase will show you a `firebaseConfig` object. Copy it.

## Part 2 — Add your config to the project

Open `firebase-config.js` in this folder and paste your copied values in, replacing the
placeholders. It should look like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "anime-ledger-xxxxx.firebaseapp.com",
  projectId: "anime-ledger-xxxxx",
  storageBucket: "anime-ledger-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

This value is not a secret — it's fine for it to be public. Your data is protected by the
sign-in requirement and the Firestore rules above, not by hiding this file.

## Part 3 — Put it on GitHub Pages

1. Create a new **public** repository on GitHub (e.g. `anime-ledger`).
2. Upload all 5 files from this folder (`index.html`, `style.css`, `app.js`,
   `firebase-config.js`, `README.md`) to the repo — drag and drop works fine on
   github.com, or use `git push` if you're comfortable with git.
3. In the repo, go to **Settings > Pages**. Under **Build and deployment**,
   set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. GitHub will give you a URL like `https://yourusername.github.io/anime-ledger/`
   — it takes a minute or two to go live the first time.

## Part 4 — Create your account and start using it

1. Open your new URL. Click **Create account**, enter any email/password you'll remember
   (it doesn't need to be a real inbox — Firebase just uses it as your login).
2. You're in. Add your first entry, and open the same URL on your phone or another
   computer, sign in with the same email/password, and you'll see it appear there too.

## Notes
- The "Look up on MAL" button uses Jikan (a free, keyless API for MyAnimeList data).
  It's occasionally slow or rate-limited — if it fails, just type the rōmaji yourself.
- If you ever want a second Firebase project (e.g. separate from something else you
  build later), each project has its own free quota, so this won't compete for it.
- The free Firebase tier gives you 50,000 reads and 20,000 writes a day — a personal
  list like this would need to be extremely active to ever approach that.
