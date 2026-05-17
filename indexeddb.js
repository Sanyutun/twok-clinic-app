/**
 * IndexedDB Wrapper for TWOK Clinic App
 * Provides promise-based CRUD operations for all data stores
 * 
 * Updated to integrate with Google Sheets backend via storageAdapter
 */

const DB_NAME = 'TWOK_Clinic_DB';
const DB_VERSION = 3;

// Store names matching original localStorage keys
const STORES = {
    PATIENTS: 'patients',
    ADDRESSES: 'addresses',
    DOCTORS: 'doctors',
    SPECIALITIES: 'specialities',
    HOSPITALS: 'hospitals',
    APPOINTMENTS: 'appointments',
    INSTRUCTIONS: 'instructions',
    EXPENSES: 'expenses',
    EXPENSE_CATEGORIES: 'expense_categories',
    LAB_TRACKER: 'lab_records', // Point to new store name
    LAB_RECORDS: 'lab_records',
    SETTINGS: 'settings',
    SYNC_META: 'syncMeta'
};

let dbInstance = null;
let dbOpenPromise = null;

// Reference to storageAdapter (will be set when available)
let storageAdapterInstance = null;
let isProcessingAdapter = false;

/**
 * Set storage adapter instance (called from app initialization)
 */
function setStorageAdapter(adapter) {
    storageAdapterInstance = adapter;
    console.log('[TWOKDB] Storage adapter set');
}

/**
 * Open database connection
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    if (dbInstance) {
        return Promise.resolve(dbInstance);
    }

    if (dbOpenPromise) {
        return dbOpenPromise;
    }

    dbOpenPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            dbOpenPromise = null;
            reject(new Error('Failed to open IndexedDB: ' + request.error));
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onclose = () => {
                dbInstance = null;
            };
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction;

            // Create object stores with auto-increment keys
            Object.values(STORES).forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: false });
                }
            });

            // Migrate lab_tracker to lab_records if it exists
            if (db.objectStoreNames.contains('lab_tracker') && !db.objectStoreNames.contains('lab_records_migrated')) {
                console.log('[TWOKDB] Migrating lab_tracker to lab_records...');
                const oldStore = transaction.objectStore('lab_tracker');
                const newStore = transaction.objectStore('lab_records');
                
                oldStore.openCursor().onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        newStore.put(cursor.value);
                        cursor.continue();
                    } else {
                        console.log('[TWOKDB] Lab migration data copy complete');
                        // We can't easily delete store while cursor is open or in same transaction without care
                        // So we just mark as migrated and legacy code will use the new store
                        db.createObjectStore('lab_records_migrated'); 
                    }
                };
            }
        };
    });

    return dbOpenPromise;
}

/**
 * Get all items from a store
 * @param {string} storeName - Name of the object store
 * @returns {Promise<Array>}
 */
async function getAll(storeName) {
    // Always fetch from IndexedDB to ensure fresh data for real-time updates
    const db = await openDB();
    const records = await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to get all items: ' + request.error));
    });

    // If storage adapter is present, keep its cache in sync with the fresh data
    if (storageAdapterInstance && typeof storageAdapterInstance.updateCache === 'function') {
        storageAdapterInstance.updateCache(storeName, records);
    }
    
    return records;
}

/**
 * Get a single item by ID
 * @param {string} storeName - Name of the object store
 * @param {string} id - Item ID
 * @returns {Promise<Object|null>}
 */
async function getById(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to get item: ' + request.error));
    });
}

/**
 * Add or update an item
 * @param {string} storeName - Name of the object store
 * @param {Object} item - Item to add/update
 * @param {boolean} skipSync - If true, do not trigger cloud sync
 * @returns {Promise<string>} - The ID of the added/updated item
 */
