/**
 * DataLayer - Supabase + IndexedDB integration
 * Replaces the legacy TWOKDB with cloud-synced storage
 */

class DataLayer {
    constructor() {
        this.initialized = false;
        this.dbName = 'TWOK_Clinic_DB';
        this.dbVersion = 3; 
        this.db = null;
        
        // Table mappings
        this.stores = [
            'patients', 'addresses', 'doctors', 'specialities', 
            'hospitals', 'appointments', 'instructions', 
            'expenses', 'expense_categories', 'lab_records',
            'settings', 'syncMeta'
        ];

        // Allowed fields for each table (Frontend names)
        // Used for sanitizing data before saving to IndexedDB and Supabase
        this.allowedFields = {
            'patients': [
                'id', 'name', 'age', 'sex', 'address', 'phone', 'note', 'isFoc', 
                'createdAt', 'updatedAt'
            ],
            'doctors': [
                'id', 'name', 'speciality', 'hospital', 'phone', 
                'createdAt', 'updatedAt'
            ],
            'appointments': [
                'id', 'patientId', 'patientName', 'age', 'sex', 'phone', 
                'doctorId', 'doctorName', 'appointmentTime', 'bookingType', 
                'bookingNumber', 'status', 'notes', 'waitingTime', 
                'consultationTime', 'doneTime', 'postponeTime', 'createdAt', 
                'updatedAt', 'bookedTime', 'notedTime', 'arrivalTime', 'arrivedTime',
                'inconsultTime', 'investigationTime', 'consultStartTime',
                'isNext', 'penaltyTurns', 'editedTime'
            ],
            'instructions': [
                'id', 'appointmentId', 'patientId', 'patientName', 'age', 'phone', 
                'doctorName', 'appointmentDate', 'bookingNumber', 'generalInstruction', 
                'returnDuration', 'returnUnit', 'nextAppointmentDate', 'followUpDoctor', 
                'otherInstruction', 'transferHospital', 'selectedTests', 
                'linkedLabIds', 'createdAt', 'createdTime', 'updatedAt', 'editedTime'
            ],
            'expenses': [
                'id', 'amount', 'category', 'remark', 'patientId', 'patientName', 
                'note', 'dateTime', 'doctorName', 'doctor_name', 'itemName', 'item_name', 'expenseType', 'expense_type', 
                'customTypeName', 'custom_type_name', 'customIcon', 'custom_icon', 'appointmentId', 'appointment_id',
                'createdAt', 'createdTime', 'updatedAt', 'timestamp'
            ],
            'lab_records': [
                'id', 'expenseId', 'patientId', 'patientName', 'doctorId', 'doctorName',
                'labName', 'amount', 'status', 'dateTime', 'pendingTests',
                'timeline', 'createdTime', 'createdAt', 'updatedAt'
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
            console.log('[DataLayer] Already initialized');
            return;
        }

        try {
            console.log('[DataLayer] 🔄 Initializing...');

            // 1. Initialize IndexedDB - try to reuse existing TWOKDB if available
            if (window.TWOKDB && typeof window.TWOKDB.openDB === 'function') {
                console.log('[DataLayer] Attempting to reuse existing TWOKDB connection...');
                try {
                    this.db = await window.TWOKDB.openDB();
                    console.log('[DataLayer] ✅ Connected to existing TWOKDB');
                } catch (dbErr) {
                    console.warn('[DataLayer] Could not reuse TWOKDB, opening new connection:', dbErr);
                    await this.initIndexedDB();
                }
            } else {
                await this.initIndexedDB();
            }

            // 2. Initialize Supabase client if credentials provided
            if (config.supabaseUrl && config.supabaseKey) {
                console.log('[DataLayer] Initializing Supabase client...');
                await window.SupabaseClient.init(config.supabaseUrl, config.supabaseKey);
                console.log('[DataLayer] ✅ Supabase client initialized');
            }

            // 3. Set API URL for sync
            if (config.apiUrl) {
                window.TWOK_API_URL = config.apiUrl;
            }

            // 4. Load initial data from IndexedDB
            console.log('[DataLayer] Loading local data into memory...');
            await this.loadAllLocalData();

            // 5. Setup realtime subscriptions if Supabase is available
            if (window.SupabaseClient.initialized) {
                console.log('[DataLayer] Setting up realtime subscriptions...');
                await this.setupRealtimeSubscriptions();
            }

            this.initialized = true;
            console.log('[DataLayer] ✅ DataLayer fully initialized');

            // Expose globally
            window.DataLayer = this;
        } catch (error) {
            console.error('[DataLayer] ❌ Initialization failed:', error);
            // Don't re-throw to allow app to continue in offline mode
        }
    }

    // ==========================================
    // INDEXEDDB OPERATIONS
    // ==========================================
    
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            console.log(`[DataLayer] Opening IndexedDB: ${this.dbName} (v${this.dbVersion})`);
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('[DataLayer] IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[DataLayer] ✅ IndexedDB opened');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('[DataLayer] 🆙 IndexedDB upgrade needed');

                // Create object stores if they don't exist
                this.stores.forEach(store => {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store, { keyPath: 'id' });
                        console.log(`[DataLayer] Created store: ${store}`);
                    }
                });
            };
        });
    }

    /**
     * Generic IndexedDB operation helper
     * @param {string} storeName - Object store name
     * @param {string} mode - 'readonly' or 'readwrite'
     * @returns {Object} - { transaction, store }
     */
    dbTransaction(storeName, mode = 'readonly') {
        if (!this.db) {
            throw new Error('[DataLayer] Database not initialized. Call init() first.');
        }
        const transaction = this.db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        return { transaction, store };
    }

    /**
     * Get all records from a store
     * @param {string} storeName 
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            try {
                const { store } = this.dbTransaction(storeName, 'readonly');
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Put a record into a store
     * @param {string} storeName 
     * @param {Object} record 
     * @returns {Promise<void>}
     */
    async put(storeName, record) {
        return new Promise((resolve, reject) => {
            try {
                const { store } = this.dbTransaction(storeName, 'readwrite');
                const request = store.put(record);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Delete a record from a store
     * @param {string} storeName 
     * @param {string} id 
     * @returns {Promise<void>}
     */
    async delete(storeName, id) {
        console.log(`[DataLayer] Deleting ${id} from ${storeName}`);
        return new Promise((resolve, reject) => {
            try {
                const { store } = this.dbTransaction(storeName, 'readwrite');
                const request = store.delete(id);

                request.onsuccess = () => {
                    console.log(`[DataLayer] ✅ Deleted ${id} from ${storeName}`);
                    resolve();
                };
                request.onerror = () => {
                    console.error(`[DataLayer] ❌ Failed to delete ${id} from ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (err) {
                console.error(`[DataLayer] ❌ Error deleting ${id} from ${storeName}:`, err);
                reject(err);
            }
        });
    }

    /**
     * Bulk put records into a store
     * @param {string} storeName 
     * @param {Array<Object>} records 
     * @returns {Promise<void>}
     */
    async bulkPut(storeName, records) {
        if (!records || records.length === 0) return;
        
        return new Promise((resolve, reject) => {
            try {
                const { transaction, store } = this.dbTransaction(storeName, 'readwrite');
                
                records.forEach(record => {
                    store.put(record);
                });

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            } catch (err) {
                reject(err);
            }
        });
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

            // 2. Queue for cloud sync
            const syncManager = window.twokSyncManager || window.SyncManager;
            if (syncManager) {
                sanitizedRecords.forEach(record => {
                    const dbData = this.mapToDb(storeName, record);
                    syncManager.queue({
                        table: this.arrayNameToTable(storeName),
                        operation: 'upsert',
                        data: dbData,
                        id: record.id
                    });
                });
                console.log(`[DataLayer] ✅ Bulk saved locally and queued for sync: ${storeName}`);
            } else {
                console.warn('[DataLayer] SyncManager not found, data only saved locally');
            }
        } catch (error) {
            console.error('[DataLayer] Bulk save with sync failed:', error);
            throw error;
        }
    }

    /**
     * Clear all records from a store
     * @param {string} storeName 
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            try {
                const { store } = this.dbTransaction(storeName, 'readwrite');
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // ==========================================
    // DATA LOADING
    // ==========================================

    async loadAllLocalData() {
        console.log('[DataLayer] Loading local collections...');

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
                const records = rawRecords.map(r => this.flattenRecordIfNeeded(col.store, r));

                // Update global array in-place to maintain references in script.js
                if (window[col.array] && Array.isArray(window[col.array])) {
                    window[col.array].splice(0, window[col.array].length, ...records);
                } else {
                    window[col.array] = records;
                }

                console.log(`  - ${col.store}: ${window[col.array].length} records`);
            } catch (error) {
                console.error(`  - ❌ Failed to load ${col.store}:`, error);
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

        // Special handling for lab_records: if id exists, populate labId for frontend compatibility
        if (table === 'lab_records' && mapped.id) {
            mapped.labId = mapped.id;
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
        const fkFields = ['patientId', 'doctorId', 'appointmentId'];
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
            'appointmentDate': 'appointment_date',
            'generalInstruction': 'general_instruction'
        };

        // Table-specific mappings
        const tableMappings = {
            'doctors': {
                'speciality': 'speciality',
                'hospital': 'hospital',
                'phone': 'phone'
            },
            'specialities': {
                'name': 'value'
            },
            'hospitals': {
                'name': 'value'
            },
            'instructions': {
                'returnDuration': 'return_duration',
                'returnUnit': 'return_unit',
                'nextAppointmentDate': 'next_appointment_date',
                'followUpDoctor': 'follow_up_doctor',
                'otherInstruction': 'other_instruction',
                'transferHospital': 'transfer_hospital',
                'selectedTests': 'selected_tests',
                'linkedLabIds': 'linked_lab_ids'
            },
            'expenses': {
                'itemName': 'item_name',
                'item_name': 'item_name',
                'expenseType': 'expense_type',
                'expense_type': 'expense_type',
                'customTypeName': 'custom_type_name',
                'custom_type_name': 'custom_type_name',
                'customIcon': 'custom_icon',
                'custom_icon': 'custom_icon'
            },
            'lab_records': {
                'expenseId': 'expense_id',
                'labName': 'lab_name',
                'pendingTests': 'pending_tests'
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
            'speciality', 'hospital', 'return_duration', 'return_unit',
            'next_appointment_date', 'follow_up_doctor', 'other_instruction',
            'transfer_hospital', 'selected_tests', 'linked_lab_ids',
            'amount', 'category', 'remark', 'note', 'item_name',
            'expense_type', 'custom_type_name', 'custom_icon', 'appointment_id',
            'lab_name', 'pending_tests', 'timeline', 'address', 'is_foc', 'value',
            'icon', 'appointment_date', 'general_instruction'
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
                const booleanFields = ['is_foc', 'is_next'];
                const complexFields = ['selected_tests', 'pending_tests', 'timeline'];

                if ((numericFields.includes(field) || 
                     timestampFields.includes(field) || 
                     booleanFields.includes(field) || 
                     complexFields.includes(field)) && value === "") {
                    value = null;
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
                        console.log(`[DataLayer] Removed ${id} from window.${arrayName} in-place`);
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
                console.log(`[DataLayer] ✅ Saved locally and queued for sync: ${operation} ${table}`);
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

        console.log('[DataLayer] 🚀 Starting manual push of all local data to cloud...');
        
        for (const table of tables) {
            try {
                const data = await this.getAll(table);
                if (data && data.length > 0) {
                    console.log(`[DataLayer] Queuing ${data.length} records from ${table}...`);
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
        
        console.log('[DataLayer] ✅ All data queued for sync. Watch SyncManager logs for progress.');
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
        return new Promise((resolve, reject) => {
            try {
                const { store } = this.dbTransaction('settings', 'readonly');
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
            } catch (err) {
                reject(err);
            }
        });
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
                console.log(`[DataLayer] ✅ Setting '${key}' saved locally and queued for sync`);
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
            console.log(`[DataLayer] Loaded ${allSettings.length} settings`);
            return settingsMap;
        } catch (error) {
            console.error('[DataLayer] Failed to load settings:', error);
            return {};
        }
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
     * Set up realtime subscriptions for all tables
     */
    async setupRealtimeSubscriptions() {
        if (!window.SupabaseClient || !window.SupabaseClient.initialized) {
            console.warn('[DataLayer] SupabaseClient not initialized, skipping realtime setup');
            return;
        }

        const tables = [
            'patients', 'doctors', 'appointments', 'instructions', 
            'expenses', 'lab_records', 'settings',
            'addresses', 'specialities', 'hospitals', 'expense_categories'
        ];

        for (const table of tables) {
            console.log(`[DataLayer] Subscribing to realtime changes for ${table}...`);
            
            await window.SupabaseClient.subscribe(table, async (eventType, record) => {
                console.log(`[DataLayer] Realtime update: ${eventType} on ${table}`, record);

                // Map from DB format to Frontend format
                const frontendRecord = eventType === 'delete' ? record : this.mapFromDb(table, record);

                // 1. Update local IndexedDB (prefer TWOKDB to keep cache in sync)
                if (eventType === 'delete') {
                    if (window.TWOKDB && typeof window.TWOKDB.remove === 'function') {
                        await window.TWOKDB.remove(table, record.id, true);
                    } else {
                        await this.delete(table, record.id);
                    }
                } else {
                    if (window.TWOKDB && typeof window.TWOKDB.put === 'function') {
                        await window.TWOKDB.put(table, frontendRecord, true);
                    } else {
                        await this.put(table, frontendRecord);
                    }
                }

                // 2. Update global arrays
                const arrayName = this.tableToArrayName(table);
                if (window[arrayName]) {
                    const flattenedRecord = this.flattenRecordIfNeeded(table, frontendRecord);
                    const index = window[arrayName].findIndex(item => {
                        if (typeof item === 'string') return item == (record.id || frontendRecord.id);
                        
                        // Robust ID matching: check all possible ID fields (modern and legacy)
                        const itemId = item.id || item.labId || item.value || 
                                     item.ExpenseID || item.PatientID || item.DoctorID || 
                                     item.AppointmentID || item.InstructionID || item.LabID;
                        
                        const incomingId = record.id || record.labId || frontendRecord.id;
                        
                        return itemId == incomingId; // Use loose equality for safety
                    });

                    console.log(`[DataLayer] Realtime ${eventType} on ${table}: index found=${index}`);

                    if (eventType === 'delete') {
                        if (index >= 0) {
                            window[arrayName].splice(index, 1);
                            console.log(`[DataLayer] Realtime delete: Removed ${record.id} from window.${arrayName} in-place`);
                        } else {
                            console.warn(`[DataLayer] Realtime delete: Could not find ${record.id} in window.${arrayName}`);
                        }
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
                    detail: { 
                        table: table, 
                        eventType: eventType, 
                        record: frontendRecord 
                    }
                }));
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
    async syncFromSupabase() {
        console.log('[DataLayer] Starting manual sync...');

        try {
            // 1. Try to flush pending queue first
            const syncManager = window.twokSyncManager || window.SyncManager;
            if (syncManager && syncManager.getQueueLength() > 0) {
                console.log(`[DataLayer] Pushing ${syncManager.getQueueLength()} pending operations...`);
                await syncManager.flushQueue();
                console.log('[DataLayer] Pending operations pushed successfully');
            }

            // 2. Fetch recent changes
            const tables = [
                'patients', 'doctors', 'appointments', 'instructions', 'expenses', 
                'lab_records', 'addresses', 'specialities', 'hospitals', 'expense_categories'
            ];
            
            for (const table of tables) {
                console.log(`[DataLayer] Syncing ${table}...`);

                // A. Get all IDs from Supabase
                const { data: allSupabaseRecords, error: fetchError } = await window.SupabaseClient.client
                    .from(table)
                    .select('id');

                if (fetchError) throw fetchError;
                
                const supabaseIds = new Set(allSupabaseRecords.map(r => r.id));

                // B. Get all IDs from local IndexedDB
                const localRecords = await this.getAll(table);
                
                // C. Delete records that are NOT in Supabase
                for (const localRecord of localRecords) {
                    if (!supabaseIds.has(localRecord.id)) {
                        console.log(`[DataLayer] Deleting orphan record from ${table}: ${localRecord.id}`);
                        await this.delete(table, localRecord.id);
                    }
                }
                
                // D. Fetch records that were updated since last sync
                // FORCE full sync for lookup tables and records that often get missed
                const forceFullSync = ['lab_records', 'expenses', 'addresses', 'specialities', 'hospitals', 'expense_categories'].includes(table);
                const lastSync = forceFullSync ? null : localStorage.getItem(`last_sync_timestamp_${table}`);
                
                const queryOptions = lastSync ? {
                    updated_at: { operator: 'gt', value: lastSync }
                } : {};

                const recentData = await window.SupabaseClient.query(table, queryOptions);

                if (recentData && recentData.length > 0) {
                    console.log(`[DataLayer] Found ${recentData.length} records for ${table}`);
                    
                    const localData = recentData.map(record => this.mapFromDb(table, record));
                    await this.bulkPut(table, localData);
                    console.log(`[DataLayer] Updated ${table} in local IndexedDB`);
                    
                    // Update sync timestamp for this table
                    localStorage.setItem(`last_sync_timestamp_${table}`, new Date().toISOString());
                } else if (!lastSync) {
                    // Even if no updates found, set initial timestamp so next sync is incremental
                    localStorage.setItem(`last_sync_timestamp_${table}`, new Date().toISOString());
                }
            }

            showNotification('Sync complete! Refreshing page...', 'success');
            
            // Trigger global sync complete event
            window.dispatchEvent(new CustomEvent('twok_sync_complete'));

            // Refresh the page after a short delay to allow the notification to be seen
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error('[DataLayer] Sync failed:', error);
            showNotification('Sync error: ' + error.message, 'error');
            throw error;
        }
    }
}

// Export as singleton
window.DataLayer = new DataLayer();
