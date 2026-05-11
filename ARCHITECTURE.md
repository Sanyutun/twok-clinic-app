# TWOK Clinic App - Architecture Overview

## Before: Local-Only Architecture

```
┌─────────────────────────────────────┐
│         USER'S BROWSER              │
│                                     │
│  ┌───────────────────────────┐     │
│  │  index.html               │     │
│  │  ├─ script.js (UI Logic)  │     │
│  │  └─ indexeddb.js          │     │
│  └───────────┬───────────────┘     │
│              ↓                      │
│  ┌───────────────────────────┐     │
│  │  IndexedDB (Local Only)   │     │
│  │  - 10 Object Stores       │     │
│  │  - No Sync                │     │
│  │  - Single Device          │     │
│  └───────────────────────────┘     │
│                                     │
│  ❌ Limitations:                    │
│  - Data locked to one device        │
│  - No backup                        │
│  - Can't share between clinics      │
└─────────────────────────────────────┘
```

## After: Supabase-Powered Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                         │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  Frontend App                                   │     │
│  │  ├─ script.js (UI - Unchanged)                 │     │
│  │  ├─ js/sync/DataLayer.js                       │     │
│  │  ├─ js/sync/SyncManager.js                     │     │
│  │  ├─ js/sync/SupabaseClient.js                  │     │
│  │  └─ js/sync/init-sync.js                       │     │
│  └────────────────┬───────────────────────────────┘     │
│                   ↓                                       │
│  ┌────────────────────────────────────────────────┐     │
│  │  Dual Storage Layer                             │     │
│  │                                                 │     │
│  │  ┌──────────────────┐    ┌──────────────────┐  │     │
│  │  │  IndexedDB       │    │  Sync Queue      │  │     │
│  │  │  (Local Cache)   │    │  (Pending Ops)   │  │     │
│  │  │                  │    │                  │  │     │
│  │  │  ✅ Fast access  │    │  ✅ Offline mode │  │     │
│  │  │  ✅ Works offline│    │  ✅ Auto-retry   │  │     │
│  │  └──────────────────┘    └──────────────────┘  │     │
│  └────────────────────────────────────────────────┘     │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Online Connection
                   │ (REST API + WebSockets)
                   ↓
┌──────────────────────────────────────────────────────────┐
│              RENDER (Backend Server)                      │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  server/index.js                                │     │
│  │                                                 │     │
│  │  ┌───────────────────┐     ┌────────────────┐  │     │
│  │  │  Express REST API │     │  WebSocket     │  │     │
│  │  │                   │     │  Server        │  │     │
│  │  │  /api/patients    │     │                │  │     │
│  │  │  /api/doctors     │     │  Real-time     │  │     │
│  │  │  /api/...         │     │  Broadcast     │  │     │
│  │  │  /api/sync        │     │                │  │     │
│  │  └───────────────────┘     └────────────────┘  │     │
│  └────────────────────────────────────────────────┘     │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Supabase Client
                   ↓
┌──────────────────────────────────────────────────────────┐
│            SUPABASE (Cloud Database)                      │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  PostgreSQL Database                            │     │
│  │                                                 │     │
│  │  📊 Tables:                                     │     │
│  │  ├─ patients          (with RLS)               │     │
│  │  ├─ doctors           (with RLS)               │     │
│  │  ├─ appointments      (with RLS)               │     │
│  │  ├─ instructions      (with RLS)               │     │
│  │  ├─ expenses          (with RLS)               │     │
│  │  ├─ expense_categories                         │     │
│  │  ├─ lab_records         (with RLS)             │     │
│  │  ├─ addresses                                   │     │
│  │  ├─ specialities                                │     │
│  │  └─ hospitals                                   │     │
│  │                                                 │     │
│  │  ⚡ Features:                                    │     │
│  │  ├─ Realtime Subscriptions                     │     │
│  │  ├─ Row Level Security                         │     │
│  │  ├─ Auto-backups                               │     │
│  │  └─ REST API (built-in)                        │     │
│  └────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow Scenarios

### Scenario 1: Add Patient (Online)

```
User clicks "Save Patient"
         ↓
script.js calls DataLayer.saveWithSync()
         ↓
┌─────────────────────────────────────────┐
│ 1. Save to IndexedDB (instant)          │
│ 2. Update window.patients array         │
│ 3. Re-render patient table              │
│ 4. Queue operation for sync             │
└────────────────┬────────────────────────┘
                 ↓
SyncManager detects online status
         ↓
POST /api/patients → Render Backend
         ↓
Backend inserts into Supabase
         ↓
Supabase broadcasts via Realtime
         ↓
All connected devices receive update
         ↓
Other browsers auto-refresh patient table
```

### Scenario 2: Add Patient (Offline)