async function put(storeName, item, skipSync = false) {
    // 1. Trigger cloud sync if not skipped
    if (!skipSync && window.DataLayer && typeof window.DataLayer.saveWithSync === 'function') {
        try {
            await window.DataLayer.saveWithSync(storeName, 'upsert', item, item.id || item.PatientID || item.DoctorID || item.AppointmentID || item.InstructionID || item.ExpenseID || item.LabID);
            return item.id || item.PatientID || item.DoctorID || item.AppointmentID || item.InstructionID || item.ExpenseID || item.LabID;
        } catch (error) {
            console.warn('[TWOKDB] Cloud sync failed in put(), falling back to local only:', error);
        }
    }

    // Use storage adapter if available
    if (storageAdapterInstance && !isProcessingAdapter) {
        isProcessingAdapter = true;
        try {
            const isUpdate = !!(item.id || item.PatientID || item.DoctorID || item.AppointmentID || item.InstructionID || item.ExpenseID || item.LabID);
            
            switch (storeName) {
                case STORES.PATIENTS:
                    if (isUpdate) await storageAdapterInstance.updatePatient(item.PatientID || item.id, item, skipSync);
                    else await storageAdapterInstance.addPatient(item, skipSync);
                    if (!skipSync) return item.id || item.PatientID;
                    break;
                case STORES.DOCTORS:
                    if (isUpdate) await storageAdapterInstance.updateDoctor(item.DoctorID || item.id, item, skipSync);
                    else await storageAdapterInstance.addDoctor(item, skipSync);
                    if (!skipSync) return item.id || item.DoctorID;
                    break;
                case STORES.APPOINTMENTS:
                    if (isUpdate) await storageAdapterInstance.updateAppointment(item.AppointmentID || item.id, item, skipSync);
                    else await storageAdapterInstance.addAppointment(item, skipSync);
                    if (!skipSync) return item.id || item.AppointmentID;
                    break;
                case STORES.INSTRUCTIONS:
                    await storageAdapterInstance.addInstruction(item, skipSync);
                    if (!skipSync) return item.id || item.InstructionID;
                    break;
                case STORES.EXPENSES:
                    await storageAdapterInstance.addExpense(item, skipSync);
                    if (!skipSync) return item.id || item.ExpenseID;
                    break;
                case STORES.LAB_TRACKER:
                    if (isUpdate) await storageAdapterInstance.updateLab(item.LabID || item.labId || item.id, item, skipSync);
                    else await storageAdapterInstance.addLab(item, skipSync);
                    if (!skipSync) return item.id || item.LabID;
                    break;
                case STORES.ADDRESSES:
                    storageAdapterInstance.addAddress(item);
                    if (!skipSync) return item;
                    break;
                case STORES.SPECIALITIES:
                    storageAdapterInstance.addSpeciality(item);
                    if (!skipSync) return item;
                    break;
                case STORES.HOSPITALS:
                    storageAdapterInstance.addHospital(item);
                    if (!skipSync) return item;
                    break;
                default:
                    // Fall back to IndexedDB
                    break;
            }
        } catch (error) {
            console.warn('[TWOKDB] Storage adapter failed, falling back to IndexedDB:', error);
        } finally {
            isProcessingAdapter = false;
        }
    }
    
    // Fall back to IndexedDB
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);

        request.onsuccess = () => resolve(item.id);
        request.onerror = () => reject(new Error('Failed to put item: ' + request.error));
    });
}

/**
 * Delete an item by ID
 * @param {string} storeName - Name of the object store
 * @param {string} id - Item ID to delete
 * @param {boolean} skipSync - If true, do not trigger cloud sync
 * @returns {Promise<void>}
 */
