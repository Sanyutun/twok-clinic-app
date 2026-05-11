# TWOK Clinic App - Supabase + Render Deployment Guide

## Overview
This guide will help you deploy the TWOK Clinic App with:
- **Supabase** as the cloud database
- **Render** as the hosting platform (frontend + backend)
- **Offline-first architecture** with automatic sync

---

## Step 1: Setup Supabase Project

### 1.1 Create Supabase Account
1. Go to [https://supabase.com](https://supabase.com)
2. Sign up for a free account
3. Create a new project

### 1.2 Get Project Credentials
1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon/public key**: `eyJhbGci...` (for frontend)
   - **service_role key**: `eyJhbGci...` (for backend - keep secret!)

### 1.3 Run Database Schema
1. Go to **SQL Editor** in Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste and click **Run**
4. Verify all 10 tables are created

### 1.4 Enable Realtime
1. Go to **Database** → **Replication**
2. Enable replication for all tables:
   - patients, doctors, appointments, instructions
   - expenses, expense_categories, lab_records
   - addresses, specialities, hospitals

---

## Step 2: Deploy Backend to Render

### 2.1 Prepare Backend
1. Create a `.env` file in the `server/` directory:
   ```bash
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   NODE_ENV=production
   PORT=3000
   ```

2. Test locally:
   ```bash
   cd server
   npm install
   npm start
   ```
   
3. Visit `http://localhost:3000/health` - should show `{"status":"ok"}`

### 2.2 Deploy to Render
1. Push your code to GitHub
2. Go to [https://render.com](https://render.com)
3. Sign up/Login
4. Click **New +** → **Web Service**
5. Connect your GitHub repository
6. Configure:
   - **Name**: `twok-clinic-backend`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

7. Add Environment Variables:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   NODE_ENV=production
   ```

8. Click **Create Web Service**
9. Wait for deployment (5-10 minutes)
10. Copy your backend URL: `https://twok-clinic-backend-xxxx.onrender.com`

---

## Step 3: Deploy Frontend to Render

### 3.1 Update Frontend Config
Edit `js/config/sync-config.js`:
```javascript
window.TWOK_CONFIG = {
    SUPABASE: {
        URL: 'https://your-project-id.supabase.co',
        ANON_KEY: 'your-anon-key-here',
        SERVICE_ROLE_KEY: 'your-service-role-key-here'
    },
    
    API_URL: 'https://twok-clinic-backend-xxxx.onrender.com', // Your backend URL
    
    SYNC: {
        INTERVAL: 5000,
        REALTIME: true,
        OFFLINE_QUEUE: true,
        MAX_RETRIES: 10
    },
    
    FEATURES: {
        CLOUD_SYNC: true,
        REALTIME_UPDATES: true,
        OFFLINE_MODE: true,
        OPTIMISTIC_UI: true
    }
};
```

### 3.2 Add Sync Scripts to index.html
Add these lines before `</body>` in `index.html`:
```html
<!-- Supabase Sync Integration -->
<script src="js/config/sync-config.js"></script>
<script src="js/sync/SupabaseClient.js"></script>
<script src="js/sync/SyncManager.js"></script>
<script src="js/sync/DataLayer.js"></script>
<script src="js/sync/init-sync.js"></script>
```

### 3.3 Deploy to Render
**Option A: Using render.yaml (Recommended)**
```bash
# From project root
git add .
git commit -m "Add Supabase sync integration"
git push origin main
```

Then on Render:
1. Click **New +** → **Blueprint**
2. Connect your repository
3. Render will auto-detect `render.yaml`
4. Click **Apply**

**Option B: Manual Static Site**
1. On Render, click **New +** → **Static Site**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `twok-clinic-frontend`
   - **Build Command**: `echo "No build step"`
   - **Publish Directory**: `.`
4. Click **Create Static Site**

---

## Step 4: Migrate Existing Data

### 4.1 Export Local Data
1. Open your app in browser (old version with local data)
2. Open browser console (F12)
3. Run:
   ```javascript
   const data = {
       patients: window.patients,
       doctors: window.doctors,
       appointments: window.appointments,
       instructions: window.instructions,
       expenses: window.expenses,
       expenseCategories: window.expenseCategories,
       labRecords: window.labRecords,
       addresses: window.addresses.map(a => ({ id: `addr_${Math.random()}`, value: a })),
       specialities: window.specialities.map(s => ({ id: `spec_${Math.random()}`, value: s })),
       hospitals: window.hospitals.map(h => ({ id: `hosp_${Math.random()}`, value: h }))
   };
   
   // Download as JSON
   const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = 'twok-clinic-backup.json';
   a.click();
   ```

### 4.2 Import to Supabase
1. Create a script `import-data.js` in `server/`:
   ```javascript
   const { createClient } = require('@supabase/supabase-js');
   const fs = require('fs');
   require('dotenv').config();

   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

   async function importData() {
       const data = JSON.parse(fs.readFileSync('../twok-clinic-backup.json', 'utf8'));
       
       // Import each table
       for (const [table, records] of Object.entries(data)) {
           if (records.length === 0) continue;
           
           console.log(`Importing ${records.length} records to ${table}...`);
           
           const { error } = await supabase.from(table).insert(records);
           if (error) {
               console.error(`Error importing ${table}:`, error);
           }
       }
       
       console.log('✅ Import complete!');
   }

   importData();
   ```

2. Run the import:
   ```bash
   cd server
   node import-data.js
   ```

---

## Step 5: Test the Deployment

### 5.1 Verify Backend
Visit: `https://your-backend-url.onrender.com/health`
Should show:
```json
{
  "status": "ok",
  "timestamp": "2026-04-15T...",
  "clients": 0
}
```

### 5.2 Test Frontend
1. Visit your frontend URL
2. Open browser console (F12)
3. Check for these messages:
   ```
   [Sync Integration] Starting initialization...
   [SupabaseClient] ✅ Initialized
   [DataLayer] ✅ Initialization complete
   [Sync Integration] ✅ Integration complete!
   ```

### 5.3 Test Sync Status
Run in console:
```javascript
window.getSyncStatus()
```

Should show:
```javascript
{
  initialized: true,
  supabaseConnected: true,
  syncManager: { isOnline: true, isSyncing: false, queueLength: 0 },
  localData: { patients: 10, doctors: 5, ... }
}
```

### 5.4 Test Offline Mode
1. Open DevTools → Network tab
2. Select **Offline** from throttling dropdown
3. Add/edit data in the app
4. Switch back to **Online**
5. Watch console logs - data should sync automatically

---

## Step 6: Setup Continuous Deployment

### 6.1 Auto-Deploy on Git Push
Render automatically deploys when you push to the connected branch:
```bash
git add .
git commit -m "Update feature"
git push origin main
```

### 6.2 Environment Variables
Keep sensitive data in Render environment variables, not in code:
- Supabase keys
- API URLs
- Feature flags

---

## Troubleshooting

### Backend won't start
```bash
# Check Render logs
# Go to your web service → Logs tab

# Test locally
cd server
npm install
npm start
```

### Frontend not syncing
1. Check browser console for errors
2. Verify `js/config/sync-config.js` has correct URLs
3. Check if Supabase project is active
4. Verify CORS settings in backend

### Data not syncing from cloud
1. Check SyncManager queue: `window.getSyncStatus().syncManager.queueLength`
2. Manually trigger sync: `window.triggerSync()`
3. Check network tab for failed requests
4. Verify Supabase RLS policies allow access

### Offline mode not working
1. Ensure IndexedDB is enabled in browser
2. Check for storage quota exceeded errors
3. Verify `OFFLINE_MODE: true` in config

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           USER'S BROWSER                     │
│  ┌─────────────────────────────────────┐    │
│  │  Frontend (index.html)              │    │
│  │  ├─ script.js (UI Logic)            │    │
│  │  └─ js/sync/                        │    │
│  │     ├─ DataLayer.js                 │    │
│  │     ├─ SyncManager.js               │    │
│  │     └─ SupabaseClient.js            │    │
│  └─────────────────────────────────────┘    │
│           ↓ ↑                                 │
│  ┌─────────────────────────────────────┐    │
│  │  IndexedDB (Local Cache)            │    │
│  └─────────────────────────────────────┘    │
└───────────┬─────────────────────────────────┘
            │ Online
            ↓ ↑
┌───────────┴─────────────────────────────────┐
│         RENDER (Backend Server)              │
│  ┌─────────────────────────────────────┐    │
│  │  server/index.js                    │    │
│  │  ├─ Express REST API                │    │
│  │  └─ WebSocket Server                │    │
│  └─────────────────────────────────────┘    │
│           ↓ ↑                                 │
└───────────┬─────────────────────────────────┘
            │
            ↓ ↑
┌───────────┴─────────────────────────────────┐
│            SUPABASE (Cloud DB)               │
│  ┌─────────────────────────────────────┐    │
│  │  PostgreSQL Database                │    │
│  │  ├─ 10 Tables                       │    │
│  │  ├─ Realtime Subscriptions          │    │
│  │  └─ Row Level Security              │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## Next Steps

1. **Add Authentication**: Enable Supabase Auth for user login
2. **Backup Strategy**: Setup automated Supabase backups
3. **Monitoring**: Add error tracking (Sentry, LogRocket)
4. **Performance**: Enable Supabase connection pooling
5. **Mobile**: Convert to PWA with service worker sync

---

## Support

- Supabase Docs: https://supabase.com/docs
- Render Docs: https://render.com/docs
- WebSocket Issues: Check `websocket-server.js` configuration
- Sync Issues: Check browser console logs
