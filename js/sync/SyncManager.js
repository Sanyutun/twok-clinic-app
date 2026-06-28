/**
 * SyncManager - Offline-first sync engine
 * Manages operation queue, conflict resolution, and background sync
 */

TWOK_LOGGER.debug('[SyncManager.js] Script loading...');

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
        window.addEventListener('beforeunload', () => this.flushSaveQueue());
        this.loadQueue();
    }

    handleOnline() {
        this.isOnline = true;
        TWOK_LOGGER.sync('🌐 Back online!');
        // Reset retry counts when coming back online
        this.syncQueue.forEach(op => op.attempts = 0);
        this.flushSaveQueue();
        
        this.sync();
        this.startPeriodicSync();
        this.notifyListeners('connection-change', { online: true });
    }

    handleOffline() {
        this.isOnline = false;
        TWOK_LOGGER.sync('[SyncManager] 📴 Went offline');
        this.stopPeriodicSync();
        this.notifyListeners('connection-change', { online: false });
    }

    loadQueue() {
        const savedQueue = localStorage.getItem('sync_queue');
        if (savedQueue) {
            try {
                this.syncQueue = JSON.parse(savedQueue);
                TWOK_LOGGER.sync(`[SyncManager] Loaded ${this.syncQueue.length} queued operations`);
            } catch (e) {
                TWOK_LOGGER.error('[SyncManager] Failed to load queue:', e);
            }
        }
    }

    /**
     * Debounced save to localStorage
     */
    saveQueue() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flushSaveQueue(), 100);
    }

    /**
     * Immediately save queue to localStorage
     */
    flushSaveQueue() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        try {
            localStorage.setItem('sync_queue', JSON.stringify(this.syncQueue));
        } catch (e) {
            TWOK_LOGGER.error('[SyncManager] Failed to save queue:', e);
        }
    }

    /**
     * Queue multiple operations at once to minimize disk I/O and overhead
     * @param {Array<Object>} operations 
     */
    bulkQueue(operations) {
        if (!operations || operations.length === 0) return;

        // 1. Deduplicate: Identify IDs being updated in this batch
        const incomingIds = new Set();
        operations.forEach(op => {
            if (op.operation === 'update' || op.operation === 'delete' || op.operation === 'upsert') {
                incomingIds.add(`${op.table}:${op.id}`);
            }
        });

        // 2. Remove any existing pending operations for these IDs
        if (incomingIds.size > 0) {
            const initialLen = this.syncQueue.length;
            this.syncQueue = this.syncQueue.filter(op => !incomingIds.has(`${op.table}:${op.id}`));
            if (this.syncQueue.length < initialLen) {
                TWOK_LOGGER.sync(`[SyncManager] Deduplicated ${initialLen - this.syncQueue.length} operations from queue`);
            }
        }

        // 3. Add new operations
        operations.forEach(operation => {
            if (operation.attempts === undefined) {
                operation.attempts = 0;
            }
            this.syncQueue.push(operation);
        });

        // 4. Save and trigger sync
        this.saveQueue();
        
        TWOK_LOGGER.sync(`[SyncManager] Bulk Queued: ${operations.length} operations. Total queue: ${this.syncQueue.length}`);
        
        // Try to sync if any operation is fresh
        if (operations.some(op => op.attempts < this.MAX_RETRIES)) {
            this.sync();
        }
    }

    queue(operation) {
        // Simple deduplication for updates/deletes on same ID
        if (operation.operation === 'update' || operation.operation === 'delete' || operation.operation === 'upsert') {
            const initialLen = this.syncQueue.length;
            this.syncQueue = this.syncQueue.filter(op => !(op.table === operation.table && op.id === operation.id));
            if (this.syncQueue.length < initialLen) {
                TWOK_LOGGER.debug(`[SyncManager] Deduplicated existing operation for ${operation.table}:${operation.id}`);
            }
        }
        
        // Add retry tracking if not present
        if (operation.attempts === undefined) {
            operation.attempts = 0;
        }

        this.syncQueue.push(operation);
        this.saveQueue();
        TWOK_LOGGER.sync(`[SyncManager] Queued: ${operation.operation} on ${operation.table} (Attempt ${operation.attempts})`, operation);
        
        // Only try to sync if it hasn't exceeded max retries
        if (operation.attempts < this.MAX_RETRIES) {
            this.sync();
        } else {
            TWOK_LOGGER.sync(`[SyncManager] Max retries reached for ${operation.table}:${operation.id}. Waiting for manual sync.`);
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
            TWOK_LOGGER.error('[SyncManager] Sync failed:', error);
        }
    }

    /**
     * Force a full data refresh from Supabase
     */
    async pullAll(silent = false) {
        if (!this.isOnline) {
            TWOK_LOGGER.sync('[SyncManager] Cannot pull all: Offline');
            if (!silent) throw new Error('You are currently offline. Please connect to the internet to sync.');
            return;
        }

        TWOK_LOGGER.sync('[SyncManager] Pulling all data from Supabase...');
        this.notifyListeners('sync_started', { status: 'full_pull' });

        try {
            // When user clicks Sync Button (which calls pullAll), we reset all retry counts
            this.syncQueue.forEach(op => op.attempts = 0);
            this.saveQueue();

            if (typeof window.DataLayer.syncFromSupabase === 'function') {
                await window.DataLayer.syncFromSupabase(silent);
                TWOK_LOGGER.sync('[SyncManager] Full pull successful');
                this.notifyListeners('sync_completed', { status: 'full_pull_complete' });
            }
        } catch (error) {
            TWOK_LOGGER.error('[SyncManager] Full pull failed:', error);
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
            TWOK_LOGGER.sync('[SyncManager] Sync deferred: Offline');
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

            TWOK_LOGGER.sync(`[SyncManager] Flushing ${sortedOps.length} operations to /api/sync`);
            
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
                TWOK_LOGGER.sync('[SyncManager] No valid clinical operations to sync after filtering meta-stores');
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
                    operations: mappedOperations,
                    senderId: window.myClientId || window.clientId || (typeof myClientId !== 'undefined' ? myClientId : null)
                })
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: 'Unknown server error' };
                }
                TWOK_LOGGER.error('[SyncManager] Server error details:', errorData);
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                TWOK_LOGGER.sync(`[SyncManager] ✅ Synced ${sortedOps.length} operations`);
                
                // Clear successfully synced operations
                this.syncQueue = this.syncQueue.filter(op => !sortedOps.includes(op));
                this.saveQueue();
                
                this.consecutiveFailures = 0;
                this.currentInterval = this.SYNC_INTERVAL;
                this.startPeriodicSync(); 

                this.notifyListeners('sync_completed', { synced: sortedOps.length });
                this.isSyncing = false; 

                if (this.syncQueue.length > 0 && this.syncQueue.some(op => op.attempts < this.MAX_RETRIES)) {
                    setTimeout(() => this.sync(), 0);
                }

                return { synced: sortedOps.length };
            } else {
                throw new Error(result.error || 'Sync returned error');
            }
        } catch (error) {
            this.isSyncing = false;
            TWOK_LOGGER.error('[SyncManager] ❌ Sync failed:', error);
            
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
            TWOK_LOGGER.sync(`[SyncManager] ✅ Immediate sync successful: ${operation} on ${table}`);
            return result;
        } catch (error) {
            TWOK_LOGGER.warn(`[SyncManager] Immediate sync failed for ${table}, queuing...`, error);
            // Queue it with 1 attempt already used
            this.queue({ table, operation, data, id, attempts: 1 });
            throw error;
        }
    }

    // ==========================================
    // PERIODIC SYNC (DISABLED - Using Event-Driven & Visibility-Based Sync)
    // ==========================================
    startPeriodicSync() {
        this.stopPeriodicSync(); // Clear existing timer
        
        if (!this.isOnline) {
            TWOK_LOGGER.sync('[SyncManager] Sync suspended (offline)');
            return;
        }

        // We disable polling because we use Realtime + WebSockets + Visibility changes
        // This makes the app much more efficient.
        TWOK_LOGGER.sync('[SyncManager] Event-driven sync active (Polling disabled)');
        
        // Setup visibility listener if not already done
        if (!this.visibilityListenerAdded) {
            // FIX: Only pull when tab becomes visible IF enough time has passed.
            // Prevents hammering Supabase with full re-fetches on every alt-tab.
            const VISIBILITY_PULL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.isOnline) {
                    const now = Date.now();
                    const lastPull = this._lastVisibilityPull || 0;
                    if (now - lastPull < VISIBILITY_PULL_COOLDOWN_MS) {
                        TWOK_LOGGER.sync(`[SyncManager] Tab visible: skipping pull (last pull was ${Math.round((now - lastPull) / 1000)}s ago, cooldown is ${VISIBILITY_PULL_COOLDOWN_MS / 1000}s)`);
                        return;
                    }
                    this._lastVisibilityPull = now;
                    TWOK_LOGGER.sync('[SyncManager] Tab visible: triggering pull-to-refresh (cooldown passed)');
                    this.pullAll(true);
                }
            });
            this.visibilityListenerAdded = true;
        }
    }

    stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
            TWOK_LOGGER.sync('[SyncManager] Periodic sync stopped');
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
                TWOK_LOGGER.error('[SyncManager] Listener error:', error);
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
TWOK_LOGGER.debug('[SyncManager] Initializing singleton...');
const twokSyncManager = new TWOKSyncManager();

// Primary export
window.twokSyncManager = twokSyncManager;

// Backward compatibility (with conflict protection)
try {
    // Only overwrite if it's not the native browser SyncManager or if it's undefined
    if (!window.SyncManager || (typeof window.SyncManager === 'function' && !window.SyncManager.prototype.pullAll)) {
        window.SyncManager = twokSyncManager;
        TWOK_LOGGER.info('[SyncManager] Singleton registered as window.SyncManager');
    }
} catch (e) {
    TWOK_LOGGER.warn('[SyncManager] Could not set window.SyncManager (likely a browser conflict):', e);
}

TWOK_LOGGER.info('[SyncManager] Singleton registered as window.twokSyncManager:', window.twokSyncManager);
