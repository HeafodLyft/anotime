# Anotime

*anime + note* — a personal anime tracker: search, add entries, rate on a five-tier
scale, track season status with optional release dates, tag things your own way,
keep a separate watchlist, and undo accidental deletes — all synced across every
device through Firebase.

## What you get
- Search by English title, rōmaji, or tag
- Add / edit / soft-delete entries (30-day undo window in the Trash tab)
- Five-tier rating: Very Good / Good / Neutral / Bad / Very Bad (or leave unrated)
- Custom tags you define yourself, with clickable tag filters
- Season tracking: mark "last season" to stop tracking, or set an optional next-season
  release date (clearable) and a caught-up/new-season-out toggle — shown as an
  at-a-glance flag on the card
- Sort by newest, oldest, title, or rating
- A Stats panel: totals, rating breakdown, most active month, top tags
- One-click JSON export of your whole list
- One-click lookup on MyAnimeList to auto-fill the rōmaji title and check for a sequel
- Real-time sync: edit on your laptop, see it instantly on your phone
- Sign-in protected, so your data isn't publicly editable even though the site itself is public

## Part 1 — Create your Firebase project (~5 minutes)

1. Go to https://console.firebase.google.com and sign in (an alt Google account is a
   sensible choice for hobby projects like this, kept separate from anything important).
2. Click **Add project**, give it a name (e.g. "anotime"), and finish the wizard
   (Analytics is not needed).
3. **Build > Authentication > Get started**. Under **Sign-in method**, enable
   **Email/Password** and save. *(If you ever see an `auth/configuration-not-found`
   error later, it almost always means this step got skipped or wasn't saved.)*
4. **Build > Firestore Database > Create database**.
   - Edition: **Standard**.
   - Location: pick whichever region is closest to you — this can't be changed later.
   - You'll land on the database with a placeholder rule set; the **Rules** tab is
     where you edit it, in the next step.
5. Go to the **Rules** tab and replace the contents with:

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

   Click **Publish**. This makes sure each signed-in account can only ever read or
   write its own data — important since your GitHub repo (and this config) is public.

6. **Project settings** (gear icon) > **Your apps** > click **</>** to register a web
   app. On the SDK setup screen, choose the **`<script>` tag** option (not npm — this
   project doesn't use a bundler). Copy the `firebaseConfig` object it shows you.

## Part 2 — Add your config to the project

Open `firebase-config.js` and paste your copied values in, replacing the placeholders.
This value isn't a secret — it's fine for it to be public. Your data is protected by
the sign-in requirement and the Firestore rules above, not by hiding this file.

## Part 3 — Put it on GitHub Pages

1. Create a new **public** repository on GitHub.
2. Upload all 5 files (`index.html`, `style.css`, `app.js`, `firebase-config.js`,
   `README.md`) to the repo.
3. **Settings > Pages** — set Source to "Deploy from a branch", branch `main`,
   folder `/ (root)`. Save.
4. Your site goes live at `https://yourusername.github.io/your-repo-name/` within a
   minute or two.

To edit later: open any file in the repo on github.com, click the pencil icon,
replace the content, and commit. GitHub Pages rebuilds automatically — check the
**Actions** tab if a build seems stuck, and "Re-run all jobs" if needed.

## Part 4 — Create your account and start using it

Open your URL, click **Create account** with any email/password you'll remember (it
doesn't need to be a real inbox), and you're in. Sign in with the same credentials on
any other device to see the same data.

## Notes
- The "Look up on MAL" button uses Jikan (a free, keyless API for MyAnimeList data).
  It's occasionally slow or rate-limited — if it fails, just type the rōmaji yourself.
- Deleted entries sit in the Trash tab for 30 days (restorable) before being
  permanently removed automatically.
- The free Firebase tier gives you 50,000 reads and 20,000 writes a day — a personal
  list like this would need to be extremely active to ever approach that.