async function remove(storeName, id, skipSync = false) {
    // 1. Trigger cloud sync if not skipped
    if (!skipSync && window.DataLayer && typeof window.DataLayer.saveWithSync === 'function') {
        try {
            await window.DataLayer.saveWithSync(storeName, 'delete', null, id);
            return;
        } catch (error) {
            console.warn('[TWOKDB] Cloud sync failed in remove(), falling back to local only:', error);
        }
    }

    // Use storage adapter if available
    if (storageAdapterInstance && !isProcessingAdapter) {
        isProcessingAdapter = true;
        try {
            switch (storeName) {
                case STORES.PATIENTS:
                    await storageAdapterInstance.deletePatient(id, skipSync);
                    if (!skipSync) return;
                    break;
                case STORES.DOCTORS:
                    await storageAdapterInstance.deleteDoctor(id, skipSync);
                    if (!skipSync) return;
                    break;
                case STORES.APPOINTMENTS:
                    await storageAdapterInstance.deleteAppointment(id, skipSync);
                    if (!skipSync) return;
                    break;
                case STORES.ADDRESSES:
                    storageAdapterInstance.deleteAddress(id);
                    if (!skipSync) return;
                    break;
                case STORES.SPECIALITIES:
                    storageAdapterInstance.deleteSpeciality(id);
                    if (!skipSync) return;
                    break;
                case STORES.HOSPITALS:
                    storageAdapterInstance.deleteHospital(id);
                    if (!skipSync) return;
                    break;
                default:
                    // Fall back to IndexedDB
                    break;
            }
        } catch (error) {
            console.warn('[TWOKDB] Storage adapter failed, falling back to IndexedDB:', error);
        } finally {
            isProcessingAdapter = false;
        }
    }
    
    // Fall back to IndexedDB
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to delete item: ' + request.error));
    });
}

/**
 * Clear all items from a store
 * @param {string} storeName - Name of the object store
 * @returns {Promise<void>}
 */
async function clear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to clear store: ' + request.error));
    });
}

/**
 * Count items in a store
 * @param {string} storeName - Name of the object store
 * @returns {Promise<number>}
 */
async function count(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to count items: ' + request.error));
    });
}

/**
 * Bulk add/update multiple items
 * @param {string} storeName - Name of the object store
 * @param {Array<Object>} items - Items to add/update
 * @param {boolean} skipSync - If true, do not trigger cloud sync
 * @returns {Promise<void>}
 */
async function bulkPut(storeName, items, skipSync = false) {
    // 1. Trigger cloud sync if not skipped
    if (!skipSync && window.DataLayer && typeof window.DataLayer.bulkPutWithSync === 'function') {
        try {
            await window.DataLayer.bulkPutWithSync(storeName, items);
            return;
        } catch (error) {
            console.warn('[TWOKDB] Cloud sync failed in bulkPut(), falling back to local only:', error);
        }
    }

    const db = await openDB();
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        items.forEach(item => {
            store.put(item);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to bulk put items: ' + transaction.error));
    });

    // If storage adapter is present, refresh its cache to ensure consistency
    // We fetch all records because bulkPut might be a partial update or full replace
    if (storageAdapterInstance && typeof storageAdapterInstance.updateCache === 'function') {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => {
            storageAdapterInstance.updateCache(storeName, request.result);
        };
    }
}

/**
 * Bulk delete multiple items by IDs
 * @param {string} storeName - Name of the object store
 * @param {Array<string>} ids - IDs to delete
 * @param {boolean} skipSync - If true, do not trigger cloud sync
 * @returns {Promise<void>}
 */
async function bulkRemove(storeName, ids, skipSync = false) {
    // 1. Trigger cloud sync if not skipped
    if (!skipSync && window.DataLayer && typeof window.DataLayer.saveWithSync === 'function') {
        try {
            for (const id of ids) {
                await window.DataLayer.saveWithSync(storeName, 'delete', null, id);
            }
            return;
        } catch (error) {
            console.warn('[TWOKDB] Cloud sync failed in bulkRemove(), falling back to local only:', error);
        }
    }

    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        ids.forEach(id => {
            store.delete(id);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to bulk delete items: ' + transaction.error));
    });
}

