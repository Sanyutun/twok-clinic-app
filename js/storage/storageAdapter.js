/**
 * Storage Adapter for TWOK Clinic
 *
 * Provides backward compatibility between the existing LocalStorage-based code
 * and the new IndexedDB backend.
 */

// Reference to indexedDBStorage (window.TWOKDB)
const indexedDBStorage = window.TWOKDB;

class StorageAdapter {
    constructor() {
        this.cache = {
            patients: [],
            doctors: [],
            appointments: [],
            instructions: [],
            expenses: [],
            labTracker: [],
            addresses: [],
            specialities: [],
            hospitals: [],
            expenseCategories: []
        };
    }

    /**
     * Initialize storage adapter
     */
    async init() {
        await indexedDBStorage.openDB();
        await this.loadCache();
        TWOK_LOGGER.debug('[StorageAdapter] Initialized');
    }

    /**
     * Load data from IndexedDB into cache
     */
    async loadCache() {
        try {
            this.cache.patients = await indexedDBStorage.getAll(indexedDBStorage.STORES.PATIENTS) || [];
            this.cache.doctors = await indexedDBStorage.getAll(indexedDBStorage.STORES.DOCTORS) || [];
            this.cache.appointments = await indexedDBStorage.getAll(indexedDBStorage.STORES.APPOINTMENTS) || [];
            this.cache.instructions = await indexedDBStorage.getAll(indexedDBStorage.STORES.INSTRUCTIONS) || [];
            this.cache.expenses = await indexedDBStorage.getAll(indexedDBStorage.STORES.EXPENSES) || [];
            this.cache.labTracker = await indexedDBStorage.getAll(indexedDBStorage.STORES.LAB_TRACKER) || [];

            // Settings are not in IndexedDB, assume default
            this.cache.vipReservedNumbers = [1, 2, 5, 8, 12, 14, 18];

            // Load from localStorage for backward compatibility
            this.loadFromLocalStorage();

            TWOK_LOGGER.debug('[StorageAdapter] Cache loaded');
        } catch (error) {
            console.error('[StorageAdapter] Failed to load cache:', error);
        }
    }

    /**
     * Load data from localStorage for backward compatibility
     */
    loadFromLocalStorage() {
        try {
            const addresses = localStorage.getItem('twok_clinic_addresses');
            if (addresses) {
                this.cache.addresses = JSON.parse(addresses);
            }

            const specialities = localStorage.getItem('twok_clinic_specialities');
            if (specialities) {
                this.cache.specialities = JSON.parse(specialities);
            }

            const hospitals = localStorage.getItem('twok_clinic_hospitals');
            if (hospitals) {
                this.cache.hospitals = JSON.parse(hospitals);
            }

            const expenseCategories = localStorage.getItem('twok_clinic_expense_categories');
            if (expenseCategories) {
                this.cache.expenseCategories = JSON.parse(expenseCategories);
            }
        } catch (error) {
            console.error('[StorageAdapter] Failed to load from localStorage:', error);
        }
    }

