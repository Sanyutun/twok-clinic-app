/**
 * Instruction Service
 * Handles loading and processing doctor instructions
 */

class InstructionService {
    constructor() {
        this.instructions = [];
    }

    /**
     * Load all instructions from IndexedDB
     * @returns {Promise<Array>}
     */
    async loadInstructions() {
        try {
            if (window.TWOKDB) {
                this.instructions = await window.TWOKDB.getAll(window.TWOKDB.STORES.INSTRUCTIONS);
            } else {
                // Fallback to direct IndexedDB
                this.instructions = await this.loadFromIndexedDB();
            }
            
            console.log(`[InstructionService] Loaded ${this.instructions.length} instructions`);
            return this.instructions;
        } catch (error) {
            console.error('[InstructionService] Failed to load instructions:', error);
            throw error;
        }
    }

    /**
     * Load from IndexedDB directly
     * @returns {Promise<Array>}
     */
    loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TWOK_Clinic_DB', 3);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['instructions'], 'readonly');
                const store = transaction.objectStore('instructions');
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
     * Get valid instructions (excluding PRN and Transfer to Hospital)
     * @param {Array} instructions - Optional instructions array to filter
     * @returns {Array}
     */
    getValidInstructions(instructions = null) {
        const data = instructions || this.instructions;
        
        return data.filter(inst => {
            const other = (inst.otherInstruction || '').trim();
            const general = (inst.generalInstruction || '').trim();
            const otherLower = other.toLowerCase();
            const generalLower = general.toLowerCase();

            // Exclude PRN and Transfer to Hospital (case-insensitive check for multiple variations)
            // Check both otherInstruction and generalInstruction fields
            const isExcluded = (str) => {
                if (!str) return false;
                const s = str.toLowerCase().trim();
                return s === 'prn' || 
                       s === 'p.r.n' ||
                       s === 'p.r.n (as needed)' || 
                       s === 'prn (as needed)' ||
                       s === 'transfer to hospital' ||
                       s === 'transfer' ||
                       s.includes('transfer to hospital') ||
                       s.includes('p.r.n') ||
                       s.includes('as needed') ||
                       s.includes('as-needed') ||
                       s.includes('transfer to') ||
                       // Also check for PRN as a word to avoid matching "spring"
                       /\bprn\b/.test(s);
            };

            if (isExcluded(other) || isExcluded(general)) {
                return false;
            }
            
            // Must have either nextAppointmentDate, returnDuration, selectedTests, or otherInstruction
            return (inst.nextAppointmentDate && inst.nextAppointmentDate.trim() !== '') || 
                   (inst.returnDuration && inst.returnUnit) ||
                   (inst.selectedTests && inst.selectedTests.length > 0) || 
                   otherLower === 'after results' ||
                   otherLower === 'do tests before';
        });
    }

    /**
     * Get instructions with follow-up dates
     * @returns {Array}
     */
    getFollowUpInstructions() {
        return this.getValidInstructions()
            .filter(inst => inst.nextAppointmentDate);
    }

    /**
     * Get instructions with tests before visit
     * @returns {Array}
     */
    getTestBeforeVisitInstructions() {
        return this.getValidInstructions()
            .filter(inst => inst.selectedTests && inst.selectedTests.length > 0);
    }

    /**
     * Get instructions with "After Results" type
     * @returns {Array}
     */
    getAfterResultsInstructions() {
        return this.getValidInstructions()
            .filter(inst => inst.otherInstruction === 'After Results');
    }

    /**
     * Get unique doctors from instructions
     * @returns {Array<string>}
     */
    getUniqueDoctors() {
        const doctors = new Set();
        
        this.getValidInstructions().forEach(inst => {
            if (inst.followUpDoctor) {
                doctors.add(inst.followUpDoctor);
            } else if (inst.doctorName) {
                doctors.add(inst.doctorName);
            }
        });
        
        return Array.from(doctors).sort();
    }

    /**
     * Filter instructions by doctor
     * @param {string} doctorName
     * @returns {Array}
     */
    filterByDoctor(doctorName) {
        if (!doctorName) return this.getValidInstructions();
        
        return this.getValidInstructions().filter(inst => {
            const doctor = inst.followUpDoctor || inst.doctorName;
            return doctor === doctorName;
        });
    }

    /**
     * Filter instructions by date range
     * @param {string} fromDate - YYYY-MM-DD
     * @param {string} toDate - YYYY-MM-DD
     * @returns {Array}
     */
    filterByDateRange(fromDate, toDate) {
        if (!fromDate && !toDate) return this.getValidInstructions();
        
        return this.getValidInstructions().filter(inst => {
            if (inst.nextAppointmentDate) {
                if (fromDate && inst.nextAppointmentDate < fromDate) return false;
                if (toDate && inst.nextAppointmentDate > toDate) return false;
                return true;
            }
            return false;
        });
    }

    /**
     * Filter instructions by type
     * @param {string} type - 'follow-up', 'tests-before', 'after-results'
     * @returns {Array}
     */
    filterByType(type) {
        if (!type) return this.getValidInstructions();
        
        switch (type) {
            case 'follow-up':
                return this.getFollowUpInstructions();
            case 'tests-before':
                return this.getTestBeforeVisitInstructions();
            case 'after-results':
                return this.getAfterResultsInstructions();
            default:
                return this.getValidInstructions();
        }
    }

    /**
     * Get doctor name for an instruction
     * @param {Object} instruction
     * @returns {string}
     */
    getDoctorName(instruction) {
        return instruction.followUpDoctor || instruction.doctorName || 'Unknown Doctor';
    }

    /**
     * Get patient display string
     * @param {Object} instruction
     * @returns {string}
     */
    getPatientDisplayString(instruction) {
        const name = instruction.patientName || 'Unknown Patient';
        const age = instruction.age || '';
        const phone = instruction.phone || instruction.patientPhone || '';
        
        let display = name;
        if (age) display += `, ${age}`;
        if (phone) display += ` (${phone})`;
        
        return display;
    }
}

// Export singleton instance
window.instructionService = new InstructionService();
