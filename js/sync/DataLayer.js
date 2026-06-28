/**
 * DataLayer - Supabase + IndexedDB integration
 * Replaces the legacy TWOKDB with cloud-synced storage
 */

class DataLayer {
    constructor() {
        this.initialized = false;
        this.dbName = 'TWOK_Clinic_DB';
        this.dbVersion = 4; 
        this.db = null;
        this.subscriptionsActive = false;
        
        // Table mappings
        this.stores = [
            'patients', 'addresses', 'doctors', 'specialities', 
            'hospitals', 'appointments', 'instructions', 
            'expenses', 'expense_categories', 'lab_records',
            'settings', 'syncMeta'
        ];

        // Setup listener for sync manager
        this.setupSyncListener();

        // Allowed fields for each table (Frontend names)
        // Used for sanitizing data before saving to IndexedDB and Supabase
        this.allowedFields = {
            'patients': [
                'id', 'name', 'age', 'sex', 'address', 'phone', 'note', 'isFoc', 
                'createdAt', 'updatedAt'
            ],
            'doctors': [
                'id', 'name', 'speciality', 'hospital', 'phone', 'needInstruction',
                'createdAt', 'updatedAt'
            ],
            'appointments': [
                'id', 'patientId', 'patientName', 'age', 'sex', 'phone', 
                'doctorId', 'doctorName', 'appointmentTime', 'bookingType', 
                'bookingNumber', 'status', 'notes', 'waitingTime', 
                'consultationTime', 'doneTime', 'postponeTime', 'createdAt', 
                'updatedAt', 'bookedTime', 'notedTime', 'arrivalTime', 'arrivedTime',
                'inconsultTime', 'investigationTime', 'consultStartTime',
                'isNext', 'penaltyTurns', 'editedTime', 'needInstruction'
            ],
            'instructions': [
                'id', 'appointmentId', 'patientId', 'patientName', 'age', 'phone', 
                'doctorName', 'appointmentDate', 'bookingNumber', 'generalInstruction', 
                'returnDuration', 'returnUnit', 'nextAppointmentDate', 'followUpDoctor', 
                'otherInstruction', 'transferHospital', 'selectedTests', 
                'linkedLabIds', 'labTrackerId', 'createdAt', 'createdTime', 'updatedAt', 'editedTime', 'needInstruction', 'contacted'
            ],
            'expenses': [
                'id', 'amount', 'category', 'remark', 'patientId', 'patientName', 
                'note', 'dateTime', 'doctorName', 'doctor_name', 'itemName', 'item_name', 'expenseType', 'expense_type', 
                'customTypeName', 'custom_type_name', 'customIcon', 'custom_icon', 'appointmentId', 'appointment_id',
                'createdAt', 'createdTime', 'updatedAt', 'timestamp'
            ],
            'lab_records': [
               'id', 'labId', 'appointmentId', 'appointment_id', 'expenseId', 'expense_id', 'patientId', 'patientName', 'doctorId', 'doctorName',
               'labName', 'amount', 'status', 'dateTime', 'pendingTests',
               'timeline', 'createdTime', 'createdAt', 'updatedAt', 'LabID'
            ],
            'expense_categories': [
                'id', 'name', 'icon', 'createdAt', 'updatedAt'
            ],
            'addresses': [
                'id', 'value', 'createdAt'
            ],
            'specialities': [
                'id', 'value', 'name', 'createdAt'
            ],
            'hospitals': [
                'id', 'value', 'name', 'createdAt'
            ],
            'settings': [
                'id', 'value', 'updatedAt'
            ]
        };
    }

    /**
     * Listen for connection changes to manage subscriptions
     */
    setupSyncListener() {
        const manager = window.twokSyncManager || window.SyncManager;
        if (manager) {
            manager.addListener((event, data) => {
                if (event === 'connection-change' || event === 'online') {
                    const isOnline = data?.online !== undefined ? data.online : (event === 'online');
                    if (isOnline && !this.subscriptionsActive && this.initialized) {
                        TWOK_LOGGER.realtime('[DataLayer] Connection restored, setting up realtime subscriptions...');
                        this.setupRealtimeSubscriptions();
                    } else if (!isOnline) {
                        this.subscriptionsActive = false;
                    }
                }
            });
        }
    }