    /**
     * Save data to localStorage for backward compatibility
     */
    saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('[StorageAdapter] Failed to save to localStorage:', error);
        }
    }

    /**
     * Update internal cache for a specific store
     * Called by IndexedDB wrapper to keep cache in sync
     */
    updateCache(storeName, data) {
        const mapping = {
            'patients': 'patients',
            'doctors': 'doctors',
            'appointments': 'appointments',
            'instructions': 'instructions',
            'expenses': 'expenses',
            'lab_records': 'labTracker',
            'addresses': 'addresses',
            'specialities': 'specialities',
            'hospitals': 'hospitals',
            'expense_categories': 'expenseCategories'
        };
        
        const cacheKey = mapping[storeName];
        if (cacheKey && this.cache[cacheKey]) {
            this.cache[cacheKey] = data;
            // TWOK_LOGGER.debug(`[StorageAdapter] Cache updated for ${storeName} (${data.length} items)`);
        }
    }

    // ==================== PATIENTS ====================

    async getPatients() {
        return this.cache.patients;
    }

    async addPatient(patient, skipDB = false) {
        this.cache.patients.push(patient);
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.PATIENTS, patient);
        }
        return patient;
    }

    async updatePatient(patientId, patient, skipDB = false) {
        const index = this.cache.patients.findIndex(p => p.PatientID === patientId);
        if (index !== -1) {
            this.cache.patients[index] = { ...patient, PatientID: patientId };
        }
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.PATIENTS, { ...patient, PatientID: patientId });
        }
        return { ...patient, PatientID: patientId };
    }

    async deletePatient(patientId, skipDB = false) {
        this.cache.patients = this.cache.patients.filter(p => p.PatientID !== patientId);
        if (!skipDB) {
            await indexedDBStorage.remove(indexedDBStorage.STORES.PATIENTS, patientId);
        }
        return true;
    }

    // ==================== DOCTORS ====================

    async getDoctors() {
        return this.cache.doctors;
    }

    async addDoctor(doctor, skipDB = false) {
        this.cache.doctors.push(doctor);
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.DOCTORS, doctor);
        }
        return doctor;
    }

    async updateDoctor(doctorId, doctor, skipDB = false) {
        const index = this.cache.doctors.findIndex(d => d.DoctorID === doctorId);
        if (index !== -1) {
            this.cache.doctors[index] = { ...doctor, DoctorID: doctorId };
        }
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.DOCTORS, { ...doctor, DoctorID: doctorId });
        }
        return { ...doctor, DoctorID: doctorId };
    }

    async deleteDoctor(doctorId, skipDB = false) {
        this.cache.doctors = this.cache.doctors.filter(d => d.DoctorID !== doctorId);
        if (!skipDB) {
            await indexedDBStorage.remove(indexedDBStorage.STORES.DOCTORS, doctorId);
        }
        return true;
    }

    // ==================== APPOINTMENTS ====================

    async getAppointments() {
        return this.cache.appointments;
    }

    async addAppointment(appointment, skipDB = false) {
        this.cache.appointments.push(appointment);
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.APPOINTMENTS, appointment);
        }
        return appointment;
    }

    async updateAppointment(appointmentId, appointment, skipDB = false) {
        const index = this.cache.appointments.findIndex(a => a.AppointmentID === appointmentId);
        if (index !== -1) {
            this.cache.appointments[index] = { ...appointment, AppointmentID: appointmentId };
        }
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.APPOINTMENTS, { ...appointment, AppointmentID: appointmentId });
        }
        return { ...appointment, AppointmentID: appointmentId };
    }

    async deleteAppointment(appointmentId, skipDB = false) {
        this.cache.appointments = this.cache.appointments.filter(a => a.AppointmentID === appointmentId);
        if (!skipDB) {
            await indexedDBStorage.remove(indexedDBStorage.STORES.APPOINTMENTS, appointmentId);
        }
        return true;
    }

    // ==================== INSTRUCTIONS ====================

    async getInstructions() {
        return this.cache.instructions;
    }

    async addInstruction(instruction, skipDB = false) {
        this.cache.instructions.push(instruction);
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.INSTRUCTIONS, instruction);
        }
        return instruction;
    }

    // ==================== EXPENSES ====================

    async getExpenses() {
        return this.cache.expenses;
    }

    async addExpense(expense, skipDB = false) {
        this.cache.expenses.push(expense);
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.EXPENSES, expense);
        }
        return expense;
    }

    // ==================== LAB TRACKER ====================

    async getLabTracker() {
        return this.cache.labTracker;
    }

    async addLab(lab, skipDB = false) {
        this.cache.labTracker.push(lab);
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.LAB_TRACKER, lab);
        }
        return lab;
    }

    async updateLab(labId, lab, skipDB = false) {
        const index = this.cache.labTracker.findIndex(l => l.LabID === labId);
        if (index !== -1) {
            this.cache.labTracker[index] = { ...lab, LabID: labId };
        }
        if (!skipDB) {
            await indexedDBStorage.put(indexedDBStorage.STORES.LAB_TRACKER, { ...lab, LabID: labId });
        }
        return { ...lab, LabID: labId };
    }

    // ==================== SETTINGS ====================

    async getSetting(key, defaultValue = null) {
        if (key === 'vipReservedNumbers') {
            return this.cache.vipReservedNumbers || defaultValue;
        }
        return defaultValue;
    }

    async setSetting(key, value) {
        if (key === 'vipReservedNumbers') {
            this.cache.vipReservedNumbers = value;
        }
    }

    // ==================== ADDRESSES, SPECIALITIES, HOSPITALS ====================

    getAddresses() {
        return this.cache.addresses || [];
    }

    addAddress(address) {
        if (!this.cache.addresses) {
            this.cache.addresses = [];
        }
        if (!this.cache.addresses.includes(address)) {
            this.cache.addresses.push(address);
            this.saveToLocalStorage('twok_clinic_addresses', this.cache.addresses);
        }
    }

    deleteAddress(address) {
        this.cache.addresses = this.cache.addresses.filter(a => a !== address);
        this.saveToLocalStorage('twok_clinic_addresses', this.cache.addresses);
    }

    getSpecialities() {
        return this.cache.specialities || [];
    }

    addSpeciality(speciality) {
        if (!this.cache.specialities) {
            this.cache.specialities = [];
        }
        if (!this.cache.specialities.includes(speciality)) {
            this.cache.specialities.push(speciality);
            this.saveToLocalStorage('twok_clinic_specialities', this.cache.specialities);
        }
    }

    deleteSpeciality(speciality) {
        this.cache.specialities = this.cache.specialities.filter(s => s !== speciality);
        this.saveToLocalStorage('twok_clinic_specialities', this.cache.specialities);
    }

    getHospitals() {
        return this.cache.hospitals || [];
    }

    addHospital(hospital) {
        if (!this.cache.hospitals) {
            this.cache.hospitals = [];
        }
        if (!this.cache.hospitals.includes(hospital)) {
            this.cache.hospitals.push(hospital);
            this.saveToLocalStorage('twok_clinic_hospitals', this.cache.hospitals);
        }
    }

    deleteHospital(hospital) {
        this.cache.hospitals = this.cache.hospitals.filter(h => h !== hospital);
        this.saveToLocalStorage('twok_clinic_hospitals', this.cache.hospitals);
    }

    getExpenseCategories() {
        return this.cache.expenseCategories || [];
    }

    // ==================== CACHE MANAGEMENT ====================

    async refreshCache() {
        await this.loadCache();
    }

    getCache() {
        return { ...this.cache };
    }
}

// Export singleton instance
export const storageAdapter = new StorageAdapter();
export default storageAdapter;
