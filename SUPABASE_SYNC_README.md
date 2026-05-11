# Supabase Sync Integration for TWOK Clinic

> Transform your offline clinic app into a cloud-powered, multi-device system with automatic sync.

## 🚀 Quick Start

Get up and running in **15 minutes**:

1. [Create Supabase account](https://supabase.com)
2. [Follow QUICK_START_SUPABASE.md](QUICK_START_SUPABASE.md)
3. Test in browser
4. Done! ✅

## 📚 Documentation

| Document | Purpose | Time |
|----------|---------|------|
| [QUICK_START_SUPABASE.md](QUICK_START_SUPABASE.md) | Get running fast | 15 min |
| [SUPABASE_DEPLOYMENT.md](SUPABASE_DEPLOYMENT.md) | Full deployment guide | 2 hrs |
| [SUPABASE_MIGRATION.md](SUPABASE_MIGRATION.md) | Architecture overview | Read |
| [MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md) | Track progress | Use |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical details | Read |

## ✨ Features

- ✅ **Offline-First**: Works without internet
- ✅ **Auto-Sync**: Syncs automatically when online
- ✅ **Realtime**: Multi-device live updates
- ✅ **Fast**: Instant UI with background sync
- ✅ **Reliable**: Queue with retry logic
- ✅ **Scalable**: Supabase handles millions of records
- ✅ **Free**: Supabase free tier is enough for most clinics

## 🏗️ Architecture

```
Browser (IndexedDB) ←→ Backend (Render) ←→ Database (Supabase)
     ↓                                           ↑
     └────────── Realtime Sync ──────────────────┘
```

**Key Components:**
- `js/sync/DataLayer.js` - Data integration layer
- `js/sync/SyncManager.js` - Offline-first sync engine
- `js/sync/SupabaseClient.js` - Supabase client
- `server/index.js` - Backend API server

## 🎯 What You Get

### Before (Local Only)
```
Device 1: [Data stored locally]
Device 2: [No data]
Device 3: [No data]

❌ Data locked to one device
❌ No backup
❌ Can't share between clinics
```

### After (Cloud Sync)
```
Device 1: ──┐
Device 2: ──┼──→ Supabase Cloud ←→ Realtime Sync
Device 3: ──┘

✅ Data synced across all devices
✅ Automatic cloud backup
✅ Access from anywhere
✅ Real-time collaboration
```

## 📦 What's Included

```
TWOK-Clinic-App/
├── server/                          # Backend API Server
│   ├── index.js                    # Express + Supabase
│   ├── package.json                # Dependencies
│   └── .env.example                # Config template
│
├── supabase/                        # Database Setup
│   └── schema.sql                  # Full schema
│
├── js/
│   ├── config/
│   │   └── sync-config.js          # Sync configuration
│   └── sync/                        # Sync Engine
│       ├── DataLayer.js            # Data integration
│       ├── SyncManager.js          # Offline-first sync
│       ├── SupabaseClient.js       # Supabase wrapper
│       └── init-sync.js            # Auto-initialization
│
└── Documentation/
    ├── QUICK_START_SUPABASE.md     # 15-min guide
    ├── SUPABASE_DEPLOYMENT.md      # Full guide
    ├── SUPABASE_MIGRATION.md       # Overview
    ├── MIGRATION_CHECKLIST.md      # Checklist
    └── ARCHITECTURE.md             # Technical details
```

## 🔧 Integration Steps

### 1. Add scripts to `index.html`
```html
<!-- Before </body> -->
<script src="js/config/sync-config.js"></script>
<script src="js/sync/SupabaseClient.js"></script>
<script src="js/sync/SyncManager.js"></script>
<script src="js/sync/DataLayer.js"></script>
<script src="js/sync/init-sync.js"></script>
```

### 2. Update config
Edit `js/config/sync-config.js`:
```javascript
SUPABASE: {
    URL: 'https://your-project.supabase.co',
    ANON_KEY: 'your-anon-key'
}
```

### 3. Test
```javascript
// In browser console
window.getSyncStatus()
// Should show: { initialized: true, supabaseConnected: true }
```

## 🎮 How It Works

### Online Flow
```
User Action → Save to IndexedDB → Update UI → Queue for Sync
                                           ↓
                                    Sync to Supabase
                                           ↓
                                 Broadcast to all devices
```

### Offline Flow
```
User Action → Save to IndexedDB → Update UI → Queue for Sync
                                           ↓
                                    Detect offline
                                           ↓
                                 Keep in queue
                                           ↓
                                 Sync when online ✅
```

## 📊 Data Models

All 10 data types are synced:
- ✅ Patients
- ✅ Doctors
- ✅ Appointments
- ✅ Instructions
- ✅ Expenses
- ✅ Expense Categories
- ✅ Lab Records
- ✅ Addresses
- ✅ Specialities
- ✅ Hospitals

## 🔒 Security

**Current Setup:**
- Row Level Security enabled
- Permissive policies (allow all)
- Suitable for trusted networks

**Optional Enhancement:**
- Add Supabase Auth
- User-specific RLS policies
- Multi-tenant support

## 💰 Pricing

**Supabase Free Tier:**
- 500 MB database
- 2 GB/month transfers
- 200 realtime connections
- Unlimited API requests

**Render Free Tier:**
- 750 hours/month backend
- 100 GB/month frontend bandwidth

**Expected Capacity:** ~500-1000 patients/month on free tier

## 🧪 Testing

### Test Offline Mode
1. DevTools → Network → Select "Offline"
2. Add/edit data
3. Switch to "Online"
4. Watch auto-sync!

### Test Multi-Device
1. Open 2 browser tabs
2. Add data in Tab 1
3. Watch Tab 2 update!

### Check Sync Status
```javascript
window.getSyncStatus()
```

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Supabase not initialized" | Check `sync-config.js` has correct URL/key |
| "CORS error" | Verify `API_URL` matches backend |
| "Data not syncing" | Check network, run `window.getSyncStatus()` |
| Console errors | Read error message, check guides |

## 📖 Full Guides

- **Quick Start**: [QUICK_START_SUPABASE.md](QUICK_START_SUPABASE.md)
- **Deployment**: [SUPABASE_DEPLOYMENT.md](SUPABASE_DEPLOYMENT.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Checklist**: [MIGRATION_CHECKLIST.md](MIGRATION_CHECKLIST.md)

## 🆘 Support

- Supabase Docs: https://supabase.com/docs
- Render Docs: https://render.com/docs
- Email: (your contact)

## 📝 License

MIT

---

**Ready to start?** → [Read QUICK_START_SUPABASE.md](QUICK_START_SUPABASE.md)
