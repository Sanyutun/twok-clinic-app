# Supabase Integration - Migration Checklist

Use this checklist to track your migration progress. Check off each item as you complete it.

---

## Phase 1: Setup Supabase (15 minutes)

- [ ] Create Supabase account at https://supabase.com
- [ ] Create new project named "twok-clinic"
- [ ] Save database password securely
- [ ] Wait for project provisioning (2 minutes)
- [ ] Navigate to Project Settings → API
- [ ] Copy Project URL: `https://_________.supabase.co`
- [ ] Copy anon/public key: `eyJhbGci...`
- [ ] Copy service_role key: `eyJhbGci...` (keep secret!)

---

## Phase 2: Setup Database (5 minutes)

- [ ] Open SQL Editor in Supabase dashboard
- [ ] Open file: `supabase/schema.sql`
- [ ] Copy entire file contents
- [ ] Paste into SQL Editor
- [ ] Click "Run" button
- [ ] Verify "Success" message
- [ ] Navigate to Table Editor
- [ ] Verify 11 tables exist:
  - [ ] patients
  - [ ] doctors
  - [ ] appointments
  - [ ] instructions
  - [ ] expenses
  - [ ] expense_categories
  - [ ] lab_records
  - [ ] addresses
  - [ ] specialities
  - [ ] hospitals
  - [ ] settings
- [ ] Navigate to Database → Replication
- [ ] Enable replication for all 11 tables (including settings)

---

## Phase 3: Configure Frontend (5 minutes)

- [ ] Open file: `js/config/sync-config.js`
- [ ] Replace `SUPABASE.URL` with your Project URL
- [ ] Replace `SUPABASE.ANON_KEY` with your anon key
- [ ] (Optional) Update `API_URL` if deploying backend
- [ ] Save file

---

## Phase 4: Add Scripts to index.html (2 minutes)

- [ ] Open `index.html`
- [ ] Find closing `</body>` tag
- [ ] Add these 5 lines BEFORE `</body>`:

```html
<script src="js/config/sync-config.js"></script>
<script src="js/sync/SupabaseClient.js"></script>
<script src="js/sync/SyncManager.js"></script>
<script src="js/sync/DataLayer.js"></script>
<script src="js/sync/init-sync.js"></script>
```

- [ ] Save file

---

## Phase 5: Test Locally (5 minutes)

- [ ] Open `index.html` in browser
- [ ] Press F12 to open DevTools
- [ ] Go to Console tab
- [ ] Verify these messages appear:
  ```
  [Sync Integration] Starting initialization...
  [SupabaseClient] ✅ Initialized
  [DataLayer] ✅ Initialization complete
  [Sync Integration] ✅ Integration complete!
  ```
- [ ] Type in console: `window.getSyncStatus()`
- [ ] Verify response shows:
  - [ ] `initialized: true`
  - [ ] `supabaseConnected: true`
- [ ] Add a test patient
- [ ] Check console for sync logs
- [ ] Go to Supabase Table Editor
- [ ] Verify patient appears in cloud database

---

## Phase 6: Test Offline Mode (3 minutes)

- [ ] Open DevTools → Network tab
- [ ] Select "Offline" from throttling dropdown
- [ ] Add/edit/delete data in app
- [ ] Verify UI updates instantly
- [ ] Check console shows queue operations
- [ ] Switch back to "Online" (or "No throttling")
- [ ] Watch console logs for automatic sync
- [ ] Verify Supabase Table Editor shows changes

---

## Phase 7: Test Multi-Device (5 minutes)

- [ ] Open app in 2 browser tabs/windows
- [ ] Add data in Tab 1
- [ ] Watch Tab 2 auto-update (within 1-2 seconds)
- [ ] Edit same record in both tabs
- [ ] Verify last-write-wins behavior
- [ ] Delete record in Tab 1
- [ ] Verify record disappears in Tab 2

---

## Phase 8: Deploy Backend (Optional - 20 minutes)

