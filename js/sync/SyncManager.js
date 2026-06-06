/**
 * SyncManager - Offline-first sync engine
 * Manages operation queue, conflict resolution, and background sync
 */

console.log('[SyncManager.js] Script loading...');

class TWOKSyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.syncQueue = [];
        this.consecutiveFailures = 0;
        this.currentInterval = 120000;
        this.SYNC_INTERVAL = 120000; // 2 minutes
        this.MAX_RETRIES = 3; // Max immediate retries
        this.MAX_INTERVAL = 600000; // 10 minutes max backoff
        this.syncTimer = null;
        this.listeners = [];

        // Initialize
        this.init();
    }

    init() {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        this.loadQueue();
    }

    handleOnline() {
        this.isOnline = true;
        console.log('[SyncManager] 🌐 Back online!');
        // Reset retry counts when coming back online
        this.syncQueue.forEach(op => op.attempts = 0);
        this.saveQueue();
        
        this.sync();
        this.startPeriodicSync();
        this.notifyListeners('connection-change', { online: true });
    }

    handleOffline() {
        this.isOnline = false;
        console.log('[SyncManager] 📴 Went offline');
        this.stopPeriodicSync();
        this.notifyListeners('connection-change', { online: false });
    }

    loadQueue() {
        const savedQueue = localStorage.getItem('sync_queue');
        if (savedQueue) {
            try {
                this.syncQueue = JSON.parse(savedQueue);
                console.log(`[SyncManager] Loaded ${this.syncQueue.length} queued operations`);
            } catch (e) {
                console.error('[SyncManager] Failed to load queue:', e);
            }
        }
    }

    saveQueue() {
        try {
            localStorage.setItem('sync_queue', JSON.stringify(this.syncQueue));
        } catch (e) {
            console.error('[SyncManager] Failed to save queue:', e);
        }
    }

    queue(operation) {
        // Simple deduplication for updates/deletes on same ID
        if (operation.operation === 'update' || operation.operation === 'delete' || operation.operation === 'upsert') {
            this.syncQueue = this.syncQueue.filter(op => !(op.table === operation.table && op.id === operation.id));
        }
        
        // Add retry tracking if not present
        if (operation.attempts === undefined) {
            operation.attempts = 0;
        }

        this.syncQueue.push(operation);
        this.saveQueue();
        console.log(`[SyncManager] Queued: ${operation.operation} on ${operation.table} (Attempt ${operation.attempts})`, operation);
        
        // Only try to sync if it hasn't exceeded max retries
        if (operation.attempts < this.MAX_RETRIES) {
            this.sync();
        } else {
            console.log(`[SyncManager] Max retries reached for ${operation.table}:${operation.id}. Waiting for manual sync.`);
        }
    }

    /**
     * Check if a specific record is pending in the sync queue
     */
    isPending(table, id) {
        return this.syncQueue.some(op => {
            const opTable = this.mapTableToSupabase(op.table);
            const targetTable = this.mapTableToSupabase(table);
            return opTable === targetTable && op.id === id;
        });
    }

    /**
     * Trigger sync process
     */
    async sync() {
        if (!this.isOnline || this.isSyncing) return;
        
        // Filter for items that haven't exceeded retry limit
        const pendings = this.syncQueue.filter(op => op.attempts < this.MAX_RETRIES);
        if (pendings.length === 0) return;

        try {
            await this.flushQueue();
        } catch (error) {
            console.error('[SyncManager] Sync failed:', error);
        }
    }

    /**
     * Force a full data refresh from Supabase
     */
    async pullAll(silent = false) {
        if (!this.isOnline) {
            console.log('[SyncManager] Cannot pull all: Offline');
            if (!silent) throw new Error('You are currently offline. Please connect to the internet to sync.');
            return;
        }

        console.log('[SyncManager] Pulling all data from Supabase...');
        this.notifyListeners('sync_started', { status: 'full_pull' });

        try {
            // When user clicks Sync Button (which calls pullAll), we reset all retry counts
            this.syncQueue.forEach(op => op.attempts = 0);
            this.saveQueue();

            if (typeof window.DataLayer.syncFromSupabase === 'function') {
                await window.DataLayer.syncFromSupabase(silent);
                console.log('[SyncManager] Full pull successful');
                this.notifyListeners('sync_completed', { status: 'full_pull_complete' });
            }
        } catch (error) {
            console.error('[SyncManager] Full pull failed:', error);
            if (!silent && window.showNotification) {
                window.showNotification('Pull failed: ' + error.message, 'error');
            }
            this.notifyListeners('sync_error', { error: error.message });
            if (!silent) throw error;
        }
    }

    /**
     * Manual sync: Flushes the entire queue to Supabase
     */
    async flushQueue() {
        if (this.isSyncing) {
            // Wait for current sync to finish if it's already in progress
            let attempts = 0;
            while (this.isSyncing && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            if (this.isSyncing) return { synced: 0, error: 'Sync already in progress' };
        }

        if (this.syncQueue.length === 0) {
            return { synced: 0 };
        }

        if (!this.isOnline) {
            console.log('[SyncManager] Sync deferred: Offline');
            throw new Error('Connection lost. Please check your internet connection and try again.');
        }

        // Only sync items that haven't failed too many times
        // UNLESS this is a manual trigger (e.g. from Sync button or pullAll)
        const isManualTrigger = this.consecutiveFailures === 0 || this.syncQueue.some(op => op.attempts === 0);
        const opsToSync = this.syncQueue.filter(op => isManualTrigger || op.attempts < this.MAX_RETRIES);

        if (opsToSync.length === 0) {
            return { synced: 0 };
        }

        this.isSyncing = true;
        this.notifyListeners('sync_started', { queueLength: opsToSync.length });

        try {
            // Sort operations by priority to avoid foreign key violations
            const sortedOps = this.sortOperations(opsToSync);

            // Increment attempt count
            sortedOps.forEach(op => op.attempts = (op.attempts || 0) + 1);
            this.saveQueue();

            console.log(`[SyncManager] Flushing ${sortedOps.length} operations to /api/sync`);
            
            // Map operations and filter out those that shouldn't be synced (mapped to null)
            const mappedOperations = sortedOps
                .map(op => ({
                    table: this.mapTableToSupabase(op.table),
                    operation: op.operation,
                    data: op.data,
                    id: op.id
                }))
                .filter(op => op.table !== null);

            if (mappedOperations.length === 0) {
                console.log('[SyncManager] No valid clinical operations to sync after filtering meta-stores');
                // Consider these operations "completed" locally
                this.syncQueue = this.syncQueue.filter(op => !sortedOps.includes(op));
                this.saveQueue();
                this.isSyncing = false;
                return { synced: 0 };
            }

            const response = await fetch(`${this.getApiUrl()}/api/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operations: mappedOperations
                })
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: 'Unknown server error' };
                }
                console.error('[SyncManager] Server error details:', errorData);
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                console.log(`[SyncManager] ✅ Synced ${sortedOps.length} operations`);
                
                // Clear successfully synced operations
                this.syncQueue = this.syncQueue.filter(op => !sortedOps.includes(op));
                this.saveQueue();
                
                this.consecutiveFailures = 0;
                this.currentInterval = this.SYNC_INTERVAL;
                this.startPeriodicSync(); 

                this.notifyListeners('sync_completed', { synced: sortedOps.length });
                this.isSyncing = false; 

                if (this.syncQueue.length > 0 && this.syncQueue.some(op => op.attempts < this.MAX_RETRIES)) {
                    setTimeout(() => this.sync(), 1000);
                }

                return { synced: sortedOps.length };
            } else {
                throw new Error(result.error || 'Sync returned error');
            }
        } catch (error) {
            this.isSyncing = false;
            console.error('[SyncManager] ❌ Sync failed:', error);
            
            this.consecutiveFailures++;
            this.currentInterval = Math.min(this.SYNC_INTERVAL * Math.pow(2, this.consecutiveFailures), this.MAX_INTERVAL);
            
            if (this.isOnline) {
                this.startPeriodicSync();
            }

            // ONLY show notification if it's the first failure
            if (this.consecutiveFailures === 1 && window.showNotification) {
                window.showNotification('Sync is struggling, items queued.', 'warning');
            }
            
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sort operations to respect foreign key constraints
     */
    sortOperations(ops) {
        const TABLE_PRIORITY = {
            'patients': 10,
            'doctors': 10,
            'expense_categories': 10,
            'addresses': 10,
            'specialities': 10,
            'hospitals': 10,
            'settings': 10,
            'appointments': 20,
            'expenses': 30,
            'instructions': 30,
            'lab_records': 40
        };

        return [...ops].sort((a, b) => {
            const priorityA = TABLE_PRIORITY[a.table] || 99;
            const priorityB = TABLE_PRIORITY[b.table] || 99;
            
            const isDeleteA = a.operation === 'delete';
            const isDeleteB = b.operation === 'delete';

            // Upserts come before deletes
            if (isDeleteA && !isDeleteB) return 1;
            if (!isDeleteA && isDeleteB) return -1;
            
            if (!isDeleteA && !isDeleteB) {
                // Both are upserts: Ascending priority (parents first)
                return priorityA - priorityB;
            } else {
                // Both are deletes: Descending priority (children first)
                return priorityB - priorityA;
            }
        });
    }

    /**
     * Sync a single record immediately
     */
    async syncNow(table, operation, data, id) {
        if (!this.isOnline) {
            this.queue({ table, operation, data, id });
            return;
        }

        try {
            const supabaseTable = this.mapTableToSupabase(table);
            const endpoint = id ? `/api/${supabaseTable}/${id}` : `/api/${supabaseTable}`;
            const method = operation === 'delete' ? 'DELETE' : (operation === 'insert' || operation === 'upsert' ? 'POST' : 'PUT');

            const response = await fetch(`${this.getApiUrl()}${endpoint}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: operation !== 'delete' ? JSON.stringify(data) : undefined
            });

            if (!response.ok) {
                throw new Error(`Status ${response.status}`);
            }

            const result = await response.json();
            console.log(`[SyncManager] ✅ Immediate sync successful: ${operation} on ${table}`);
            return result;
        } catch (error) {
            console.warn(`[SyncManager] Immediate sync failed for ${table}, queuing...`, error);
            // Queue it with 1 attempt already used
            this.queue({ table, operation, data, id, attempts: 1 });
            throw error;
        }
    }

    // ==========================================
    // PERIODIC SYNC
    // ==========================================
    startPeriodicSync() {
        this.stopPeriodicSync(); // Clear existing timer
        
        if (!this.isOnline) {
            console.log('[SyncManager] Periodic sync suspended (offline)');
            return;
        }

        this.syncTimer = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                // Bi-directional sync: pull updates from Supabase AND push queued changes
                this.pullAll(true);
            }
        }, this.currentInterval);

        console.log('[SyncManager] Periodic sync active (interval:', this.currentInterval / 1000, 'seconds)');
    }

    stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
            console.log('[SyncManager] Periodic sync stopped');
        }
    }

    getQueueLength() {
        return this.syncQueue.length;
    }

    // ==========================================
    // HELPERS
    // ==========================================
    getApiUrl() {
        // Use environment variable or default to current origin
        return window.TWOK_API_URL || window.location.origin;
    }

    mapTableToSupabase(localTable) {
        // Map local table names to Supabase table names
        const mapping = {
            'patients': 'patients',
            'doctors': 'doctors',
            'appointments': 'appointments',
            'instructions': 'instructions',
            'expenses': 'expenses',
            'expense_categories': 'expense_categories',
            'lab_tracker': 'lab_records',
            'lab_records': 'lab_records',
            'addresses': 'addresses',
            'specialities': 'specialities',
            'hospitals': 'hospitals',
            'settings': 'settings'
        };
        
        // Explicitly exclude internal/meta stores from cloud sync
        const internalStores = ['syncMeta', 'lab_records_migrated'];
        if (internalStores.includes(localTable)) {
            return null;
        }

        return mapping[localTable] || localTable;
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    addListener(callback) {
        this.listeners.push(callback);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                console.error('[SyncManager] Listener error:', error);
            }
        });
    }

    // ==========================================
    // STATUS
    // ==========================================
    getStatus() {
        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            queueLength: this.syncQueue.length,
            queue: [...this.syncQueue]
        };
    }
}

// Export singleton instance
console.log('[SyncManager] Initializing singleton...');
const twokSyncManager = new TWOKSyncManager();

// Primary export
window.twokSyncManager = twokSyncManager;

// Backward compatibility (with conflict protection)
try {
    // Only overwrite if it's not the native browser SyncManager or if it's undefined
    if (!window.SyncManager || (typeof window.SyncManager === 'function' && !window.SyncManager.prototype.pullAll)) {
        window.SyncManager = twokSyncManager;
        console.log('[SyncManager] Singleton registered as window.SyncManager');
    }
} catch (e) {
    console.warn('[SyncManager] Could not set window.SyncManager (likely a browser conflict):', e);
}

console.log('[SyncManager] Singleton registered as window.twokSyncManager:', window.twokSyncManager);