    /**
     * Sanitize a record by removing fields not in the allowedFields list
     * @param {string} storeName 
     * @param {Object} record 
     * @returns {Object}
     */
    sanitizeRecord(storeName, record) {
        if (!record || !this.allowedFields[storeName]) return record;
        
        const allowed = this.allowedFields[storeName];
        const sanitized = {};
        
        allowed.forEach(field => {
            if (field in record) {
                sanitized[field] = record[field];
            }
        });
        
        // Ensure 'id' is always present, mapping from legacy ID fields if necessary
        if (record.id) {
            sanitized.id = record.id;
        } else {
            const legacyId = record.id || record.PatientID || record.DoctorID || record.AppointmentID || 
                           record.InstructionID || record.ExpenseID || record.LabID || record.labId ||
                           record.instruction_id || record.expense_id || record.patient_id || 
                           record.doctor_id || record.appointment_id || record.lab_id;
            if (legacyId) {
                sanitized.id = legacyId;
            }
        }

        // Special handling for lab_records: ensure both id and labId are present
        if (storeName === 'lab_records') {
            if (sanitized.id && !sanitized.labId) sanitized.labId = sanitized.id;
            if (sanitized.labId && !sanitized.id) sanitized.id = sanitized.labId;
        }
        
        return sanitized;
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================
    
    /**
     * Initialize the data layer
     * @param {Object} config - { supabaseUrl, supabaseKey, apiUrl }
     */
    async init(config = {}) {
        if (this.initialized) {
            TWOK_LOGGER.info('[DataLayer] Already initialized');
            return;
        }

        if (this.initializing) {
            TWOK_LOGGER.info('[DataLayer] Initialization already in progress, waiting...');
            return this.initPromise;
        }

        this.initializing = true;
        this.initPromise = (async () => {
            try {
                TWOK_LOGGER.info('[DataLayer] 🔄 Initializing...');

                // 1. Initialize IndexedDB - try to reuse existing TWOKDB if available
                if (window.TWOKDB && typeof window.TWOKDB.openDB === 'function') {
                    TWOK_LOGGER.debug('[DataLayer] Attempting to reuse existing TWOKDB connection...');
                    try {
                        this.db = await window.TWOKDB.openDB();
                        // TWOKDB already manages onclose/onversionchange on this connection;
                        // do NOT overwrite those handlers here to avoid leaving TWOKDB with a stale dbInstance.
                        TWOK_LOGGER.debug('[DataLayer] ✅ Connected to existing TWOKDB');
                    } catch (dbErr) {
                        TWOK_LOGGER.warn('[DataLayer] Could not reuse TWOKDB, opening new connection:', dbErr);
                        await this.initIndexedDB();
                    }
                } else {
                    await this.initIndexedDB();
                }

                // 2. Initialize Supabase client if credentials provided
                if (config.supabaseUrl && config.supabaseKey) {
                    TWOK_LOGGER.info('[DataLayer] Initializing Supabase client...');
                    await window.SupabaseClient.init(config.supabaseUrl, config.supabaseKey);
                    TWOK_LOGGER.info('[DataLayer] ✅ Supabase client initialized');
                }

                // 3. Set API URL for sync
                if (config.apiUrl) {
                    window.TWOK_API_URL = config.apiUrl;
                }

                // 4. Load initial data from IndexedDB
                TWOK_LOGGER.info('[DataLayer] Loading local data into memory...');
                await this.loadAllLocalData();

                // 5. Setup realtime subscriptions if Supabase is available
                if (window.SupabaseClient.initialized) {
                    TWOK_LOGGER.realtime('[DataLayer] Setting up realtime subscriptions...');
                    await this.setupRealtimeSubscriptions();
                }

                this.initialized = true;
                this.initializing = false;
                TWOK_LOGGER.info('[DataLayer] ✅ DataLayer fully initialized');

                // Expose globally
                window.DataLayer = this;
            } catch (error) {
                this.initializing = false;
                this.initialized = false;
                TWOK_LOGGER.error('[DataLayer] ❌ Initialization failed:', error);
                // Don't re-throw to allow app to continue in offline mode
            }
        })();

        return this.initPromise;
    }

    // ==========================================
    // INDEXEDDB OPERATIONS
    // ==========================================
    
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            TWOK_LOGGER.debug(`[DataLayer] Opening IndexedDB: ${this.dbName} (v${this.dbVersion})`);
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                TWOK_LOGGER.error('[DataLayer] IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                
                // Handle unexpected closing
                this.db.onclose = () => {
                    TWOK_LOGGER.warn('[DataLayer] Database connection closed unexpectedly');
                    this.db = null;
                };

                // Handle version changes
                this.db.onversionchange = () => {
                    TWOK_LOGGER.info('[DataLayer] Database version changed elsewhere, closing connection');
                    if (this.db) {
                        this.db.close();
                    }
                    this.db = null;
                };

                TWOK_LOGGER.debug('[DataLayer] ✅ IndexedDB opened');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                TWOK_LOGGER.debug('[DataLayer] 🆙 IndexedDB upgrade needed');

                // Create object stores if they don't exist
                this.stores.forEach(store => {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store, { keyPath: 'id' });
                        TWOK_LOGGER.debug(`[DataLayer] Created store: ${store}`);
                    }
                });
            };
        });
    }

    /**
     * Generic IndexedDB operation helper (Robust version)
     * @param {string} storeName - Object store name
     * @param {string} mode - 'readonly' or 'readwrite'
     * @returns {Promise<Object>} - { transaction, store }
     */
    async dbTransaction(storeName, mode = 'readonly') {
        if (!this.db) {
            if (window.TWOKDB && typeof window.TWOKDB.openDB === 'function') {
                this.db = await window.TWOKDB.openDB();
            } else {
                await this.initIndexedDB();
            }
        }

        try {
            const transaction = this.db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            return { transaction, store };
        } catch (error) {
            // Handle closing connection
            if (error.name === 'InvalidStateError' || 
                error.message.includes('closing') || 
                error.message.includes('closed')) {
                TWOK_LOGGER.warn('[DataLayer] Transaction failed due to closing connection, retrying...');
                this.db = null;
                return this.dbTransaction(storeName, mode);
            }
            throw error;
        }
    }

    /**
     * Get all records from a store
     * @param {string} storeName 
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        try {
            const { store } = await this.dbTransaction(storeName, 'readonly');
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            TWOK_LOGGER.error(`[DataLayer] getAll failed for ${storeName}:`, err);
            throw err;
        }
    }

    /**
     * Put a record into a store
     * @param {string} storeName 
     * @param {Object} record 
     * @returns {Promise<void>}
     */
    async put(storeName, record) {
        try {
            const { store } = await this.dbTransaction(storeName, 'readwrite');
            return new Promise((resolve, reject) => {
                const request = store.put(record);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            TWOK_LOGGER.error(`[DataLayer] put failed for ${storeName}:`, err);
            throw err;
        }
    }

    /**
     * Delete a record from a store
     * @param {string} storeName 
     * @param {string} id 
     * @returns {Promise<void>}
     */
    async delete(storeName, id) {
        TWOK_LOGGER.debug(`[DataLayer] Deleting ${id} from ${storeName}`);
        try {
            const { store } = await this.dbTransaction(storeName, 'readwrite');
            return new Promise((resolve, reject) => {
                const request = store.delete(id);
                request.onsuccess = () => {
                    TWOK_LOGGER.debug(`[DataLayer] ✅ Deleted ${id} from ${storeName}`);
                    resolve();
                };
                request.onerror = () => {
                    TWOK_LOGGER.error(`[DataLayer] ❌ Failed to delete ${id} from ${storeName}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (err) {
            TWOK_LOGGER.error(`[DataLayer] ❌ Error deleting ${id} from ${storeName}:`, err);
            throw err;
        }
    }

    /**
     * Bulk put records into a store
     * @param {string} storeName 
     * @param {Array<Object>} records 
     * @returns {Promise<void>}
     */
    async bulkPut(storeName, records) {
        if (!records || records.length === 0) return;
        
        try {
            const { transaction, store } = await this.dbTransaction(storeName, 'readwrite');
            return new Promise((resolve, reject) => {
                records.forEach(record => {
                    store.put(record);
                });

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (err) {
            TWOK_LOGGER.error(`[DataLayer] bulkPut failed for ${storeName}:`, err);
            throw err;
        }
    }

    /**
     * Flatten a record to a string if it belongs to a lookup table
     * @param {string} storeName 
     * @param {Object} record 
     * @returns {Object|string}
     */
    flattenRecordIfNeeded(storeName, record) {
        const lookupStores = ['addresses', 'specialities', 'hospitals', 'expense_categories'];
        if (lookupStores.includes(storeName)) {
            return typeof record === 'string' ? record : (record.value || record.name || record.id);
        }
        return record;
    }

    /**
     * Bulk put records into a store and queue for sync
     * @param {string} storeName 
     * @param {Array<Object>} records 
     * @returns {Promise<void>}
     */
    async bulkPutWithSync(storeName, records) {
        if (!records || records.length === 0) return;

        try {
            // 0. Sanitize records
            const sanitizedRecords = records.map(record => this.sanitizeRecord(storeName, record));

            // 1. Save to local IndexedDB immediately (prefer TWOKDB to keep cache in sync)
            if (window.TWOKDB && typeof window.TWOKDB.bulkPut === 'function') {
                await window.TWOKDB.bulkPut(storeName, sanitizedRecords, true);
            } else {
                await this.bulkPut(storeName, sanitizedRecords);
            }

            // Update local array in-place to maintain references
            const arrayName = this.tableToArrayName(storeName);
            if (window[arrayName] && Array.isArray(window[arrayName])) {
                const flattenedRecords = sanitizedRecords.map(r => this.flattenRecordIfNeeded(storeName, r));
                window[arrayName].splice(0, window[arrayName].length, ...flattenedRecords);
            }

            // 2. Queue for cloud sync using bulkQueue
            const syncManager = window.twokSyncManager || window.SyncManager;
            if (syncManager) {
                const tableName = this.arrayNameToTable(storeName);
                const syncOps = sanitizedRecords.map(record => ({
                    table: tableName,
                    operation: 'upsert',
                    data: this.mapToDb(storeName, record),
                    id: record.id
                }));
                
                if (typeof syncManager.bulkQueue === 'function') {
                    syncManager.bulkQueue(syncOps);
                } else {
                    // Fallback to individual queueing if bulkQueue not available
                    syncOps.forEach(op => syncManager.queue(op));
                }
                TWOK_LOGGER.sync(`[DataLayer] ✅ Bulk saved locally and queued for sync: ${storeName} (${records.length} items)`);
            } else {
                TWOK_LOGGER.warn('[DataLayer] SyncManager not found, data only saved locally');
            }
        } catch (error) {
            TWOK_LOGGER.error('[DataLayer] Bulk save with sync failed:', error);
            throw error;
        }
    }

    /**
     * Clear all records from a store
     * @param {string} storeName 
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        try {
            const { store } = await this.dbTransaction(storeName, 'readwrite');
            return new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            TWOK_LOGGER.error(`[DataLayer] clear failed for ${storeName}:`, err);
            throw err;
        }
    }

    // ==========================================
    // DATA LOADING
    // ==========================================

    async loadAllLocalData() {
        TWOK_LOGGER.debug('[DataLayer] Loading local collections...');

        const collections = [
            { store: 'patients', array: 'patients' },
            { store: 'addresses', array: 'addresses' },
            { store: 'doctors', array: 'doctors' },
            { store: 'specialities', array: 'specialities' },
            { store: 'hospitals', array: 'hospitals' },
            { store: 'appointments', array: 'appointments' },
            { store: 'instructions', array: 'instructions' },
            { store: 'expenses', array: 'expenses' },
            { store: 'expense_categories', array: 'expenseCategories' },
            { store: 'lab_records', array: 'labRecords' }
        ];

        for (const col of collections) {
            try {
                // Prefer TWOKDB for consistent caching
                const data = (window.TWOKDB && typeof window.TWOKDB.getAll === 'function') 
                    ? await window.TWOKDB.getAll(col.store)
                    : await this.getAll(col.store);

                const rawRecords = data || [];
                const records = rawRecords.map(r => {
                    const mapped = this.mapFromDb(col.store, r);
                    return this.flattenRecordIfNeeded(col.store, mapped);
                });

                // Update global array in-place to maintain references in script.js
                if (window[col.array] && Array.isArray(window[col.array])) {
                    window[col.array].splice(0, window[col.array].length, ...records);
                } else {
                    window[col.array] = records;
                }

                TWOK_LOGGER.debug(`  - ${col.store}: ${window[col.array].length} records`);
            } catch (error) {
                TWOK_LOGGER.error(`  - ❌ Failed to load ${col.store}:`, error);
                if (!window[col.array]) window[col.array] = [];
            }
        }
    }

    // ==========================================
    // SYNC OPERATIONS
    // ==========================================

    /**
     * Map database schema to frontend object (snake_case -> camelCase)
     */
    mapFromDb(table, data) {
        if (!data) return data;
        const mapped = { ...data };

        // Reverse common mappings
        const commonMappings = {
            'isFoc': 'is_foc',
            'patientId': 'patient_id',
            'patientName': 'patient_name',
            'doctorId': 'doctor_id',
            'doctorName': 'doctor_name',
            'appointmentId': 'appointment_id',
            'dateTime': 'date_time',
            'bookingNumber': 'booking_number',
            'bookingType': 'booking_type',
            'appointmentTime': 'appointment_time',
            'waitingTime': 'waiting_time',
            'consultationTime': 'consultation_time',
            'doneTime': 'done_time',
            'postponeTime': 'postpone_time',
            'updatedAt': 'updated_at',
            'bookedTime': 'booked_time',
            'notedTime': 'noted_time',
            'createdAt': 'created_at',
            'editedTime': 'edited_time',
            'arrivalTime': 'arrival_time',
            'inconsultTime': 'inconsult_time',
            'investigationTime': 'investigation_time',
            'consultStartTime': 'consult_start_time',
            'isNext': 'is_next',
            'penaltyTurns': 'penalty_turns',
            'needInstruction': 'need_instruction',
            'returnDuration': 'return_duration',
            'returnUnit': 'return_unit',
            'nextAppointmentDate': 'next_appointment_date',
            'followUpDoctor': 'follow_up_doctor',
            'otherInstruction': 'other_instruction',
            'transferHospital': 'transfer_hospital',
            'selectedTests': 'selected_tests',
            'linkedLabIds': 'linked_lab_ids',
            'itemName': 'item_name',
            'expenseType': 'expense_type',
            'customTypeName': 'custom_type_name',
            'customIcon': 'custom_icon',
            'expenseId': 'expense_id',
            'labName': 'lab_name',
            'pendingTests': 'pending_tests',
            'appointmentDate': 'appointment_date',
            'generalInstruction': 'general_instruction'
        };

        const swap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
        const reverseCommon = swap(commonMappings);

        for (const [key, value] of Object.entries(mapped)) {
            if (reverseCommon[key]) {
                mapped[reverseCommon[key]] = value;
                if (key !== reverseCommon[key]) delete mapped[key];
            }
        }

        // Special handling for lab_records: if id exists, populate labId and LabID for frontend compatibility
        if (table === 'lab_records' && mapped.id) {
            mapped.labId = mapped.id;
            mapped.LabID = mapped.id;
        }

        // Special handling for legacy field compatibility
        // Use the already mapped camelCase fields to populate legacy fields
        if (mapped.createdAt) mapped.createdTime = mapped.createdAt;
        if (mapped.arrivalTime) mapped.arrivedTime = mapped.arrivalTime;
        if (mapped.updatedAt) mapped.editedTime = mapped.updatedAt;

        // Special handling for settings table updated_at mapping
        if (table === 'settings' && mapped.updatedAt) {
            mapped.updatedAt = mapped.updatedAt;
        }

        return mapped;
    }
    mapToDb(table, data) {
        if (!data) return data;

        // Use a copy to avoid mutating the original object if it's passed by reference
        const mapped = { ...data };

        // Ensure foreign key fields are null if empty to avoid FK constraint violations
        const fkFields = ['patientId', 'doctorId', 'appointmentId', 'expenseId'];
        fkFields.forEach(field => {
            if (field in mapped && mapped[field] === '') {
                mapped[field] = null;
            }
        });

        // Common mappings across all tables
        const commonMappings = {
            'isFoc': 'is_foc',
            'patientId': 'patient_id',
            'patientName': 'patient_name',
            'doctorId': 'doctor_id',
            'doctorName': 'doctor_name',
            'doctor_name': 'doctor_name',
            'appointmentId': 'appointment_id',
            'appointment_id': 'appointment_id',
            'dateTime': 'date_time',
            'bookingNumber': 'booking_number',
            'bookingType': 'booking_type',
            'appointmentTime': 'appointment_time',
            'waitingTime': 'waiting_time',
            'consultationTime': 'consultation_time',
            'doneTime': 'done_time',
            'postponeTime': 'postpone_time',
            'updatedAt': 'updated_at',
            'bookedTime': 'booked_time',
            'notedTime': 'noted_time',
            'createdAt': 'created_at',
            'createdTime': 'created_at',
            'editedTime': 'edited_time',
            'arrivalTime': 'arrival_time',
            'arrivedTime': 'arrival_time', // Handle both variants
            'inconsultTime': 'inconsult_time',
            'investigationTime': 'investigation_time',
            'consultStartTime': 'consult_start_time',
            'isNext': 'is_next',
            'penaltyTurns': 'penalty_turns',
            'needInstruction': 'need_instruction',
            'returnDuration': 'return_duration',
            'returnUnit': 'return_unit',
            'nextAppointmentDate': 'next_appointment_date',
            'followUpDoctor': 'follow_up_doctor',
            'otherInstruction': 'other_instruction',
            'transferHospital': 'transfer_hospital',
            'selectedTests': 'selected_tests',
            'linkedLabIds': 'linked_lab_ids',
            'labTrackerId': 'linked_lab_ids',
            'itemName': 'item_name',
            'item_name': 'item_name',
            'expenseType': 'expense_type',
            'expense_type': 'expense_type',
            'customTypeName': 'custom_type_name',
            'custom_type_name': 'custom_type_name',
            'customIcon': 'custom_icon',
            'custom_icon': 'custom_icon',
            'expenseId': 'expense_id',
            'labName': 'lab_name',
            'pendingTests': 'pending_tests',
            'appointmentDate': 'appointment_date',
            'generalInstruction': 'general_instruction'
        };

        // Table-specific mappings (only for very specific overrides)
        const tableMappings = {
            'specialities': {
                'name': 'value'
            },
            'hospitals': {
                'name': 'value'
            }
        };

        // 1. Apply common mappings
        for (const [key, value] of Object.entries(commonMappings)) {
            if (key in mapped) {
                mapped[value] = mapped[key];
                if (key !== value) delete mapped[key];
            }
        }

        // 2. Apply table-specific mappings
        const specific = tableMappings[table];
        if (specific) {
            for (const [key, value] of Object.entries(specific)) {
                if (key in mapped) {
                    mapped[value] = mapped[key];
                    if (key !== value) delete mapped[key];
                }
            }
        }

        // 3. STRICT FILTERING: Only return fields that are now in snake_case database format
        // This ensures we never send a field that doesn't have a column in Supabase
        const dbFields = [
            'id', 'name', 'patient_id', 'patient_name', 'age', 'sex', 'phone', 
            'doctor_id', 'doctor_name', 'appointment_time', 'booking_type', 
            'booking_number', 'status', 'notes', 'waiting_time', 
            'consultation_time', 'done_time', 'postpone_time', 'created_at', 
            'updated_at', 'booked_time', 'noted_time', 'arrival_time', 
            'inconsult_time', 'investigation_time', 'consult_start_time',
            'is_next', 'penalty_turns', 'edited_time', 'date_time',
            'speciality', 'hospital', 'need_instruction', 'return_duration', 'return_unit',
            'next_appointment_date', 'follow_up_doctor', 'other_instruction',
            'transfer_hospital', 'selected_tests', 'linked_lab_ids',
            'amount', 'category', 'remark', 'note', 'item_name',
            'expense_type', 'custom_type_name', 'custom_icon', 'appointment_id',
            'expense_id', 'lab_name', 'pending_tests', 'timeline', 'address', 'is_foc', 'value',
            'icon', 'appointment_date', 'general_instruction',
            'contacted'
        ];

        // Special handling for settings table updated_at mapping
        if (table === 'settings' && data.updatedAt) {
            mapped.updated_at = data.updatedAt;
        }

        const finalData = {};
        dbFields.forEach(field => {
            if (field in mapped) {
                let value = mapped[field];

                // Convert empty strings to null for numeric/date/boolean/array/json columns to avoid PG syntax errors
                const numericFields = ['booking_number', 'return_duration', 'age', 'amount', 'penalty_turns'];
                const timestampFields = [
                    'appointment_time', 'waiting_time', 'consultation_time', 'done_time', 
                    'postpone_time', 'arrival_time', 'booked_time', 'noted_time', 
                    'inconsult_time', 'investigation_time', 'consult_start_time', 
                    'edited_time', 'date_time', 'created_at', 'updated_at'
                ];
                const booleanFields = ['is_foc', 'is_next', 'need_instruction'];
                const complexFields = ['selected_tests', 'pending_tests', 'timeline', 'linked_lab_ids'];

                if ((numericFields.includes(field) || 
                     timestampFields.includes(field) || 
                     booleanFields.includes(field) || 
                     complexFields.includes(field)) && value === "") {
                    value = null;
                }

                // Special handling for array columns: ensure value is an array if coming from a string field
                if (field === 'linked_lab_ids' && typeof value === 'string' && value !== "") {
                    value = [value];
                }

                finalData[field] = value;
            }
        });

        return finalData;
    }

    /**
     * Save data to local IndexedDB and queue for cloud sync
     * @param {string} table - Table name
     * @param {string} operation - 'insert', 'update', 'delete'
     * @param {Object} data - Record data
     * @param {string} id - Record ID
     */
    async saveWithSync(table, operation, data, id) {
        try {
            // 0. Skip sync for internal/meta stores
            const internalStores = ['syncMeta', 'lab_records_migrated'];
            if (internalStores.includes(table)) {
                if (operation === 'delete') {
                    if (window.TWOKDB && typeof window.TWOKDB.remove === 'function') {
                        await window.TWOKDB.remove(table, id, true);
                    } else {
                        await this.delete(table, id);
                    }
                } else {
                    if (window.TWOKDB && typeof window.TWOKDB.put === 'function') {
                        await window.TWOKDB.put(table, data, true);
                    } else {
                        await this.put(table, data);
                    }
                }
                return;
            }

            // 0. Sanitize record (if not delete)
            const sanitizedData = operation === 'delete' ? data : this.sanitizeRecord(table, data);

            // 1. Save to local IndexedDB immediately (prefer TWOKDB to keep cache in sync)
            if (operation === 'delete') {
                if (window.TWOKDB && typeof window.TWOKDB.remove === 'function') {
                    await window.TWOKDB.remove(table, id, true);
                } else {
                    await this.delete(table, id);
                }
                
                // Remove from local array in-place to maintain references
                const arrayName = this.tableToArrayName(table);
                if (window[arrayName] && Array.isArray(window[arrayName])) {
                    const idx = window[arrayName].findIndex(item => (item.id || item.labId || item.AppointmentID || item.PatientID) === id);
                    if (idx > -1) {
                        window[arrayName].splice(idx, 1);
                        TWOK_LOGGER.sync(`[DataLayer] Removed ${id} from window.${arrayName} in-place`);
                    }
                }
            } else {
                if (window.TWOKDB && typeof window.TWOKDB.put === 'function') {
                    await window.TWOKDB.put(table, sanitizedData, true);
                } else {
                    await this.put(table, sanitizedData);
                }
                
                // Update local array
                const arrayName = this.tableToArrayName(table);
                if (window[arrayName]) {
                    const flattenedRecord = this.flattenRecordIfNeeded(table, sanitizedData);
                    const existingIndex = window[arrayName].findIndex(item => {
                        const itemId = item.id || item.AppointmentID || item.PatientID || item.DoctorID || item.InstructionID || item.ExpenseID || item.LabID || item.labId || (typeof item === 'string' ? item : null);
                        return itemId === (id || sanitizedData.id);
                    });
                    if (existingIndex >= 0) {
                        window[arrayName][existingIndex] = flattenedRecord;
                    } else {
                        window[arrayName].push(flattenedRecord);
                    }
                }
            }
            // 2. Queue for cloud sync (using database format)
            const syncManager = window.twokSyncManager || window.SyncManager;
            if (syncManager) {
                const dbData = operation === 'delete' ? null : this.mapToDb(table, sanitizedData);
                
                syncManager.queue({
                    table: this.arrayNameToTable(table), // Ensure table name matches DB
                    operation: operation === 'delete' ? 'delete' : 'upsert',
                    data: dbData,
                    id: id || (sanitizedData ? sanitizedData.id : null)
                });
                TWOK_LOGGER.sync(`[DataLayer] ✅ Saved locally and queued for sync: ${operation} ${table}`);
            } else {
                console.warn('[DataLayer] SyncManager not found, data only saved locally');
            }
        } catch (error) {
            console.error('[DataLayer] Save with sync failed:', error);
            throw error;
        }
    }

    /**
     * Push all local data to cloud (useful for initial migration)
     * Usage: DataLayer.pushExistingToCloud() in console
     */
    async pushExistingToCloud() {
        if (!this.initialized || !window.SupabaseClient.initialized) {
            console.error('[DataLayer] ❌ Cannot push: Sync not initialized');
            return;
        }

        const tables = [
            'patients', 'addresses', 'doctors', 'specialities', 
            'hospitals', 'expense_categories', 'appointments', 
            'instructions', 'expenses', 'lab_records'
        ];

        TWOK_LOGGER.sync('[DataLayer] 🚀 Starting manual push of all local data to cloud...');
        
        for (const table of tables) {
            try {
                const data = await this.getAll(table);
                if (data && data.length > 0) {
                    TWOK_LOGGER.sync(`[DataLayer] Queuing ${data.length} records from ${table}...`);
                    data.forEach(record => {
                        syncManager.queue({
                            table: table,
                            operation: 'upsert',
                            data: record,
                            id: record.id || record.value || record.name
                        });
                    });
                }
            } catch (err) {
                console.error(`[DataLayer] Failed to push table ${table}:`, err);
            }
        }
        
        TWOK_LOGGER.sync('[DataLayer] ✅ All data queued for sync. Watch SyncManager logs for progress.');
    }

    // ==========================================
    // SETTINGS OPERATIONS
    // ==========================================

    /**
     * Get a setting by key
     * @param {string} key 
     * @returns {Promise<any>}
     */
    async getSetting(key) {
        try {
            const { store } = await this.dbTransaction('settings', 'readonly');
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => {
                    const result = request.result;
                    if (result && result.value) {
                        try {
                            resolve(JSON.parse(result.value));
                        } catch (e) {
                            resolve(result.value);
                        }
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.error(`[DataLayer] getSetting failed for ${key}:`, err);
            throw err;
        }
    }

    /**
     * Save a setting locally and queue for sync
     * @param {string} key 
     * @param {any} value 
     */
    async saveSetting(key, value) {
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            const settingRecord = {
                id: key,
                value: stringValue,
                updatedAt: new Date().toISOString()
            };

            // 1. Save to local IndexedDB
            await this.put('settings', settingRecord);

            // 2. Queue for cloud sync
            const syncManager = window.twokSyncManager || window.SyncManager;
            if (syncManager) {
                syncManager.queue({
                    table: 'settings',
                    operation: 'upsert',
                    data: {
                        id: key,
                        value: stringValue,
                        updated_at: settingRecord.updatedAt
                    },
                    id: key
                });
                TWOK_LOGGER.sync(`[DataLayer] ✅ Setting '${key}' saved locally and queued for sync`);
            }
        } catch (error) {
            console.error(`[DataLayer] Failed to save setting '${key}':`, error);
            throw error;
        }
    }

    /**
     * Load all settings into memory
     */
    async loadSettings() {
        try {
            const allSettings = await this.getAll('settings');
            const settingsMap = {};
            allSettings.forEach(s => {
                try {
                    settingsMap[s.id] = JSON.parse(s.value);
                } catch (e) {
                    settingsMap[s.id] = s.value;
                }
            });
            window.appSettings = settingsMap;
            TWOK_LOGGER.sync(`[DataLayer] Loaded ${allSettings.length} settings`);
            return settingsMap;
        } catch (error) {
            console.error('[DataLayer] Failed to load settings:', error);
            return {};
        }
    }
    
    normalizeTableName(table) {
        if (!table) return table;
        
        const mapping = {
            'appointment': 'appointments',
            'patient': 'patients',
            'doctor': 'doctors',
            'instruction': 'instructions',
            'expense': 'expenses',
            'lab': 'lab_records',
            'lab_tracker': 'lab_records'
        };
        
        return mapping[table] || table;
    }

    tableToArrayName(table) {
        const mapping = {
            'patients': 'patients',
            'addresses': 'addresses',
            'doctors': 'doctors',
            'specialities': 'specialities',
            'hospitals': 'hospitals',
            'appointments': 'appointments',
            'instructions': 'instructions',
            'expenses': 'expenses',
            'expense_categories': 'expenseCategories',
            'lab_records': 'labRecords',
            'lab_tracker': 'labRecords'
        };
        return mapping[table] || table;
    }

    arrayNameToTable(arrayName) {
        const mapping = {
            'patients': 'patients',
            'addresses': 'addresses',
            'doctors': 'doctors',
            'specialities': 'specialities',
            'hospitals': 'hospitals',
            'appointments': 'appointments',
            'instructions': 'instructions',
            'expenses': 'expenses',
            'expenseCategories': 'expense_categories',
            'labRecords': 'lab_records'
        };
        return mapping[arrayName] || arrayName;
    }

    /**
     * Handle data change notifications from external sources (Realtime, WebSockets)
     * @param {string} table 
     * @param {string} eventType - 'insert', 'update', 'delete'
     * @param {Object} record - The record data in database format (snake_case)
     */
    async handleExternalChange(table, eventType, record) {
        if (!record) return;

        // Normalize table name (e.g., singular to plural from WebSockets)
        const normalizedTable = this.normalizeTableName(table);

        // Validate table exists in IndexedDB
        if (window.TWOKDB && window.TWOKDB.STORES) {
            const validStores = Object.values(window.TWOKDB.STORES);
            if (!validStores.includes(normalizedTable)) {
                console.warn(`[DataLayer] ⚠️ Skipping external change for unknown table: ${table} (normalized: ${normalizedTable})`);
                return;
            }
        }
        
        const id = record.id || record.PatientID || record.DoctorID || record.AppointmentID || 
                   record.InstructionID || record.ExpenseID || record.LabID || record.labId ||
                   record.appointment_id || record.patient_id || record.doctor_id ||
                   record.instruction_id || record.expense_id || record.lab_id;
                   
        if (!id && eventType === 'delete') {
            console.warn(`[DataLayer] ⚠️ Cannot process ${eventType} on ${normalizedTable}: missing ID`, record);
            return;
        }

        TWOK_LOGGER.sync(`[DataLayer] Processing external change: ${eventType} on ${normalizedTable}`, record);

        // Map from DB format to Frontend format if it's not a delete
        const frontendRecord = eventType === 'delete' ? record : this.mapFromDb(normalizedTable, record);
        
        // Ensure id is present for IndexedDB keyPath ('id')
        if (frontendRecord && !frontendRecord.id && id) {
            frontendRecord.id = id;
        }
        
        const recordId = id || (frontendRecord ? frontendRecord.id : null);

        // 1. Update local IndexedDB
        try {
            if (eventType === 'delete') {
                if (window.TWOKDB && typeof window.TWOKDB.remove === 'function') {
                    await window.TWOKDB.remove(normalizedTable, recordId, true);
                } else {
                    await this.delete(normalizedTable, recordId);
                }
            } else {
                // Deduplicate: If we already have this exact update pending in our queue, don't overwrite
                const manager = window.twokSyncManager || window.SyncManager;
                if (manager && manager.isPending(normalizedTable, recordId)) {
                    TWOK_LOGGER.sync(`[DataLayer] 🛡️ Skipping update for ${normalizedTable}:${recordId} (local change pending)`);
                    return;
                }

                if (window.TWOKDB && typeof window.TWOKDB.put === 'function') {
                    await window.TWOKDB.put(normalizedTable, frontendRecord, true);
                } else {
                    await this.put(normalizedTable, frontendRecord);
                }
            }
        } catch (err) {
            console.error(`[DataLayer] Failed to update IndexedDB from external change:`, err);
        }

        // 2. Update global memory arrays
        const arrayName = this.tableToArrayName(normalizedTable);
        if (window[arrayName]) {
            const flattenedRecord = this.flattenRecordIfNeeded(normalizedTable, frontendRecord);
            const index = window[arrayName].findIndex(item => {
                if (typeof item === 'string') return item == recordId;
                const itemId = item.id || item.labId || item.value || 
                             item.ExpenseID || item.PatientID || item.DoctorID || 
                             item.AppointmentID || item.InstructionID || item.LabID;
                return itemId == recordId;
            });

            if (eventType === 'delete') {
                if (index >= 0) window[arrayName].splice(index, 1);
            } else {
                if (index >= 0) {
                    window[arrayName][index] = flattenedRecord;
                } else {
                    window[arrayName].push(flattenedRecord);
                }
            }
        }

        // 3. Dispatch global event to notify UI components
        window.dispatchEvent(new CustomEvent('twok_data_changed', {
            detail: { table: normalizedTable, eventType, record: frontendRecord }
        }));
    }

    /**
     * Set up realtime subscriptions for all tables
     */
    async setupRealtimeSubscriptions() {
        if (!window.SupabaseClient || !window.SupabaseClient.initialized) {
            console.warn('[DataLayer] SupabaseClient not initialized, skipping realtime setup');
            return;
        }

        if (!navigator.onLine) {
            TWOK_LOGGER.sync('[DataLayer] 📴 Offline: skipping realtime setup');
            return;
        }

        // 0. Clean up existing subscriptions to avoid duplicates
        try {
            await window.SupabaseClient.unsubscribeAll();
        } catch (e) {
            console.warn('[DataLayer] Unsubscribe all failed:', e);
        }

        // FIX: Only subscribe to tables that change frequently during clinic operations.
        // Static/lookup tables (addresses, specialities, hospitals, expense_categories, settings)
        // are excluded — they almost never change in real-time and each subscription
        // costs a persistent WebSocket channel. Reduced from 11 → 6 channels.
        const tables = [
            'appointments',   // HIGH: changes constantly during clinic
            'patients',       // MEDIUM: new patients added regularly
            'doctors',        // LOW-MEDIUM: doctor info updates
            'instructions',   // MEDIUM: created after each consultation
            'expenses',       // MEDIUM: added throughout the day
            'lab_records',    // MEDIUM: updated as lab results come in
        ];

        this.subscriptionsActive = true;

        for (const table of tables) {
            TWOK_LOGGER.sync(`[DataLayer] Subscribing to realtime changes for ${table}...`);
            
            await window.SupabaseClient.subscribe(table, async (eventType, record) => {
                // Map event type names if necessary
                const mappedEvent = eventType === 'insert' ? 'insert' : (eventType === 'update' ? 'update' : (eventType === 'delete' ? 'delete' : eventType));
                await this.handleExternalChange(table, mappedEvent, record);
            });
        }
    }

    /**
     * Get sync status
     * @returns {Object}
     */
    getSyncStatus() {
        const syncManager = window.twokSyncManager || window.SyncManager;
        return {
            initialized: this.initialized,
            supabaseConnected: window.SupabaseClient ? window.SupabaseClient.initialized : false,
            syncManager: syncManager ? syncManager.getStatus() : 'Not found',
            localData: {
                patients: window.patients?.length || 0,
                doctors: window.doctors?.length || 0,
                appointments: window.appointments?.length || 0,
                instructions: window.instructions?.length || 0,
                expenses: window.expenses?.length || 0,
                labRecords: window.labRecords?.length || 0
            }
        };
    }

    /**
     * Manual sync: Pull changes from Supabase AND push queued ops
     */
    async syncFromSupabase(silent = false) {
        TWOK_LOGGER.sync('[DataLayer] Starting manual sync...');

        if (!window.SupabaseClient || !window.SupabaseClient.initialized || !window.SupabaseClient.client) {
            console.error('[DataLayer] Cannot sync: Supabase client is not initialized');
            if (!silent) throw new Error('Supabase sync is currently unavailable. Please check your internet connection and reload the app.');
            return;
        }

        try {
            // 1. Try to flush pending queue first (PUSH)
            const syncManager = window.twokSyncManager || window.SyncManager;
            if (syncManager && syncManager.getQueueLength() > 0) {
                TWOK_LOGGER.sync(`[DataLayer] Pushing ${syncManager.getQueueLength()} pending operations...`);
                await syncManager.flushQueue();
                TWOK_LOGGER.sync('[DataLayer] Pending operations pushed successfully');
            }

            // 2. Fetch recent changes (PULL)
            const tables = [
                'patients', 'doctors', 'appointments', 'instructions', 'expenses', 
                'lab_records', 'addresses', 'specialities', 'hospitals', 'expense_categories'
            ];
            
            for (const table of tables) {
                if (!silent) TWOK_LOGGER.sync(`[DataLayer] Syncing ${table}...`);

                // A. Get all IDs from Supabase
                const { data: allSupabaseRecords, error: fetchError } = await window.SupabaseClient.client
                    .from(table)
                    .select('id')
                    .limit(5000);

                if (fetchError) throw fetchError;
                
                const supabaseIds = new Set(allSupabaseRecords.map(r => r.id));

                // B. Get all IDs from local IndexedDB
                const localRecords = await this.getAll(table);
                
                // C. Delete records that are NOT in Supabase AND NOT pending sync
                let deleteCount = 0;
                for (const localRecord of localRecords) {
                    const isPending = syncManager && syncManager.isPending(table, localRecord.id);
                    
                    if (!supabaseIds.has(localRecord.id) && !isPending) {
                        if (allSupabaseRecords.length === 0 && localRecords.length > 5 && 
                            !['expense_categories', 'addresses', 'specialities', 'hospitals'].includes(table)) {
                            console.warn(`[DataLayer] Suspicous: Supabase returned 0 records for ${table} but we have ${localRecords.length} locally. Skipping orphan deletion for safety.`);
                            break;
                        }

                        TWOK_LOGGER.sync(`[DataLayer] Deleting orphan record from ${table}: ${localRecord.id}`);
                        await this.delete(table, localRecord.id);
                        deleteCount++;
                    }
                }
                
                if (deleteCount > 0 && !silent) {
                    TWOK_LOGGER.sync(`[DataLayer] Cleaned up ${deleteCount} orphan records from ${table}`);
                }
                
                // D. Fetch records that were updated since last sync
                const forceFullSync = ['addresses', 'specialities', 'hospitals', 'expense_categories'].includes(table);
                // Get the last sync timestamp for THIS table
                let lastSync = forceFullSync ? null : localStorage.getItem(`last_sync_timestamp_${table}`);
                
                // If we have a timestamp, subtract 10 seconds for safety/buffer
                if (lastSync) {
                    const date = new Date(lastSync);
                    date.setSeconds(date.getSeconds() - 10);
                    lastSync = date.toISOString();
                }

                const queryOptions = lastSync ? {
                    updated_at: { operator: 'gt', value: lastSync }
                } : {};

                const recentData = await window.SupabaseClient.query(table, queryOptions);

                if (recentData && recentData.length > 0) {
                    if (!silent) TWOK_LOGGER.sync(`[DataLayer] Found ${recentData.length} new/updated records for ${table}`);
                    
                    const localData = recentData.map(record => this.mapFromDb(table, record));
                    await this.bulkPut(table, localData);
                }
                
                // Update sync timestamp ONLY after successful fetch
                localStorage.setItem(`last_sync_timestamp_${table}`, new Date().toISOString());
            }

            // 3. REFRESH MEMORY ARRAYS (Very important to avoid page reload)
            await this.loadAllLocalData();

            if (!silent && window.showNotification) window.showNotification('Sync complete!', 'success');
            
            // 4. Trigger global sync complete event (UI components listen for this)
            window.dispatchEvent(new CustomEvent('twok_sync_complete'));

        } catch (error) {
            console.error('[DataLayer] Sync failed:', error);
            if (!silent && window.showNotification) window.showNotification('Sync error: ' + error.message, 'error');
            throw error;
        }
    }
}

// Export as singleton
window.DataLayer = new DataLayer();