/**
 * Query items by index
 * @param {string} storeName - Name of the object store
 * @param {string} indexField - Field to index on
 * @param {IDBKeyRange} keyRange - Key range (e.g., IDBKeyRange.only('value'))
 * @returns {Promise<Array>}
 */
async function queryByIndex(storeName, indexField, keyRange) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        
        // Check if index exists
        const indexNames = Array.from(store.indexNames);
        if (!indexNames.includes(indexField)) {
            // If index doesn't exist, fall back to filtering
            getAll(storeName).then(items => {
                const value = keyRange.only ? keyRange.only() : keyRange;
                resolve(items.filter(item => item[indexField] === value));
            });
            return;
        }
        
        const index = store.index(indexField);
        const request = index.getAll(keyRange);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to query by index: ' + request.error));
    });
}

/**
 * Close database connection
 * @returns {void}
 */
function closeDB() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        dbOpenPromise = null;
    }
}

/**
 * Export all data from all stores
 * @returns {Promise<Object>}
 */
async function exportAllData() {
    const data = {};
    for (const [key, storeName] of Object.entries(STORES)) {
        data[key] = await getAll(storeName);
    }
    return data;
}

/**
 * Import data into all stores
 * @param {Object} data - Data to import
 * @returns {Promise<void>}
 */
async function importAllData(data) {
    for (const [key, items] of Object.entries(data)) {
        const storeName = STORES[key];
        if (storeName && Array.isArray(items)) {
            await bulkPut(storeName, items);
        }
    }
}

/**
 * Initialize database and migrate from localStorage if needed
 * @returns {Promise<boolean>} - True if migration occurred
 */
async function initDB() {
    try {
        await openDB();
        
        // Check if localStorage has data to migrate
        const hasLocalStorageData = localStorage.getItem('twok_clinic_patients') !== null;
        
        if (hasLocalStorageData) {
            await migrateFromLocalStorage();
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error initializing IndexedDB:', error);
        throw error;
    }
}

/**
 * Migrate data from localStorage to IndexedDB
 */
async function migrateFromLocalStorage() {
    const migrationMap = [
        { localStorageKey: 'twok_clinic_patients', store: STORES.PATIENTS },
        { localStorageKey: 'twok_clinic_addresses', store: STORES.ADDRESSES },
        { localStorageKey: 'twok_clinic_doctors', store: STORES.DOCTORS },
        { localStorageKey: 'twok_clinic_specialities', store: STORES.SPECIALITIES },
        { localStorageKey: 'twok_clinic_hospitals', store: STORES.HOSPITALS },
        { localStorageKey: 'twok_clinic_appointments', store: STORES.APPOINTMENTS },
        { localStorageKey: 'twok_clinic_instructions', store: STORES.INSTRUCTIONS },
        { localStorageKey: 'twok_clinic_expenses', store: STORES.EXPENSES },
        { localStorageKey: 'twok_clinic_expense_categories', store: STORES.EXPENSE_CATEGORIES },
        { localStorageKey: 'twok_clinic_lab_tracker', store: STORES.LAB_TRACKER }
    ];

    console.log('Starting migration from localStorage to IndexedDB...');
    
    for (const { localStorageKey, store } of migrationMap) {
        const data = localStorage.getItem(localStorageKey);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    await bulkPut(store, parsed);
                    console.log(`Migrated ${parsed.length} items from ${localStorageKey} to ${store}`);
                }
            } catch (e) {
                console.error(`Error migrating ${localStorageKey}:`, e);
            }
        }
    }
    
    console.log('Migration completed!');
}

// Export for use in other modules
window.TWOKDB = {
    openDB,
    getAll,
    getById,
    put,
    remove,
    clear,
    count,
    bulkPut,
    bulkRemove,
    queryByIndex,
    closeDB,
    exportAllData,
    importAllData,
    initDB,
    setStorageAdapter,
    STORES
};
