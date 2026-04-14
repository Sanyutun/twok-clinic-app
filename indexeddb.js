/**
 * IndexedDB Wrapper for TWOK Clinic App
 * Provides promise-based CRUD operations for all data stores
 * 
 * Updated to integrate with Google Sheets backend via storageAdapter
 */

const DB_NAME = 'TWOK_Clinic_DB';
const DB_VERSION = 1;

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
    LAB_TRACKER: 'lab_tracker'
};

let dbInstance = null;
let dbOpenPromise = null;

// Reference to storageAdapter (will be set when available)
let storageAdapterInstance = null;

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

            // Create object stores with auto-increment keys
            Object.values(STORES).forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: false });
                }
            });
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
    // Use storage adapter if available
    if (storageAdapterInstance) {
        try {
            switch (storeName) {
                case STORES.PATIENTS:
                    return await storageAdapterInstance.getPatients();
                case STORES.DOCTORS:
                    return await storageAdapterInstance.getDoctors();
                case STORES.APPOINTMENTS:
                    return await storageAdapterInstance.getAppointments();
                case STORES.INSTRUCTIONS:
                    return await storageAdapterInstance.getInstructions();
                case STORES.EXPENSES:
                    return await storageAdapterInstance.getExpenses();
                case STORES.LAB_TRACKER:
                    return await storageAdapterInstance.getLabTracker();
                case STORES.ADDRESSES:
                    return storageAdapterInstance.getAddresses();
                case STORES.SPECIALITIES:
                    return storageAdapterInstance.getSpecialities();
                case STORES.HOSPITALS:
                    return storageAdapterInstance.getHospitals();
                case STORES.EXPENSE_CATEGORIES:
                    return storageAdapterInstance.getExpenseCategories();
                default:
                    // Fall back to IndexedDB
                    break;
            }
        } catch (error) {
            console.warn('[TWOKDB] Storage adapter failed, falling back to IndexedDB:', error);
        }
    }
    
    // Fall back to IndexedDB
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to get all items: ' + request.error));
    });
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
 * @returns {Promise<string>} - The ID of the added/updated item
 */
async function put(storeName, item) {
    // Use storage adapter if available
    if (storageAdapterInstance) {
        try {
            switch (storeName) {
                case STORES.PATIENTS:
                    await storageAdapterInstance.addPatient(item);
                    return item.id || item.PatientID;
                case STORES.DOCTORS:
                    await storageAdapterInstance.addDoctor(item);
                    return item.id || item.DoctorID;
                case STORES.APPOINTMENTS:
                    await storageAdapterInstance.addAppointment(item);
                    return item.id || item.AppointmentID;
                case STORES.INSTRUCTIONS:
                    await storageAdapterInstance.addInstruction(item);
                    return item.id || item.InstructionID;
                case STORES.EXPENSES:
                    await storageAdapterInstance.addExpense(item);
                    return item.id || item.ExpenseID;
                case STORES.LAB_TRACKER:
                    await storageAdapterInstance.addLab(item);
                    return item.id || item.LabID;
                case STORES.ADDRESSES:
                    storageAdapterInstance.addAddress(item);
                    return item;
                case STORES.SPECIALITIES:
                    storageAdapterInstance.addSpeciality(item);
                    return item;
                case STORES.HOSPITALS:
                    storageAdapterInstance.addHospital(item);
                    return item;
                default:
                    // Fall back to IndexedDB
                    break;
            }
        } catch (error) {
            console.warn('[TWOKDB] Storage adapter failed, falling back to IndexedDB:', error);
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
 * @returns {Promise<void>}
 */
async function remove(storeName, id) {
    // Use storage adapter if available
    if (storageAdapterInstance) {
        try {
            switch (storeName) {
                case STORES.PATIENTS:
                    await storageAdapterInstance.deletePatient(id);
                    return;
                case STORES.DOCTORS:
                    await storageAdapterInstance.deleteDoctor(id);
                    return;
                case STORES.APPOINTMENTS:
                    await storageAdapterInstance.deleteAppointment(id);
                    return;
                case STORES.ADDRESSES:
                    storageAdapterInstance.deleteAddress(id);
                    return;
                case STORES.SPECIALITIES:
                    storageAdapterInstance.deleteSpeciality(id);
                    return;
                case STORES.HOSPITALS:
                    storageAdapterInstance.deleteHospital(id);
                    return;
                default:
                    // Fall back to IndexedDB
                    break;
            }
        } catch (error) {
            console.warn('[TWOKDB] Storage adapter failed, falling back to IndexedDB:', error);
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
 * @returns {Promise<void>}
 */
async function bulkPut(storeName, items) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        items.forEach(item => {
            store.put(item);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('Failed to bulk put items: ' + transaction.error));
    });
}

/**
 * Bulk delete multiple items by IDs
 * @param {string} storeName - Name of the object store
 * @param {Array<string>} ids - IDs to delete
 * @returns {Promise<void>}
 */
async function bulkRemove(storeName, ids) {
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
