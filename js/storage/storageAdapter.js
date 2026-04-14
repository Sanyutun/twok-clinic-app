/**
 * Storage Adapter for TWOK Clinic
 *
 * Provides backward compatibility between the existing LocalStorage-based code
 * and the new IndexedDB backend.
 */

import { indexedDBStorage } from './storage/indexedDB.js';

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
        await indexedDBStorage.open();
        await this.loadCache();
        console.log('[StorageAdapter] Initialized');
    }

    /**
     * Load data from IndexedDB into cache
     */
    async loadCache() {
        try {
            this.cache.patients = await indexedDBStorage.getPatients() || [];
            this.cache.doctors = await indexedDBStorage.getDoctors() || [];
            this.cache.appointments = await indexedDBStorage.getAppointments() || [];
            this.cache.instructions = await indexedDBStorage.getInstructions() || [];
            this.cache.expenses = await indexedDBStorage.getExpenses() || [];
            this.cache.labTracker = await indexedDBStorage.getLabTracking() || [];

            // Load settings
            const settings = await indexedDBStorage.getSettings() || [];
            const vipNumbersSetting = settings.find(s => s.SettingKey === 'vipReservedNumbers');
            if (vipNumbersSetting) {
                try {
                    this.cache.vipReservedNumbers = JSON.parse(vipNumbersSetting.SettingValue);
                } catch (e) {
                    this.cache.vipReservedNumbers = [1, 2, 5, 8, 12, 14, 18];
                }
            } else {
                this.cache.vipReservedNumbers = [1, 2, 5, 8, 12, 14, 18];
            }

            // Load from localStorage for backward compatibility
            this.loadFromLocalStorage();

            console.log('[StorageAdapter] Cache loaded');
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

    // ==================== PATIENTS ====================

    async getPatients() {
        return this.cache.patients;
    }

    async addPatient(patient) {
        this.cache.patients.push(patient);
        await indexedDBStorage.put('patients', patient);
        return patient;
    }

    async updatePatient(patientId, patient) {
        const index = this.cache.patients.findIndex(p => p.PatientID === patientId);
        if (index !== -1) {
            this.cache.patients[index] = { ...patient, PatientID: patientId };
        }
        await indexedDBStorage.put('patients', { ...patient, PatientID: patientId });
        return { ...patient, PatientID: patientId };
    }

    async deletePatient(patientId) {
        this.cache.patients = this.cache.patients.filter(p => p.PatientID !== patientId);
        await indexedDBStorage.delete('patients', patientId);
        return true;
    }

    // ==================== DOCTORS ====================

    async getDoctors() {
        return this.cache.doctors;
    }

    async addDoctor(doctor) {
        this.cache.doctors.push(doctor);
        await indexedDBStorage.put('doctors', doctor);
        return doctor;
    }

    async updateDoctor(doctorId, doctor) {
        const index = this.cache.doctors.findIndex(d => d.DoctorID === doctorId);
        if (index !== -1) {
            this.cache.doctors[index] = { ...doctor, DoctorID: doctorId };
        }
        await indexedDBStorage.put('doctors', { ...doctor, DoctorID: doctorId });
        return { ...doctor, DoctorID: doctorId };
    }

    async deleteDoctor(doctorId) {
        this.cache.doctors = this.cache.doctors.filter(d => d.DoctorID !== doctorId);
        await indexedDBStorage.delete('doctors', doctorId);
        return true;
    }

    // ==================== APPOINTMENTS ====================

    async getAppointments() {
        return this.cache.appointments;
    }

    async addAppointment(appointment) {
        this.cache.appointments.push(appointment);
        await indexedDBStorage.put('appointments', appointment);
        return appointment;
    }

    async updateAppointment(appointmentId, appointment) {
        const index = this.cache.appointments.findIndex(a => a.AppointmentID === appointmentId);
        if (index !== -1) {
            this.cache.appointments[index] = { ...appointment, AppointmentID: appointmentId };
        }
        await indexedDBStorage.put('appointments', { ...appointment, AppointmentID: appointmentId });
        return { ...appointment, AppointmentID: appointmentId };
    }

    async deleteAppointment(appointmentId) {
        this.cache.appointments = this.cache.appointments.filter(a => a.AppointmentID !== appointmentId);
        await indexedDBStorage.delete('appointments', appointmentId);
        return true;
    }

    // ==================== INSTRUCTIONS ====================

    async getInstructions() {
        return this.cache.instructions;
    }

    async addInstruction(instruction) {
        this.cache.instructions.push(instruction);
        await indexedDBStorage.put('instructions', instruction);
        return instruction;
    }

    // ==================== EXPENSES ====================

    async getExpenses() {
        return this.cache.expenses;
    }

    async addExpense(expense) {
        this.cache.expenses.push(expense);
        await indexedDBStorage.put('expenses', expense);
        return expense;
    }

    // ==================== LAB TRACKER ====================

    async getLabTracker() {
        return this.cache.labTracker;
    }

    async addLab(lab) {
        this.cache.labTracker.push(lab);
        await indexedDBStorage.put('labTracking', lab);
        return lab;
    }

    async updateLab(labId, lab) {
        const index = this.cache.labTracker.findIndex(l => l.LabID === labId);
        if (index !== -1) {
            this.cache.labTracker[index] = { ...lab, LabID: labId };
        }
        await indexedDBStorage.put('labTracking', { ...lab, LabID: labId });
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
