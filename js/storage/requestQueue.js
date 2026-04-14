/**
 * Request Queue Module
 * 
 * Stores API requests when offline and replays them when connection is restored.
 * Uses IndexedDB for persistent storage of queued requests.
 */

const QUEUE_DB_NAME = 'TWOK_Clinic_RequestQueue';
const QUEUE_STORE_NAME = 'requests';
const QUEUE_DB_VERSION = 1;

class RequestQueue {
    constructor() {
        this.db = null;
        this.listeners = [];
    }

    /**
     * Open database connection
     */
    async open() {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
                    const store = db.createObjectStore(QUEUE_STORE_NAME, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('endpoint', 'endpoint', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * Add a request to the queue
     */
    async enqueue(queueItem) {
        const db = await this.open();
        
        const item = {
            id: Date.now() + Math.random(),
            endpoint: queueItem.endpoint,
            method: queueItem.method || 'GET',
            payload: queueItem.payload,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'pending'
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([QUEUE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(QUEUE_STORE_NAME);
            const request = store.add(item);

            request.onsuccess = () => {
                this.notifyListeners('enqueue', item);
                resolve(item);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all pending requests
     */
    async getAll() {
        const db = await this.open();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([QUEUE_STORE_NAME], 'readonly');
            const store = transaction.objectStore(QUEUE_STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result || [];
                // Sort by timestamp (oldest first)
                items.sort((a, b) => a.timestamp - b.timestamp);
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get count of pending requests
     */
    async getCount() {
        const items = await this.getAll();
        return items.filter(item => item.status === 'pending').length;
    }

    /**
     * Update a queued request
     */
    async update(id, updates) {
        const db = await this.open();
        const item = await this.getById(id);
        
        if (!item) {
            throw new Error(`Queue item ${id} not found`);
        }

        const updatedItem = { ...item, ...updates };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([QUEUE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(QUEUE_STORE_NAME);
            const request = store.put(updatedItem);

            request.onsuccess = () => resolve(updatedItem);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a single request by ID
     */
    async getById(id) {
        const db = await this.open();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([QUEUE_STORE_NAME], 'readonly');
            const store = transaction.objectStore(QUEUE_STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Remove a request from the queue
     */
    async remove(id) {
        const db = await this.open();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([QUEUE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(QUEUE_STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                this.notifyListeners('dequeue', { id });
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all requests from the queue
     */
    async clear() {
        const db = await this.open();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([QUEUE_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(QUEUE_STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                this.notifyListeners('clear', {});
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Mark a request as completed and remove it
     */
    async complete(id) {
        await this.remove(id);
    }

    /**
     * Mark a request as failed
     */
    async markFailed(id, error) {
        const item = await this.getById(id);
        if (item) {
            const retryCount = (item.retryCount || 0) + 1;
            
            if (retryCount >= 3) {
                // Max retries reached, mark as failed permanently
                await this.update(id, { 
                    status: 'failed', 
                    error: error?.message || 'Unknown error',
                    retryCount 
                });
            } else {
                await this.update(id, { 
                    status: 'pending', 
                    retryCount,
                    lastRetry: Date.now()
                });
            }
        }
    }

    /**
     * Get failed requests
     */
    async getFailed() {
        const items = await this.getAll();
        return items.filter(item => item.status === 'failed');
    }

    /**
     * Retry failed requests
     */
    async retryFailed() {
        const failed = await this.getFailed();
        for (const item of failed) {
            await this.update(item.id, { 
                status: 'pending', 
                retryCount: 0,
                error: null 
            });
        }
        return failed.length;
    }

    /**
     * Add event listener for queue changes
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove event listener
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    /**
     * Notify all listeners of queue changes
     */
    notifyListeners(action, data) {
        this.listeners.forEach(listener => {
            try {
                listener(action, data);
            } catch (error) {
                console.error('Error in queue listener:', error);
            }
        });
    }

    /**
     * Get queue statistics
     */
    async getStats() {
        const items = await this.getAll();
        return {
            total: items.length,
            pending: items.filter(i => i.status === 'pending').length,
            failed: items.filter(i => i.status === 'failed').length,
            oldest: items.length > 0 ? items[0].timestamp : null,
            newest: items.length > 0 ? items[items.length - 1].timestamp : null
        };
    }
}

// Export singleton instance
export const requestQueue = new RequestQueue();
export default requestQueue;
