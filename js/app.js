/**
 * TWOK Clinic App - Main Module
 *
 * Initializes all modules and provides a unified interface for the application.
 */

import { CONFIG, isOnline } from './config.js';
import { indexedDBStorage } from './storage/indexedDB.js';
import { websocketClient } from './websocket/socketClient.js';

class TWOKClinicApp {
    constructor() {
        this.initialized = false;
        this.listeners = [];
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) {
            console.log('[TWOKClinicApp] Already initialized');
            return;
        }

        console.log('[TWOKClinicApp] Initializing...');

        try {
            // Initialize IndexedDB
            await indexedDBStorage.open();
            console.log('[TWOKClinicApp] ✓ IndexedDB initialized');

            // Initialize WebSocket
            websocketClient.connect();
            console.log('[TWOKClinicApp] ✓ WebSocket connecting...');

            // Set up WebSocket listeners
            websocketClient.on('queue_update', (data) => {
                this.notifyListeners('queue-update', data);
            });

            websocketClient.on('patient_update', (data) => {
                this.notifyListeners('patient-update', data);
            });

            websocketClient.on('appointment_update', (data) => {
                this.notifyListeners('appointment-update', data);
            });

            // Register service worker
            await this.registerServiceWorker();

            this.initialized = true;
            console.log('[TWOKClinicApp] ✓ Initialization complete');

            this.notifyListeners('initialized', {});

        } catch (error) {
            console.error('[TWOKClinicApp] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Register service worker
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/'
                });
                console.log('[TWOKClinicApp] ✓ Service Worker registered:', registration.scope);

                // Listen for service worker messages
                navigator.serviceWorker.addEventListener('message', (event) => {
                    const { type, payload } = event.data || {};
                    console.log('[TWOKClinicApp] Service Worker message:', type);
                    this.notifyListeners('sw-message', { type, payload });
                });

            } catch (error) {
                console.error('[TWOKClinicApp] Service Worker registration failed:', error);
            }
        } else {
            console.warn('[TWOKClinicApp] Service Workers not supported');
        }
    }

    /**
     * Get cached data from IndexedDB
     */
    async getCachedData() {
        return {
            patients: await indexedDBStorage.getPatients(),
            doctors: await indexedDBStorage.getDoctors(),
            appointments: await indexedDBStorage.getAppointments(),
            instructions: await indexedDBStorage.getInstructions(),
            expenses: await indexedDBStorage.getExpenses(),
            labTracking: await indexedDBStorage.getLabTracking(),
            settings: await indexedDBStorage.getSettings()
        };
    }

    /**
     * Refresh data from IndexedDB
     */
    async refreshData() {
        await indexedDBStorage.open();
        return this.getCachedData();
    }

    /**
     * Get data from IndexedDB
     */
    async getData(dataType) {
        return await indexedDBStorage[`get${this.capitalize(dataType)}`]();
    }

    /**
     * Add data
     */
    async addData(dataType, item) {
        const storeName = dataType.toLowerCase() === 'lab_tracking' ? 'labTracking' : dataType.toLowerCase();
        await indexedDBStorage.put(storeName, item);
        this.broadcastUpdate(dataType, item);
        return item;
    }

    /**
     * Update data
     */
    async updateData(dataType, id, item) {
        const storeName = dataType.toLowerCase() === 'lab_tracking' ? 'labTracking' : dataType.toLowerCase();
        await indexedDBStorage.put(storeName, { ...item, [this.getIdField(dataType)]: id });
        this.broadcastUpdate(dataType, item);
        return { ...item, [this.getIdField(dataType)]: id };
    }

    /**
     * Delete data
     */
    async deleteData(dataType, id) {
        const storeName = dataType.toLowerCase() === 'lab_tracking' ? 'labTracking' : dataType.toLowerCase();
        await indexedDBStorage.delete(storeName, id);
        return true;
    }

    /**
     * Get ID field name for a data type
     */
    getIdField(dataType) {
        const idFields = {
            patients: 'PatientID',
            doctors: 'DoctorID',
            appointments: 'AppointmentID',
            instructions: 'InstructionID',
            expenses: 'ExpenseID',
            labTracking: 'LabID',
            settings: 'SettingKey'
        };
        return idFields[dataType.toLowerCase()] || 'id';
    }

    /**
     * Broadcast update via WebSocket
     */
    broadcastUpdate(dataType, data) {
        const typeMap = {
            patients: 'patient_update',
            doctors: 'doctor_update',
            appointments: 'appointment_update',
            instructions: 'instruction_update',
            expenses: 'expense_update',
            labTracking: 'lab_update'
        };

        const wsType = typeMap[dataType.toLowerCase()];
        if (wsType) {
            websocketClient.send(wsType, { [dataType.toLowerCase()]: data });
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            online: isOnline(),
            websocket: websocketClient.getStatus()
        };
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        this.listeners = this.listeners.filter(
            l => !(l.event === event && l.callback === callback)
        );
    }

    /**
     * Notify all listeners
     */
    notifyListeners(event, data) {
        this.listeners
            .filter(l => l.event === event || l.event === 'all')
            .forEach(l => {
                try {
                    l.callback(data);
                } catch (error) {
                    console.error('[TWOKClinicApp] Listener error:', error);
                }
            });
    }

    /**
     * Capitalize first letter
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Export singleton instance
export const twokClinicApp = new TWOKClinicApp();
export default twokClinicApp;

// Also export individual modules for direct access
export {
    CONFIG,
    indexedDBStorage,
    websocketClient,
    isOnline
};
