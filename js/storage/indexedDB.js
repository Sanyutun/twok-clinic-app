/**
 * IndexedDB Storage Module
 * 
 * Provides offline data storage using IndexedDB.
 * Handles caching of all clinic data for offline access.
 */

const DB_NAME = 'TWOK_Clinic_DB';
const DB_VERSION = 1;

const STORES = {
    PATIENTS: 'patients',
    DOCTORS: 'doctors',
    APPOINTMENTS: 'appointments',
    INSTRUCTIONS: 'instructions',
    EXPENSES: 'expenses',
    LAB_TRACKING: 'labTracking',
    SETTINGS: 'settings',
    SYNC_META: 'syncMeta'
};

class IndexedDBStorage {
    constructor() {
        this.db = null;
        this.openRequest = null;
    }

    /**
     * Open database connection
     */
    async open() {
        if (this.db) {
            return this.db;
        }

        if (this.openRequest) {
            return new Promise((resolve, reject) => {
                this.openRequest.onsuccess = () => resolve(this.openRequest.result);
                this.openRequest.onerror = () => reject(this.openRequest.error);
            });
        }

        return new Promise((resolve, reject) => {
            this.openRequest = indexedDB.open(DB_NAME, DB_VERSION);

            this.openRequest.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };

            this.openRequest.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            this.openRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * Create object stores and indexes
     */
    createStores(db) {
        // Patients store
        if (!db.objectStoreNames.contains(STORES.PATIENTS)) {
            const patientStore = db.createObjectStore(STORES.PATIENTS, { keyPath: 'PatientID' });
            patientStore.createIndex('PatientName', 'PatientName', { unique: false });
            patientStore.createIndex('UpdatedAt', 'UpdatedAt', { unique: false });
        }

        // Doctors store
        if (!db.objectStoreNames.contains(STORES.DOCTORS)) {
            const doctorStore = db.createObjectStore(STORES.DOCTORS, { keyPath: 'DoctorID' });
            doctorStore.createIndex('DoctorName', 'DoctorName', { unique: false });
            doctorStore.createIndex('UpdatedAt', 'UpdatedAt', { unique: false });
        }

        // Appointments store
        if (!db.objectStoreNames.contains(STORES.APPOINTMENTS)) {
            const appointmentStore = db.createObjectStore(STORES.APPOINTMENTS, { keyPath: 'AppointmentID' });
            appointmentStore.createIndex('PatientID', 'PatientID', { unique: false });
            appointmentStore.createIndex('AppointmentDate', 'AppointmentDate', { unique: false });
            appointmentStore.createIndex('Status', 'Status', { unique: false });
            appointmentStore.createIndex('UpdatedAt', 'UpdatedAt', { unique: false });
        }

        // Instructions store
        if (!db.objectStoreNames.contains(STORES.INSTRUCTIONS)) {
            const instructionStore = db.createObjectStore(STORES.INSTRUCTIONS, { keyPath: 'InstructionID' });
            instructionStore.createIndex('PatientID', 'PatientID', { unique: false });
            instructionStore.createIndex('AppointmentDate', 'AppointmentDate', { unique: false });
        }

        // Expenses store
        if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
            const expenseStore = db.createObjectStore(STORES.EXPENSES, { keyPath: 'ExpenseID' });
            expenseStore.createIndex('Category', 'Category', { unique: false });
            expenseStore.createIndex('DateTime', 'DateTime', { unique: false });
        }

        // Lab Tracking store
        if (!db.objectStoreNames.contains(STORES.LAB_TRACKING)) {
            const labStore = db.createObjectStore(STORES.LAB_TRACKING, { keyPath: 'LabID' });
            labStore.createIndex('PatientID', 'PatientID', { unique: false });
            labStore.createIndex('Status', 'Status', { unique: false });
            labStore.createIndex('UpdatedAt', 'UpdatedAt', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
            db.createObjectStore(STORES.SETTINGS, { keyPath: 'SettingKey' });
        }

        // Sync Metadata store
        if (!db.objectStoreNames.contains(STORES.SYNC_META)) {
            db.createObjectStore(STORES.SYNC_META, { keyPath: 'key' });
        }
    }

    /**
     * Generic method to get all items from a store
     */
    async getAll(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single item by key
     */
    async get(storeName, key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Add or update an item
     */
    async put(storeName, item) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Add multiple items (bulk operation)
     */
    async putMany(storeName, items) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            items.forEach(item => {
                store.put(item);
            });

            transaction.oncomplete = () => resolve(items.length);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Delete an item by key
     */
    async delete(storeName, key) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all items from a store
     */
    async clear(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get sync metadata
     */
    async getSyncMeta(key) {
        return await this.get(STORES.SYNC_META, key);
    }

    /**
     * Set sync metadata
     */
    async setSyncMeta(key, value) {
        return await this.put(STORES.SYNC_META, { key, value, timestamp: Date.now() });
    }

    // ==================== Convenience Methods ====================

    async getPatients() {
        return await this.getAll(STORES.PATIENTS);
    }

    async getDoctors() {
        return await this.getAll(STORES.DOCTORS);
    }

    async getAppointments() {
        return await this.getAll(STORES.APPOINTMENTS);
    }

    async getInstructions() {
        return await this.getAll(STORES.INSTRUCTIONS);
    }

    async getExpenses() {
        return await this.getAll(STORES.EXPENSES);
    }

    async getLabTracking() {
        return await this.getAll(STORES.LAB_TRACKING);
    }

    async getSettings() {
        return await this.getAll(STORES.SETTINGS);
    }

    /**
     * Cache data from Google Sheets
     */
    async cacheData(dataType, items) {
        const storeMap = {
            'patients': STORES.PATIENTS,
            'doctors': STORES.DOCTORS,
            'appointments': STORES.APPOINTMENTS,
            'instructions': STORES.INSTRUCTIONS,
            'expenses': STORES.EXPENSES,
            'labs': STORES.LAB_TRACKING,
            'settings': STORES.SETTINGS
        };

        const storeName = storeMap[dataType];
        if (!storeName) {
            throw new Error(`Unknown data type: ${dataType}`);
        }

        // Convert settings array to key-value format
        if (dataType === 'settings') {
            const settingsItems = items.map(item => ({
                SettingKey: item.SettingKey,
                SettingValue: item.SettingValue
            }));
            return await this.putMany(storeName, settingsItems);
        }

        return await this.putMany(storeName, items);
    }

    /**
     * Get last sync timestamp for a data type
     */
    async getLastSyncTime(dataType) {
        const meta = await this.getSyncMeta(`lastSync_${dataType}`);
        return meta ? meta.value : 0;
    }

    /**
     * Set last sync timestamp
     */
    async setLastSyncTime(dataType, timestamp) {
        return await this.setSyncMeta(`lastSync_${dataType}`, timestamp);
    }

    /**
     * Clear all cached data
     */
    async clearAll() {
        const db = await this.open();
        const storeNames = Array.from(db.objectStoreNames);
        
        for (const storeName of storeNames) {
            if (storeName !== STORES.SYNC_META) {
                await this.clear(storeName);
            }
        }
    }

    /**
     * Export all data for backup
     */
    async exportData() {
        return {
            exportDate: new Date().toISOString(),
            patients: await this.getPatients(),
            doctors: await this.getDoctors(),
            appointments: await this.getAppointments(),
            instructions: await this.getInstructions(),
            expenses: await this.getExpenses(),
            labTracking: await this.getLabTracking(),
            settings: await this.getSettings()
        };
    }
}

// Export singleton instance
export const indexedDBStorage = new IndexedDBStorage();
export default indexedDBStorage;
export { STORES };
