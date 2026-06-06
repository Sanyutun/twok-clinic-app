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

    console.log('[Sync Integration] Starting initialization...');

    try {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }

        // Define UI update function locally but also expose it
        function updateUIConnectionStatus(isOnline) {
            const calendarStatusEl = document.getElementById('calendarConnectionStatus');

            console.log(`[Sync Integration] Updating Calendar UI status: ${isOnline ? 'Online' : 'Offline'}`);

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
                    console.log(`[Sync Integration] SyncManager event: ${event}`);
                }

                switch (event) {
                    case 'sync_completed':
                        // Re-render ALL tables to reflect pulled data
                        if (typeof window.renderAppointmentTable === 'function') window.renderAppointmentTable();
                        if (typeof window.renderExpenses === 'function') window.renderExpenses();
                        if (typeof window.renderInstructionTableWithSaved === 'function') window.renderInstructionTableWithSaved();
                        if (typeof window.renderLabTracker === 'function') window.renderLabTracker();
                        if (typeof window.renderPatientTable === 'function') window.renderPatientTable();
                        if (typeof window.renderDoctorTable === 'function') window.renderDoctorTable();
                        if (typeof window.renderAddressList === 'function') window.renderAddressList();
                        if (typeof window.renderSpecialityList === 'function') window.renderSpecialityList();
                        if (typeof window.renderHospitalList === 'function') window.renderHospitalList();
                        if (typeof window.renderCategorySummary === 'function') window.renderCategorySummary();
                        if (typeof window.loadExpenseCategories === 'function') window.loadExpenseCategories();
                        
                        // Calendar View refresh
                        if (window.calendarViewApp && typeof window.calendarViewApp.refreshCalendar === 'function') {
                            window.calendarViewApp.refreshCalendar();
                        }
                        break;

                    case 'sync_error':
                        console.warn('[Sync Integration] Sync error:', data?.error);
                        if (typeof window.showNotification === 'function') {
                            window.showNotification('Sync failed. Changes will sync when reconnected.', 'error');
                        }
                        break;

                    case 'online':
                        updateUIConnectionStatus(true);
                        if (typeof window.showNotification === 'function') {
                            window.showNotification('Back online! Syncing changes...', 'success');
                        }
                        break;

                    case 'offline':
                        updateUIConnectionStatus(false);
                        if (typeof window.showNotification === 'function') {
                            window.showNotification('You are offline. Changes will sync automatically.', 'warning');
                        }
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

        // Initialize Clients defensively
        try {
            if (config.FEATURES.CLOUD_SYNC && window.SupabaseClient) {
                await window.SupabaseClient.init(config.SUPABASE.URL, config.SUPABASE.ANON_KEY);
                console.log('[Sync Integration] ✅ Supabase Client initialized');
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
                console.log('[Sync Integration] ✅ DataLayer initialized');
                
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
                                    console.log(`[Sync Integration] Migrating ${m.setting} to Cloud...`);
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
                console.log(`[Sync Integration] Realtime: ${eventType} on ${table}`, record);
            }

            // Re-render affected UI components
            const renderFunctions = {
                'patients': 'renderPatientTable',
                'doctors': 'renderDoctorTable',
                'appointments': ['renderAppointmentTable', 'updateQueueSummary'],
                'instructions': 'renderInstructionTableWithSaved',
                'expenses': ['renderExpenses', 'renderCategorySummary'],
                'lab_records': ['renderLabTracker', 'updatePendingResultsAlert', 'renderPharmacistCorner'],
                'settings': 'onSettingsChanged',
                'addresses': ['renderAddressList', 'renderAddressManageList'],
                'specialities': ['renderSpecialityList', 'renderSpecialityManageList'],
                'hospitals': ['renderHospitalList', 'renderHospitalManageList'],
                'expense_categories': ['renderCategorySummary', 'loadExpenseCategories']
            };

            const renderFn = renderFunctions[table];
            if (renderFn) {
                if (Array.isArray(renderFn)) {
                    renderFn.forEach(fn => {
                        if (typeof window[fn] === 'function') {
                            window[fn]();
                        }
                    });
                } else if (typeof window[renderFn] === 'function') {
                    window[renderFn]();
                }
            }
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
                m.sync();
            }
        };

        // Start periodic sync
        if (manager && typeof manager.startPeriodicSync === 'function') {
            manager.startPeriodicSync();
        }

        // Initial UI update based on current sync status
        if (manager) {
            updateUIConnectionStatus(manager.isOnline);
        }

        console.log('[Sync Integration] ✅ Integration complete!');
        console.log('[Sync Integration] Use window.getSyncStatus() to check sync status');
        console.log('[Sync Integration] Use window.triggerSync() to manually sync');

    } catch (error) {
        console.error('[Sync Integration] ❌ Initialization failed:', error);
        
        // Fallback: app will still work with local IndexedDB only
        console.warn('[Sync Integration] Running in offline-only mode');
    }
})();
