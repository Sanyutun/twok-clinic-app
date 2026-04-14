/**
 * Lab Service
 * Handles loading and processing lab tracker data
 */

class LabService {
    constructor() {
        this.labRecords = [];
    }

    /**
     * Load all lab records from IndexedDB
     * @returns {Promise<Array>}
     */
    async loadLabRecords() {
        try {
            if (window.TWOKDB) {
                this.labRecords = await window.TWOKDB.getAll(window.TWOKDB.STORES.LAB_TRACKER);
            } else {
                // Fallback to direct IndexedDB
                this.labRecords = await this.loadFromIndexedDB();
            }
            
            console.log(`[LabService] Loaded ${this.labRecords.length} lab records`);
            return this.labRecords;
        } catch (error) {
            console.error('[LabService] Failed to load lab records:', error);
            throw error;
        }
    }

    /**
     * Load from IndexedDB directly
     * @returns {Promise<Array>}
     */
    loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TWOK_Clinic_DB', 1);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['lab_tracker'], 'readonly');
                const store = transaction.objectStore('lab_tracker');
                const getAllRequest = store.getAll();
                
                getAllRequest.onsuccess = () => {
                    resolve(getAllRequest.result);
                };
                
                getAllRequest.onerror = () => {
                    reject(getAllRequest.error);
                };
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get lab records by patient ID
     * @param {string} patientId
     * @returns {Array}
     */
    getLabsByPatientId(patientId) {
        return this.labRecords.filter(lab => lab.patientId === patientId);
    }

    /**
     * Get lab records by patient name
     * @param {string} patientName
     * @returns {Array}
     */
    getLabsByPatientName(patientName) {
        return this.labRecords.filter(lab => 
            lab.patientName && lab.patientName.toLowerCase().includes(patientName.toLowerCase())
        );
    }

    /**
     * Get lab records with results available (partial or complete)
     * @returns {Array}
     */
    getResultsAvailable() {
        return this.labRecords.filter(lab => 
            lab.status === 'Partial Result Out' || lab.status === 'Complete Result Out'
        );
    }

    /**
     * Get lab records by status
     * @param {string} status
     * @returns {Array}
     */
    getLabsByStatus(status) {
        return this.labRecords.filter(lab => lab.status === status);
    }

    /**
     * Get lab records by date range
     * @param {string} fromDate - YYYY-MM-DD
     * @param {string} toDate - YYYY-MM-DD
     * @returns {Array}
     */
    getLabsByDateRange(fromDate, toDate) {
        return this.labRecords.filter(lab => {
            if (!lab.dateTime) return false;
            
            const labDate = lab.dateTime.split('T')[0];
            
            if (fromDate && labDate < fromDate) return false;
            if (toDate && labDate > toDate) return false;
            
            return true;
        });
    }

    /**
     * Get completed tests for a patient
     * @param {string} patientId
     * @returns {Array<string>}
     */
    getCompletedTests(patientId) {
        return this.labRecords
            .filter(lab => 
                lab.patientId === patientId && 
                (lab.status === 'Partial Result Out' || lab.status === 'Complete Result Out')
            )
            .map(lab => lab.labName || lab.testName);
    }

    /**
     * Get pending tests for a patient
     * @param {string} patientId
     * @param {Array<string>} requiredTests
     * @returns {Array<string>}
     */
    getPendingTests(patientId, requiredTests) {
        const completedTests = this.getCompletedTests(patientId);
        return requiredTests.filter(test => !completedTests.includes(test));
    }

    /**
     * Check if all tests are completed for a patient
     * @param {string} patientId
     * @param {Array<string>} requiredTests
     * @returns {boolean}
     */
    areAllTestsCompleted(patientId, requiredTests) {
        if (!requiredTests || requiredTests.length === 0) return true;
        
        const completedTests = this.getCompletedTests(patientId);
        return requiredTests.every(test => completedTests.includes(test));
    }

    /**
     * Get test status summary for a patient
     * @param {string} patientId
     * @param {Array<string>} requiredTests
     * @returns {Object}
     */
    getTestStatusSummary(patientId, requiredTests) {
        if (!requiredTests || requiredTests.length === 0) {
            return { completed: [], pending: [], allCompleted: true };
        }
        
        const completedTests = this.getCompletedTests(patientId);
        const completed = requiredTests.filter(test => completedTests.includes(test));
        const pending = requiredTests.filter(test => !completedTests.includes(test));
        
        return {
            completed,
            pending,
            allCompleted: pending.length === 0
        };
    }

    /**
     * Get lab records filtered by doctor
     * @param {string} doctorName
     * @returns {Array}
     */
    filterByDoctor(doctorName) {
        if (!doctorName) return this.labRecords;
        
        return this.labRecords.filter(lab => 
            lab.doctorName === doctorName
        );
    }
}

// Export singleton instance
window.labService = new LabService();
