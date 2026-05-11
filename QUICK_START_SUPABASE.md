# Quick Start: Enable Supabase Sync in Your App

## What You Need
1. Supabase account (free tier is enough)
2. Your app code
3. 15 minutes

---

## Step 1: Create Supabase Project (5 min)

1. Go to https://supabase.com
2. Click **Start your project**
3. Sign up with GitHub
4. Click **New Project**
5. Fill in:
   - **Name**: `twok-clinic`
   - **Database Password**: (save this!)
   - **Region**: Choose closest to you
6. Click **Create new project**
7. Wait 2 minutes for setup

---

## Step 2: Get Your Keys (1 min)

1. Click **Project Settings** (gear icon, bottom-left)
2. Click **API**
3. Copy these 2 values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGci...` (long string)

---

## Step 3: Setup Database (2 min)

1. Click **SQL Editor** (left sidebar)
2. Click **New query**
3. Open file: `supabase/schema.sql` from your project
4. Copy ALL the SQL code
5. Paste into Supabase SQL Editor
6. Click **Run** (bottom-right)
7. Wait for "Success" message
8. Verify 10 tables appear in **Table Editor**

---

## Step 4: Update Frontend Config (2 min)

Open file: `js/config/sync-config.js`

Replace these 2 lines:
```javascript
URL: 'https://your-project-id.supabase.co',
ANON_KEY: 'your-anon-key-here',
```

With your actual values:
```javascript
URL: 'https://xxxxx.supabase.co',
ANON_KEY: 'eyJhbGci...', // The long string you copied
```

---

## Step 5: Add Scripts to index.html (1 min)

Open `index.html`

Find this line (near the end):
```html
<script src="script.js"></script>
```

Add these 5 lines AFTER it:
```html
<script src="js/config/sync-config.js"></script>
<script src="js/sync/SupabaseClient.js"></script>
<script src="js/sync/SyncManager.js"></script>
<script src="js/sync/DataLayer.js"></script>
<script src="js/sync/init-sync.js"></script>
```

Save the file.

---

## Step 6: Test Locally (2 min)

1. Open `index.html` in your browser
2. Press F12 to open DevTools
3. Go to **Console** tab
4. You should see:
   ```
   [Sync Integration] Starting initialization...
   [SupabaseClient] ✅ Initialized
   [DataLayer] ✅ Initialization complete
   [Sync Integration] ✅ Integration complete!
   ```

5. Test sync status - type in console:
   ```javascript
   window.getSyncStatus()
   ```
   
   You should see:
   ```javascript
   {
     initialized: true,
     supabaseConnected: true,
     ...
   }
   ```

---

## Step 7: Deploy to Render (Optional)

See full guide: `SUPABASE_DEPLOYMENT.md`

Quick version:
1. Push code to GitHub
2. Go to render.com
3. Create new Web Service from your repo
4. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click Deploy

---

## That's It! 🎉

Your app now:
- ✅ Syncs to cloud automatically
- ✅ Works offline
- ✅ Syncs when back online
- ✅ Real-time updates across devices

---

## Verify It Works

### Test 1: Add Data
1. Add a patient in your app
2. Check browser console - should see sync logs
3. Go to Supabase Dashboard → Table Editor → patients
4. You should see the new patient!

### Test 2: Offline Mode
1. Open DevTools → Network tab
2. Select **Offline** from dropdown
3. Add/edit data
4. Switch back to **Online**
5. Watch data sync automatically!

### Test 3: Multi-Device
1. Open app in 2 browser tabs
2. Add data in one tab
3. Watch it appear in the other tab!

---

## Troubleshooting

### "Supabase not initialized"
- Check `js/config/sync-config.js` has correct URL and key
- Check browser console for errors

### "CORS error"
- Backend not running (if deployed)
- Check `API_URL` in sync-config.js matches your backend

### "Data not syncing"
- Check you're online (not in Offline mode)
- Run `window.getSyncStatus()` to check sync state
- Check Supabase Table Editor to see if data is there

---

## Need Help?

Check the full deployment guide: `SUPABASE_DEPLOYMENT.md`

Or check Supabase docs: https://supabase.com/docs