- [ ] Create `.env` file in `server/` directory
- [ ] Add Supabase credentials to `.env`
- [ ] Test backend locally: `cd server && npm start`
- [ ] Visit `http://localhost:3000/health`
- [ ] Verify `{"status":"ok"}` response
- [ ] Push code to GitHub
- [ ] Create Render account at https://render.com
- [ ] Create new Web Service
- [ ] Connect GitHub repository
- [ ] Set root directory to `server`
- [ ] Add environment variables:
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_SERVICE_ROLE_KEY
  - [ ] NODE_ENV=production
- [ ] Deploy backend
- [ ] Copy backend URL: `https://_____.onrender.com`
- [ ] Update `API_URL` in `js/config/sync-config.js`
- [ ] Test backend URL in browser

---

## Phase 9: Deploy Frontend (Optional - 10 minutes)

- [ ] On Render, create new Static Site
- [ ] Connect GitHub repository
- [ ] Set build command: `echo "No build"`
- [ ] Set publish directory: `.`
- [ ] Deploy frontend
- [ ] Visit frontend URL
- [ ] Verify app loads correctly
- [ ] Test sync functionality

---

## Phase 10: Migrate Existing Data (Optional - 15 minutes)

- [ ] Open old app version in browser
- [ ] Open console (F12)
- [ ] Run data export script (see SUPABASE_DEPLOYMENT.md)
- [ ] Download `twok-clinic-backup.json`
- [ ] Create `server/import-data.js` script
- [ ] Copy backup file to project root
- [ ] Run import: `cd server && node import-data.js`
- [ ] Verify records in Supabase Table Editor
- [ ] Check all 10 tables have data

---

## Phase 11: Production Readiness (Optional - 30 minutes)

- [ ] Setup Supabase automated backups
- [ ] Enable Supabase Point-in-Time Recovery (Pro tier)
- [ ] Add error monitoring (Sentry/LogRocket)
- [ ] Setup custom domain for frontend
- [ ] Setup custom domain for backend
- [ ] Enable HTTPS (automatic on Render)
- [ ] Add authentication (Supabase Auth)
- [ ] Update RLS policies for user-specific access
- [ ] Test backup/restore process
- [ ] Document admin procedures

---

## Verification Checklist

After completing all phases, verify:

- [ ] App loads without errors
- [ ] Data syncs to Supabase automatically
- [ ] Offline mode works (queue operations)
- [ ] Online sync resumes automatically
- [ ] Multi-device realtime sync works
- [ ] All 10 data types sync correctly
- [ ] No console errors
- [ ] UI updates instantly (optimistic)
- [ ] Background sync doesn't block UI
- [ ] Failed operations retry automatically
- [ ] Backend health check passes
- [ ] Frontend loads from CDN
- [ ] Database queries are fast (<500ms)

---

## Troubleshooting

If something doesn't work:

1. **Check console logs** - Look for error messages
2. **Verify config** - Check `js/config/sync-config.js` has correct values
3. **Check network** - Ensure you're online for sync
4. **Test Supabase** - Visit Supabase dashboard, check tables
5. **Test backend** - Visit `/health` endpoint
6. **Check sync status** - Run `window.getSyncStatus()`
7. **Review guides** - See `SUPABASE_DEPLOYMENT.md`

---

## Success Criteria

✅ Migration is successful when:
- All data syncs to Supabase
- Offline mode works seamlessly
- Multi-device sync functions correctly
- No data loss occurs
- App performance remains fast

---

## Next Steps After Migration

- [ ] Monitor sync logs for 1 week
- [ ] Check Supabase usage (stay within free tier)
- [ ] Setup automated alerts for errors
- [ ] Train staff on new features
- [ ] Plan for authentication implementation
- [ ] Consider mobile app development
- [ ] Setup analytics/usage tracking

---

**Estimated Total Time:**
- Basic setup: 30 minutes
- Full deployment: 2 hours
- Production ready: 4 hours

**Difficulty Level:** ⭐⭐☆☆☆ (Easy-Medium)
