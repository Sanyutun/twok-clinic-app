/**
 * Sync Integration Script
 * Add this to index.html before </body> to enable Supabase sync
 * 
 * USAGE:
 * 1. Update the config in js/config/sync-config.js with your Supabase credentials
 * 2. Add these script tags to index.html before </body>:
 *    <script src="js/config/sync-config.js"></script>
 *    <script src="js/sync/SupabaseClient.js"></script>
 *    <script src="js/sync/SyncManager.js"></script>
 *    <script src="js/sync/DataLayer.js"></script>
 *    <script src="js/sync/init-sync.js"></script>
 */

(async function() {
    'use strict';

    TWOK_LOGGER.sync('[Sync Integration] Starting initialization...');

    let syncDebounceTimer = null;
    let renderDebounceTimer = null;
    // FIX: Track which tables need re-rendering (only render what changed)
    let pendingRenderTables = new Set();

    /**
     * FIX: Smart debounced UI refresh - only re-renders components for tables that changed.
     * Previously this re-rendered ALL tables on any single change, causing major slowdowns.
     * @param {string|null} table - The table that changed, or null to refresh everything
     */
    function debouncedRefreshUI(table = null) {
        if (table) pendingRenderTables.add(table);
        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        renderDebounceTimer = setTimeout(() => {
            const tablesToRender = pendingRenderTables.size > 0 ? new Set(pendingRenderTables) : null;
            pendingRenderTables.clear();

            TWOK_LOGGER.debug('[Sync Integration] Smart UI refresh for tables:', tablesToRender ? [...tablesToRender] : 'ALL');

            // Table-to-render-function mapping
            const tableRenderMap = {
                'appointments': () => {
                    if (typeof window.renderAppointmentTable === 'function') window.renderAppointmentTable();
                    if (typeof window.updateQueueSummary === 'function') window.updateQueueSummary();
                },
                'expenses': () => {
                    if (typeof window.renderExpenses === 'function') window.renderExpenses();
                    if (typeof window.renderCategorySummary === 'function') window.renderCategorySummary();
                },
                'lab_records': () => {
                    if (typeof window.renderLabTracker === 'function') window.renderLabTracker();
                    if (typeof window.updatePendingResultsAlert === 'function') window.updatePendingResultsAlert();
                },
                'patients': () => {
                    if (typeof window.renderPatientTable === 'function') window.renderPatientTable();
                },
                'doctors': () => {
                    if (typeof window.renderDoctorTable === 'function') window.renderDoctorTable();
                },
                'instructions': () => {
                    if (typeof window.renderInstructionTableWithSaved === 'function') window.renderInstructionTableWithSaved();
                },
            };

            if (!tablesToRender) {
                // Full refresh (e.g. after a full sync pull) — render everything
                Object.values(tableRenderMap).forEach(fn => fn());
            } else {
                // Targeted refresh — only render what changed
                tablesToRender.forEach(t => {
                    if (tableRenderMap[t]) tableRenderMap[t]();
                });
            }

            // Always refresh calendar if visible (it depends on appointments)
            if (tablesToRender === null || tablesToRender.has('appointments')) {
                const calSection = document.getElementById('calendarSection');
                if (calSection && !calSection.classList.contains('hidden') && typeof window.refreshCalendar === 'function') {
                    window.refreshCalendar();
                }
            }
        }, 500); // Reduced from 1000ms to 500ms since we're doing less work now
    }

    try {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Define UI update function locally but also expose it
        function updateUIConnectionStatus(isOnline) {
            const calendarStatusEl = document.getElementById('calendarConnectionStatus');

            TWOK_LOGGER.sync(`[Sync Integration] Updating Calendar UI status: ${isOnline ? 'Online' : 'Offline'}`);

            if (calendarStatusEl) {
                calendarStatusEl.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
                calendarStatusEl.title = isOnline ? 'Online' : 'Offline';
            }
            
            const calViewStatusEl = document.querySelector('.calendar-view-status');
            if (calViewStatusEl) {
                calViewStatusEl.className = `calendar-view-status ${isOnline ? 'online' : 'offline'}`;
            }
        }
        window.updateUIConnectionStatus = updateUIConnectionStatus;

        // Setup sync event listener IMMEDIATELY
        const manager = window.twokSyncManager || window.SyncManager;
        if (manager) {
            manager.addListener((event, data) => {
                // Always log status changes regardless of config for debugging
                if (event === 'online' || event === 'offline') {
                    TWOK_LOGGER.sync(`[Sync Integration] SyncManager event: ${event}`);
                }

                switch (event) {
                    case 'sync_completed':
                        // Re-render tables after a short debounce to avoid UI flicker during bulk sync
                        debouncedRefreshUI();
                        break;

                    case 'sync_error':
                        console.warn('[Sync Integration] Sync error:', data?.error);
                        if (typeof window.showNotification === 'function') {
                            window.showNotification('Sync failed. Changes will sync when reconnected.', 'error');
                        }
                        break;

                    case 'online':
                    case 'connection-change':
                        const isNowOnline = data?.online !== undefined ? data.online : (event === 'online');
                        updateUIConnectionStatus(isNowOnline);
                        break;

                    case 'offline':
                        updateUIConnectionStatus(false);
                        break;
                }
            });

            // Initial UI update based on current state
            updateUIConnectionStatus(manager.isOnline);
        }

        // Load configuration
        const config = window.TWOK_CONFIG;
        if (!config) {
            console.error('[Sync Integration] Configuration not found.');
            return;
        }

        // Initialize WebSocket for real-time signals
        if (config.FEATURES.REALTIME_UPDATES) {
            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = config.API_URL.replace('http:', 'ws:').replace('https:', 'wss:') || `${protocol}//${window.location.host}`;
                TWOK_LOGGER.sync(`[Sync Integration] Connecting to WebSocket: ${wsUrl}`);
                
                const socket = new WebSocket(wsUrl);
                
                socket.onopen = () => {
                    TWOK_LOGGER.sync('[Sync Integration] ✅ WebSocket connected');
                };
                
                socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        // Only log in debug mode
                        if (config.DEBUG.LOG_SYNC) {
                            TWOK_LOGGER.sync(`[Sync Integration] 📡 WebSocket signal: ${data.type}`);
                        }
                        
                        // Ignore events sent by this client
                        const myId = window.myClientId || window.clientId || (typeof myClientId !== 'undefined' ? myClientId : null);
                        const senderId = data.senderId || (data.data ? data.data.senderId : null);
                        if (senderId && senderId === myId) {
                            return;
                        }

                        if (data.type === 'sync_operations') {
                            const payloadData = data.data || data;
                            const ops = payloadData.operations;
                            if (ops && Array.isArray(ops) && window.DataLayer) {
                                TWOK_LOGGER.sync(`[Sync Integration] 📡 Processing ${ops.length} live operations from WebSocket`);
                                // FIX: Cancel any pending full-pull triggered by visibilitychange.
                                // We already have the fresh data from this WebSocket event,
                                // so a full pullAll immediately after would be redundant and slow.
                                if (syncDebounceTimer) {
                                    clearTimeout(syncDebounceTimer);
                                    syncDebounceTimer = null;
                                    TWOK_LOGGER.sync('[Sync Integration] Cancelled pending pullAll — live data received via WebSocket');
                                }
                                (async () => {
                                    for (const op of ops) {
                                        if (op.table === 'syncMeta' || op.table === 'lab_records_migrated') continue;
                                        
                                        const eventType = op.operation === 'delete' ? 'delete' : 'update';
                                        await window.DataLayer.handleExternalChange(op.table, eventType, op.data || { id: op.id });
                                    }
                                })();
                            }
                        } else if (data.type === 'sync_completed') {
                            // Debounce pullAll to avoid spamming if multiple devices sync at once
                            if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
                            syncDebounceTimer = setTimeout(() => {
                                TWOK_LOGGER.sync('[Sync Integration] Other device synced, triggering silent pull...');
                                if (window.DataLayer) window.DataLayer.syncFromSupabase(true);
                            }, 5000);
                        }
                    } catch (e) {
                        console.error('[Sync Integration] WebSocket message error:', e);
                    }
                };
                
                socket.onclose = () => {
                    TWOK_LOGGER.sync('[Sync Integration] 📡 WebSocket disconnected');
                };
            } catch (e) {
                console.warn('[Sync Integration] WebSocket setup failed:', e);
            }
        }

        // Initialize Clients defensively
        try {
            if (config.FEATURES.CLOUD_SYNC && window.SupabaseClient) {
                await window.SupabaseClient.init(config.SUPABASE.URL, config.SUPABASE.ANON_KEY);
                TWOK_LOGGER.sync('[Sync Integration] ✅ Supabase Client initialized');
            }
        } catch (e) {
            console.error('[Sync Integration] Supabase init failed:', e);
        }

        try {
            if (window.DataLayer) {
                await window.DataLayer.init({
                    supabaseUrl: config.SUPABASE.URL,
                    supabaseKey: config.SUPABASE.ANON_KEY,
                    apiUrl: config.API_URL
                });
                TWOK_LOGGER.sync('[Sync Integration] ✅ DataLayer initialized');
                
                // Load settings into memory
                await window.DataLayer.loadSettings();

                // Migrate localStorage settings to Cloud Sync if needed
                await (async function migrateSettingsToCloud() {
                    const migrations = [
                        { key: 'twok_clinic_default_appointment_times', setting: 'defaultAppointmentTimes' }
                    ];

                    for (const m of migrations) {
                        const localData = localStorage.getItem(m.key);
                        if (localData) {
                            try {
                                const parsed = JSON.parse(localData);
                                const existing = await window.DataLayer.getSetting(m.setting);

                                if (!existing) {
                                    TWOK_LOGGER.sync(`[Sync Integration] Migrating ${m.setting} to Cloud...`);
                                    await window.DataLayer.saveSetting(m.setting, parsed);
                                }
                            } catch (e) {
                                console.error(`[Sync Integration] Migration failed for ${m.key}:`, e);
                            }
                        }
                    }
                })();
            }
        } catch (e) {
            console.error('[Sync Integration] DataLayer init failed:', e);
        }

        // ... rest of event listeners ...


        // Listen for data changes from realtime events
        window.addEventListener('twok_data_changed', (event) => {
            const { table, eventType, record } = event.detail;
            
            if (config.DEBUG.LOG_REALTIME) {
                TWOK_LOGGER.sync(`[Sync Integration] Realtime: ${eventType} on ${table}`, record);
            }

            // Inform user about appointment changes from other devices
            if (table === 'appointments' && typeof window.showNotification === 'function') {
                const patientName = record.patientName || record.patient_name || 'A patient';
                const status = record.status || 'updated';
                
                if (eventType === 'insert') {
                    window.showNotification(`New appointment: ${patientName}`, 'info');
                } else if (eventType === 'update') {
                    window.showNotification(`Appointment updated: ${patientName} (${status})`, 'info');
                } else if (eventType === 'delete') {
                    window.showNotification(`Appointment removed: ${patientName}`, 'warning');
                }
            }

            // Re-render only the affected UI components (smart targeted refresh)
            debouncedRefreshUI(table);
        });

        // Expose sync status function globally
        window.getSyncStatus = () => {
            return window.DataLayer.getSyncStatus();
        };

        // Expose manual sync trigger
        window.triggerSync = async () => {
            const m = window.twokSyncManager || window.SyncManager;
            if (m && typeof m.pullAll === 'function') {
                await m.flushQueue();
                await m.pullAll();
            } else if (m && typeof m.sync === 'function') {
                await m.sync();
            }
            
            // Refresh the page once sync is complete
            window.location.reload();
        };

        // Start periodic sync
        if (manager && typeof manager.startPeriodicSync === 'function') {
            manager.startPeriodicSync();
        }

        // Initial UI update based on current sync status
        if (manager) {
            updateUIConnectionStatus(manager.isOnline);
        }

        TWOK_LOGGER.sync('[Sync Integration] ✅ Integration complete!');
        TWOK_LOGGER.sync('[Sync Integration] Use window.getSyncStatus() to check sync status');
        TWOK_LOGGER.sync('[Sync Integration] Use window.triggerSync() to manually sync');

    } catch (error) {
        console.error('[Sync Integration] ❌ Initialization failed:', error);
        
        // Fallback: app will still work with local IndexedDB only
        console.warn('[Sync Integration] Running in offline-only mode');
    }
})();