```
User clicks "Save Patient" (offline)
         ↓
script.js calls DataLayer.saveWithSync()
         ↓
┌─────────────────────────────────────────┐
│ 1. Save to IndexedDB (instant) ✅       │
│ 2. Update window.patients array ✅      │
│ 3. Re-render patient table ✅           │
│ 4. Queue operation (retry count: 0) ⏳  │
└─────────────────────────────────────────┘
         ↓
SyncManager detects offline status
         ↓
Operation stays in queue
         ↓
User continues working (UI is responsive)
         ↓
... time passes ...
         ↓
User comes back online
         ↓
SyncManager detects online event
         ↓
POST /api/patients → Supabase
         ↓
Queue cleared ✅
```

### Scenario 3: Multi-Device Sync

```
Device A                     Supabase                  Device B
   │                             │                         │
   │  Add appointment            │                         │
   ├────────────────────────────>│                         │
   │                             │                         │
   │  Save to IndexedDB          │                         │
   │  Queue for sync             │                         │
   │                             │                         │
   ├────────────────────────────>│                         │
   │  POST /api/appointments     │                         │
   │                             │                         │
   │                             │  Insert record           │
   │                             │                         │
   │                             │  Realtime broadcast ────┼───>
   │                             │                         │
   │                             │                    Receive event
   │                             │                    Update IndexedDB
   │                             │                    Re-render UI
   │                             │                         │
   │  ✅ Confirmed               │                    ✅ Auto-updated
```

---

## Sync Status States

```
┌─────────────────────────────────────────────────────┐
│                  Sync States                         │
└─────────────────────────────────────────────────────┘

Online & Synced
┌──────────────────────────────────────┐
│ ✅ All data synced to cloud          │
│ 🌐 Connected to backend              │
│ 📡 Realtime active                   │
│ Queue: 0 operations                  │
└──────────────────────────────────────┘

Online & Syncing
┌──────────────────────────────────────┐
│ 🔄 Syncing 5 queued operations       │
│ 🌐 Connected to backend              │
│ ⏳ Waiting for server response       │
│ Queue: 5 operations (in progress)    │
└──────────────────────────────────────┘

Offline
┌──────────────────────────────────────┐
│ 📴 Offline - working locally         │
│ ✅ All changes saved to IndexedDB    │
│ ⏳ 12 operations queued for sync     │
│ Queue: 12 operations (pending)       │
└──────────────────────────────────────┘

Sync Error
┌──────────────────────────────────────┐
│ ❌ Sync failed (retry 3/10)          │
│ 🌐 Connection timeout                │
│ ⚠️ Will retry in 5 seconds           │
│ Queue: 8 operations (with errors)    │
└──────────────────────────────────────┘
```

---

## Database Schema Relationships

```
patients ────────< appointments >──────── doctors
     │                    │                    │
     │                    │                    │
     └──────< instructions >───────────────────┘
     │                    │
     │                    │
     └──────< expenses >──┘
                          │
                          │
               expense_categories

lab_records ────> patients
               ────> doctors
```

---

## Key Components Explained

### DataLayer.js
**Purpose**: Bridge between IndexedDB and Supabase
- Manages local IndexedDB operations
- Coordinates with SyncManager for cloud sync
- Handles realtime event updates
- Maintains in-memory arrays for fast UI rendering

### SyncManager.js
**Purpose**: Offline-first sync engine
- Queues operations when offline
- Syncs automatically when online
- Retries failed operations (max 10 times)
- Periodic sync every 5 seconds
- Network status detection

### SupabaseClient.js
**Purpose**: Frontend Supabase integration
- Direct Supabase API calls
- Realtime subscriptions
- Query helpers
- Authentication support

### server/index.js
**Purpose**: Backend API server
- REST API for all CRUD operations
- WebSocket server for TV displays
- Batch sync endpoint
- Server-side Supabase client
- CORS and security

---

## Performance Characteristics

| Operation | Local (IndexedDB) | Cloud (Supabase) | Combined |
|-----------|-------------------|------------------|----------|
| Read | ~5ms | ~100-500ms | ~5ms (cached) |
| Write | ~10ms | ~200-800ms | ~10ms + async sync |
| Delete | ~5ms | ~100-300ms | ~5ms + async sync |
| Sync N/A | N/A | N/A | ~500ms-2s (batch) |

**User Experience**: Instant UI response + background sync

---

## Security Model

```
┌─────────────────────────────────────────┐
│  Current (No Auth)                      │
│  - RLS policies: Allow all access       │
│  - Suitable for single-user/trusted net │
│  - Data protected by Supabase URL obs-  │
│    curity (not recommended for public)  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Future (With Auth) - Optional          │
│  - Supabase Auth (email/password)       │
│  - RLS policies: User-specific access   │
│  - JWT tokens for API authentication    │
│  - Multi-tenant support                 │
└─────────────────────────────────────────┘
```

---

## Scaling Limits

| Component | Free Tier | Pro Tier |
|-----------|-----------|----------|
| Database Size | 500 MB | 8 GB+ |
| Monthly Transfers | 2 GB | 50 GB+ |
| Realtime Connections | 200 | 5,000+ |
| API Requests | Unlimited | Unlimited |
| Render Backend | 750 hrs/mo | Unlimited |
| Render Frontend | 100 GB bandwidth | 500 GB+ |

**Expected Capacity**: ~500-1000 patients per month on free tier
