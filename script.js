/**
 * TWOK Clinic - Unified Registration System
 * Pure Vanilla JavaScript with LocalStorage
 * Handles Patient, Doctor, and Appointment modules with navigation
 */

// ==================== STORAGE KEYS ====================
const STORAGE_KEYS = {
    PATIENTS: 'twok_clinic_patients',
    ADDRESSES: 'twok_clinic_addresses',
    DOCTORS: 'twok_clinic_doctors',
    SPECIALITIES: 'twok_clinic_specialities',
    HOSPITALS: 'twok_clinic_hospitals',
    APPOINTMENTS: 'twok_clinic_appointments',
    INSTRUCTIONS: 'twok_clinic_instructions',
    EXPENSES: 'twok_clinic_expenses',
    EXPENSE_CATEGORIES: 'twok_clinic_expense_categories',
    CUSTOM_EXPENSE_TYPES: 'twok_clinic_custom_expense_types',
    LAB_TRACKER: 'twok_clinic_lab_tracker'
};

// VIP Reserved booking numbers (configured in Settings, default values below)
// Actual values are loaded from localStorage in init()
const VIP_RESERVED_NUMBERS_DEFAULT = [1, 2, 5, 8, 12, 14, 18];
const MAX_BOOKING_NUMBER = 50;
const TARGET_DOCTOR_NAME = 'Dr. Soe Chan Myae'; // Booking numbers only for this doctor

// Default appointment times by day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
// null means doctor doesn't work on that day
const DEFAULT_APPOINTMENT_TIMES_DEFAULT = {
    0: { hour: 9, minute: 0 },    // Sunday - 9 AM
    1: { hour: 16, minute: 0 },   // Monday - 4 PM
    2: { hour: 16, minute: 0 },   // Tuesday - 4 PM
    3: null,                       // Wednesday - No appointments
    4: { hour: 16, minute: 0 },   // Thursday - 4 PM
    5: null,                       // Friday - No appointments
    6: { hour: 9, minute: 0 }     // Saturday - 9 AM
};

// Day names for UI display
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Working days warning days (Wednesday=3, Friday=5)
const NON_WORKING_DAYS = [3, 5];

// Default expense categories
const DEFAULT_EXPENSE_CATEGORIES = [
    'Speciality Fee',
    'MO fees',
    'Radiologist Fees',
    'UNC Prepaid',
    'Lab',
    'X-ray OnCall',
    'X-ray Opinion',
    'From Aung Nay Won',
    'Refer fees',
    'Promotion',
    'Kpay',
    'Tax',
    'Donation',
    'Transportion',
    'Paper work',
    'Structure',
    'General expense',
    'Medicine',
    'Shopping'
];

// ==================== WEBSOCKET CONFIGURATION ====================
// Auto-detect WebSocket URL based on current host
const WS_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
const WS_URL = `${WS_PROTOCOL}//${WS_HOST}`;
const WS_RECONNECT_DELAY = 3000; // 3 seconds
let ws = null;
let wsReconnectTimer = null;

/**
 * Get local date string in YYYY-MM-DD format
 * @param {Date|string} date - Date to format (defaults to now)
 * @returns {string} Local date string like '2026-03-26'
 */
function toLocalDateString(date = new Date()) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format date to local timezone ISO string (without timezone offset)
 * @param {Date} date - Date to format (defaults to now)
 * @returns {string} Local datetime string like '2026-03-26T17:40:36'
 */
function toLocalISOString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Initialize WebSocket connection for real-time TV display updates
 */
function initWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }

    try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log('WebSocket connected to TV display');
            if (wsReconnectTimer) {
                clearTimeout(wsReconnectTimer);
                wsReconnectTimer = null;
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected, will reconnect...');
            wsReconnectTimer = setTimeout(initWebSocket, WS_RECONNECT_DELAY);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onmessage = (event) => {
            // Handle messages from server (if needed)
            const data = JSON.parse(event.data);
            console.log('[WS] Received message:', data.type);
            
            if (data.type === 'connection_ack') {
                console.log('WebSocket connection acknowledged');
            }
            
            // Handle appointment changes and refresh data
            if (data.type === 'appointment_updated' || 
                data.type === 'appointment_created' || 
                data.type === 'appointment_deleted' ||
                data.type === 'patient_arrived' ||
                data.type === 'consultation_started' ||
                data.type === 'consultation_finished' ||
                data.type === 'queue_update' ||
                data.type === 'sync_complete') {
                console.log('[WS] Appointment changed, reloading data...');
                // Reload appointments from IndexedDB
                loadFromStorage().then(() => {
                    renderAppointmentTable();
                    updateQueueSummary();
                    showNotification('Data updated from another device', 'info');
                }).catch(err => {
                    console.error('[WS] Error reloading data:', err);
                });
            }
        };

    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        wsReconnectTimer = setTimeout(initWebSocket, WS_RECONNECT_DELAY);
    }
}

/**
 * Send queue event to TV display via WebSocket
 * @param {string} type - Event type (e.g., 'patient_arrived', 'consultation_started')
 * @param {Object} data - Event data payload
 */
function sendQueueEvent(type, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: type,
            data: data,
            timestamp: new Date().toISOString()
        }));
    } else {
        console.warn('WebSocket not connected, cannot send event:', type);
    }
}

// ==================== DOM ELEMENTS ====================
const elements = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    sidebarItems: document.querySelectorAll('.sidebar-item'),
    sidebarNav: document.getElementById('sidebarNav'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    menuToggleBtn: document.getElementById('menuToggleBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    patientSection: document.getElementById('patientSection'),
    doctorSection: document.getElementById('doctorSection'),
    appointmentSection: document.getElementById('appointmentSection'),
    instructionSection: document.getElementById('instructionSection'),
    calendarSection: document.getElementById('calendarSection'),
    expenseSection: document.getElementById('expenseSection'),
    labTrackerSection: document.getElementById('labTrackerSection'),
    pharmacistSection: document.getElementById('pharmacistSection'),
    settingsSection: document.getElementById('settingsSection'),
    headerSubtitle: document.getElementById('headerSubtitle'),

    // Patient Elements
    patientSearchInput: document.getElementById('patientSearchInput'),
    patientNoResultsMessage: document.getElementById('patientNoResultsMessage'),
    addNewPatientLink: document.getElementById('addNewPatientLink'),
    newPatientBtn: document.getElementById('newPatientBtn'),
    patientCount: document.getElementById('patientCount'),
    patientTable: document.getElementById('patientTable'),
    patientTableBody: document.getElementById('patientTableBody'),
    patientEmptyTableMessage: document.getElementById('patientEmptyTableMessage'),
    patientEmptyNewBtn: document.getElementById('patientEmptyNewBtn'),
    patientFormModal: document.getElementById('patientFormModal'),
    closePatientFormModal: document.getElementById('closePatientFormModal'),
    patientFormTitle: document.getElementById('patientFormTitle'),
    patientForm: document.getElementById('patientForm'),
    patientEditIndex: document.getElementById('patientEditIndex'),
    patientId: document.getElementById('patientId'),
    patientName: document.getElementById('patientName'),
    patientAge: document.getElementById('patientAge'),
    patientSex: document.getElementById('patientSex'),
    patientAddress: document.getElementById('patientAddress'),
    addressList: document.getElementById('addressList'),
    manageAddressBtn: document.getElementById('manageAddressBtn'),
    patientPhone: document.getElementById('patientPhone'),
    patientCopyPhoneBtn: document.getElementById('patientCopyPhoneBtn'),
    patientCopyTooltip: document.getElementById('patientCopyTooltip'),
    patientNote: document.getElementById('patientNote'),
    patientIsFoc: document.getElementById('patientIsFoc'),
    patientSaveBtn: document.getElementById('patientSaveBtn'),
    patientSaveBtnText: document.getElementById('patientSaveBtnText'),
    patientDeleteBtn: document.getElementById('patientDeleteBtn'),
    patientClearBtn: document.getElementById('patientClearBtn'),
    patientCancelBtn: document.getElementById('patientCancelBtn'),
    addressModal: document.getElementById('addressModal'),
    closeAddressModal: document.getElementById('closeAddressModal'),
    addressListManage: document.getElementById('addressListManage'),
    newAddressInput: document.getElementById('newAddressInput'),
    addAddressBtn: document.getElementById('addAddressBtn'),

    // Doctor Elements
    doctorSearchInput: document.getElementById('doctorSearchInput'),
    doctorNoResultsMessage: document.getElementById('doctorNoResultsMessage'),
    addNewDoctorLink: document.getElementById('addNewDoctorLink'),
    newDoctorBtn: document.getElementById('newDoctorBtn'),
    doctorCount: document.getElementById('doctorCount'),
    manageSpecialityBtn: document.getElementById('manageSpecialityBtn'),
    manageHospitalBtn: document.getElementById('manageHospitalBtn'),
    doctorTable: document.getElementById('doctorTable'),
    doctorTableBody: document.getElementById('doctorTableBody'),
    doctorEmptyTableMessage: document.getElementById('doctorEmptyTableMessage'),
    doctorEmptyNewBtn: document.getElementById('doctorEmptyNewBtn'),
    doctorFormModal: document.getElementById('doctorFormModal'),
    closeDoctorFormModal: document.getElementById('closeDoctorFormModal'),
    doctorFormTitle: document.getElementById('doctorFormTitle'),
    doctorForm: document.getElementById('doctorForm'),
    doctorEditIndex: document.getElementById('doctorEditIndex'),
    doctorId: document.getElementById('doctorId'),
    doctorName: document.getElementById('doctorName'),
    doctorSpeciality: document.getElementById('doctorSpeciality'),
    specialityList: document.getElementById('specialityList'),
    manageSpecialityInFormBtn: document.getElementById('manageSpecialityInFormBtn'),
    doctorHospital: document.getElementById('doctorHospital'),
    hospitalList: document.getElementById('hospitalList'),
    manageHospitalInFormBtn: document.getElementById('manageHospitalInFormBtn'),
    doctorPhone: document.getElementById('doctorPhone'),
    doctorCopyPhoneBtn: document.getElementById('doctorCopyPhoneBtn'),
    doctorCopyTooltip: document.getElementById('doctorCopyTooltip'),
    doctorSaveBtn: document.getElementById('doctorSaveBtn'),
    doctorSaveBtnText: document.getElementById('doctorSaveBtnText'),
    doctorDeleteBtn: document.getElementById('doctorDeleteBtn'),
    doctorClearBtn: document.getElementById('doctorClearBtn'),
    doctorCancelBtn: document.getElementById('doctorCancelBtn'),
    specialityModal: document.getElementById('specialityModal'),
    closeSpecialityModal: document.getElementById('closeSpecialityModal'),
    specialityListManage: document.getElementById('specialityListManage'),
    newSpecialityInput: document.getElementById('newSpecialityInput'),
    addSpecialityBtn: document.getElementById('addSpecialityBtn'),
    hospitalModal: document.getElementById('hospitalModal'),
    closeHospitalModal: document.getElementById('closeHospitalModal'),
    hospitalListManage: document.getElementById('hospitalListManage'),
    newHospitalInput: document.getElementById('newHospitalInput'),
    addHospitalBtn: document.getElementById('addHospitalBtn'),

    // Appointment Elements
    appointmentSearchInput: document.getElementById('appointmentSearchInput'),
    appointmentNoResultsMessage: document.getElementById('appointmentNoResultsMessage'),
    addNewAppointmentLink: document.getElementById('addNewAppointmentLink'),
    newAppointmentBtn: document.getElementById('newAppointmentBtn'),
    appointmentCount: document.getElementById('appointmentCount'),
    todayAppointmentsBtn: document.getElementById('todayAppointmentsBtn'),
    appointmentDateFilter: document.getElementById('appointmentDateFilter'),
    appointmentDoctorFilter: document.getElementById('appointmentDoctorFilter'),
    appointmentTable: document.getElementById('appointmentTable'),
    appointmentTableBody: document.getElementById('appointmentTableBody'),
    appointmentEmptyTableMessage: document.getElementById('appointmentEmptyTableMessage'),
    appointmentEmptyNewBtn: document.getElementById('appointmentEmptyNewBtn'),
    appointmentFormModal: document.getElementById('appointmentFormModal'),
    closeAppointmentFormModal: document.getElementById('closeAppointmentFormModal'),
    appointmentFormTitle: document.getElementById('appointmentFormTitle'),
    appointmentForm: document.getElementById('appointmentForm'),
    appointmentEditIndex: document.getElementById('appointmentEditIndex'),
    appointmentId: document.getElementById('appointmentId'),
    appointmentPatient: document.getElementById('appointmentPatient'),
    patientAutocomplete: document.getElementById('patientAutocomplete'),
    registerNewPatientFromAppt: document.getElementById('registerNewPatientFromAppt'),
    appointmentPatientId: document.getElementById('appointmentPatientId'),
    patientInfoDisplay: document.getElementById('patientInfoDisplay'),
    displayPatientPhone: document.getElementById('displayPatientPhone'),
    displayPatientAge: document.getElementById('displayPatientAge'),
    displayPatientSex: document.getElementById('displayPatientSex'),
    displayPatientFoc: document.getElementById('displayPatientFoc'),
    labResultWarning: document.getElementById('labResultWarning'),
    labWarningDetails: document.getElementById('labWarningDetails'),
    appointmentDoctor: document.getElementById('appointmentDoctor'),
    doctorAutocomplete: document.getElementById('doctorAutocomplete'),
    appointmentDoctorId: document.getElementById('appointmentDoctorId'),
    appointmentDateTime: document.getElementById('appointmentDateTime'),
    appointmentBookingType: document.getElementById('appointmentBookingType'),
    appointmentBookingNumber: document.getElementById('appointmentBookingNumber'),
    appointmentStatus: document.getElementById('appointmentStatus'),
    appointmentNotes: document.getElementById('appointmentNotes'),
    appointmentSaveBtn: document.getElementById('appointmentSaveBtn'),
    appointmentSaveBtnText: document.getElementById('appointmentSaveBtnText'),
    appointmentDeleteBtn: document.getElementById('appointmentDeleteBtn'),
    appointmentClearBtn: document.getElementById('appointmentClearBtn'),
    appointmentCancelBtn: document.getElementById('appointmentCancelBtn'),
    queueSummary: document.getElementById('queueSummary'),
    waitingCount: document.getElementById('waitingCount'),
    inConsultCount: document.getElementById('inConsultCount'),
    doneCount: document.getElementById('doneCount'),
    nextPatientName: document.getElementById('nextPatientName'),
    selectedPatientName: document.getElementById('selectedPatientName'),
    currentConsultName: document.getElementById('currentConsultName'),
    nextPatientBtn: document.getElementById('nextPatientBtn'),

    // Notification
    notification: document.getElementById('notification'),
    notificationText: document.getElementById('notificationText'),

    // Investigation Dialog
    investigationDialog: document.getElementById('investigationDialog'),
    consultPatientName: document.getElementById('consultPatientName'),
    consultPatientAge: document.getElementById('consultPatientAge'),
    consultPatientSex: document.getElementById('consultPatientSex'),
    consultBookingNumber: document.getElementById('consultBookingNumber'),
    patientSelectionSection: document.getElementById('patientSelectionSection'),
    singlePatientDisplay: document.getElementById('singlePatientDisplay'),
    nextPatientCategory: document.getElementById('nextPatientCategory'),
    nextPatientBooking: document.getElementById('nextPatientBooking'),
    nextPatientName: document.getElementById('nextPatientName'),
    selectedPatientName: document.getElementById('selectedPatientName'),
    nextPatientAge: document.getElementById('nextPatientAge'),
    nextPatientSex: document.getElementById('nextPatientSex'),
    nextPatientPhone: document.getElementById('nextPatientPhone'),
    nextPatientPenaltyInfo: document.getElementById('nextPatientPenaltyInfo'),
    nextPatientPenaltyText: document.getElementById('nextPatientPenaltyText'),
    skipPatientBtn: document.getElementById('skipPatientBtn'),
    callPatientBtn: document.getElementById('callPatientBtn'),
    noPatientsMessage: document.getElementById('noPatientsMessage'),
    closePatientSelectionBtn: document.getElementById('closePatientSelectionBtn'),

    // VIP Slot Dialog
    vipSlotDialog: document.getElementById('vipSlotDialog'),
    vipSlotPatientName: document.getElementById('vipSlotPatientName'),
    vipSlotRegularNumber: document.getElementById('vipSlotRegularNumber'),
    vipSlotOptions: document.getElementById('vipSlotOptions'),
    vipSlotUseRegularBtn: document.getElementById('vipSlotUseRegularBtn'),
    vipSlotCancelBtn: document.getElementById('vipSlotCancelBtn'),
    investigationYesBtn: document.getElementById('investigationYesBtn'),
    investigationNoBtn: document.getElementById('investigationNoBtn'),

    // Instruction Section
    instructionSection: document.getElementById('instructionSection'),
    calendarSection: document.getElementById('calendarSection'),
    calPrevMonth: document.getElementById('calPrevMonth'),
    calTodayBtn: document.getElementById('calTodayBtn'),
    calNextMonth: document.getElementById('calNextMonth'),
    calCurrentMonthYear: document.getElementById('calCurrentMonthYear'),
    calFilterDoctor: document.getElementById('calFilterDoctor'),
    calFilterType: document.getElementById('calFilterType'),
    calClearFilters: document.getElementById('calClearFilters'),
    calDaysGrid: document.getElementById('calDaysGrid'),
    calLoading: document.getElementById('calLoading'),
    // Calendar appointment form
    calendarAppointmentFormPanel: document.getElementById('calendarAppointmentFormPanel'),
    closeCalendarApptForm: document.getElementById('closeCalendarApptForm'),
    cancelCalendarApptForm: document.getElementById('cancelCalendarApptForm'),
    calendarAppointmentForm: document.getElementById('calendarAppointmentForm'),
    calendarApptFormTitle: document.getElementById('calendarApptFormTitle'),
    calendarApptEditIndex: document.getElementById('calendarApptEditIndex'),
    calendarApptId: document.getElementById('calendarApptId'),
    calendarApptPatient: document.getElementById('calendarApptPatient'),
    calendarPatientAutocomplete: document.getElementById('calendarPatientAutocomplete'),
    registerNewPatientFromCalendar: document.getElementById('registerNewPatientFromCalendar'),
    calendarApptPatientId: document.getElementById('calendarApptPatientId'),
    calendarPatientInfoDisplay: document.getElementById('calendarPatientInfoDisplay'),
    calendarDisplayPatientAge: document.getElementById('calendarDisplayPatientAge'),
    calendarDisplayPatientSex: document.getElementById('calendarDisplayPatientSex'),
    calendarDisplayPatientPhone: document.getElementById('calendarDisplayPatientPhone'),
    calendarDisplayPatientFoc: document.getElementById('calendarDisplayPatientFoc'),
    calendarLabResultWarning: document.getElementById('calendarLabResultWarning'),
    calendarLabWarningDetails: document.getElementById('calendarLabWarningDetails'),
    calendarApptDoctor: document.getElementById('calendarApptDoctor'),
    calendarDoctorAutocomplete: document.getElementById('calendarDoctorAutocomplete'),
    calendarApptDoctorId: document.getElementById('calendarApptDoctorId'),
    calendarApptDateTime: document.getElementById('calendarApptDateTime'),
    calendarApptBookingType: document.getElementById('calendarApptBookingType'),
    calendarApptBookingNumber: document.getElementById('calendarApptBookingNumber'),
    calendarApptStatus: document.getElementById('calendarApptStatus'),
    calendarApptNotes: document.getElementById('calendarApptNotes'),
    calendarApptSaveBtn: document.getElementById('calendarApptSaveBtn'),
    calendarApptSaveBtnText: document.getElementById('calendarApptSaveBtnText'),
    calendarApptClearBtn: document.getElementById('calendarApptClearBtn'),
    calendarApptDeleteBtn: document.getElementById('calendarApptDeleteBtn'),
    instructionSearchInput: document.getElementById('instructionSearchInput'),
    instructionDoctorFilter: document.getElementById('instructionDoctorFilter'),
    instructionSortFilter: document.getElementById('instructionSortFilter'),
    instructionTable: document.getElementById('instructionTable'),
    instructionTableBody: document.getElementById('instructionTableBody'),
    instructionEmptyMessage: document.getElementById('instructionEmptyMessage'),
    donePatientCount: document.getElementById('donePatientCount'),
    instructionFormPanel: document.getElementById('instructionFormPanel'),
    closeInstructionPanel: document.getElementById('closeInstructionPanel'),
    instructionForm: document.getElementById('instructionForm'),
    instructAppointmentId: document.getElementById('instructAppointmentId'),
    instructPatientId: document.getElementById('instructPatientId'),
    instructPatientName: document.getElementById('instructPatientName'),
    instructPatientAge: document.getElementById('instructPatientAge'),
    instructDoctorName: document.getElementById('instructDoctorName'),
    instructAppointmentDate: document.getElementById('instructAppointmentDate'),
    instructBookingNumber: document.getElementById('instructBookingNumber'),
    instructGeneralInstruction: document.getElementById('instructGeneralInstruction'),
    instructDuration: document.getElementById('instructDuration'),
    instructDurationUnit: document.getElementById('instructDurationUnit'),
    instructNextAppointmentDate: document.getElementById('instructNextAppointmentDate'),
    instructNextDoctor: document.getElementById('instructNextDoctor'),
    instructOtherType: document.getElementById('instructOtherType'),
    transferHospitalGroup: document.getElementById('transferHospitalGroup'),
    instructTransferHospital: document.getElementById('instructTransferHospital'),
    testSelectionGroup: document.getElementById('testSelectionGroup'),
    testCheckboxes: document.querySelectorAll('.test-checkbox'),
    customTestGroup: document.getElementById('customTestGroup'),
    instructCustomTest: document.getElementById('instructCustomTest'),
    customTestDatalist: document.getElementById('customTestDatalist'),
    instructSaveBtn: document.getElementById('instructSaveBtn'),
    instructDeleteBtn: document.getElementById('instructDeleteBtn'),
    instructCancelBtn: document.getElementById('instructCancelBtn'),
    doctorDatalist: document.getElementById('doctorDatalist'),
    hospitalDatalist: document.getElementById('hospitalDatalist'),

    // Expense Section
    expenseSection: document.getElementById('expenseSection'),
    addExpenseBtn: document.getElementById('addExpenseBtn'),
    expenseDateFrom: document.getElementById('expenseDateFrom'),
    expenseDateTo: document.getElementById('expenseDateTo'),
    categorySummaryContainer: document.getElementById('categorySummaryContainer'),
    expenseTotalCount: document.getElementById('expenseTotalCount'),
    expenseTableContainer: document.getElementById('expenseTableContainer'),
    expenseEmptyMessage: document.getElementById('expenseEmptyMessage'),
    categoryDetailsDialog: document.getElementById('categoryDetailsDialog'),
    categoryDetailsTitle: document.getElementById('categoryDetailsTitle'),
    categoryDetailsContent: document.getElementById('categoryDetailsContent'),
    closeCategoryDetails: document.getElementById('closeCategoryDetails'),

    // Lab Tracker Elements
    labTrackerSection: document.getElementById('labTrackerSection'),
    pendingResultsAlert: document.getElementById('pendingResultsAlert'),
    pendingResultsCount: document.getElementById('pendingResultsCount'),
    labSearchInput: document.getElementById('labSearchInput'),
    labFilterStatus: document.getElementById('labFilterStatus'),
    labFilterLab: document.getElementById('labFilterLab'),
    labFilterDate: document.getElementById('labFilterDate'),
    addLabTrackerBtn: document.getElementById('addLabTrackerBtn'),
    labRecordCount: document.getElementById('labRecordCount'),
    labTrackerTable: document.getElementById('labTrackerTable'),
    labTrackerTableBody: document.getElementById('labTrackerTableBody'),
    labEmptyMessage: document.getElementById('labEmptyMessage'),
    labFormModal: document.getElementById('labFormModal'),
    closeLabFormModal: document.getElementById('closeLabFormModal'),
    labFormTitle: document.getElementById('labFormTitle'),
    labForm: document.getElementById('labForm'),
    labEditIndex: document.getElementById('labEditIndex'),
    labId: document.getElementById('labId'),
    labPatient: document.getElementById('labPatient'),
    labPatientAutocomplete: document.getElementById('labPatientAutocomplete'),
    labPatientId: document.getElementById('labPatientId'),
    labDoctor: document.getElementById('labDoctor'),
    labDoctorAutocomplete: document.getElementById('labDoctorAutocomplete'),
    labDoctorId: document.getElementById('labDoctorId'),
    labName: document.getElementById('labName'),
    labAmount: document.getElementById('labAmount'),
    labStatus: document.getElementById('labStatus'),
    labDateTime: document.getElementById('labDateTime'),
    labSaveBtn: document.getElementById('labSaveBtn'),
    labSaveBtnText: document.getElementById('labSaveBtnText'),
    labClearBtn: document.getElementById('labClearBtn'),
    labDeleteBtn: document.getElementById('labDeleteBtn'),
    labCancelBtn: document.getElementById('labCancelBtn'),
    timelineDialog: document.getElementById('timelineDialog'),
    closeTimelineDialog: document.getElementById('closeTimelineDialog'),
    timelinePatientInfo: document.getElementById('timelinePatientInfo'),
    timelineContent: document.getElementById('timelineContent'),
    toggleTimelineBtn: document.getElementById('toggleTimelineBtn'),
    labResultAlert: document.getElementById('labResultAlert'),
    closeLabResultAlert: document.getElementById('closeLabResultAlert'),
    labResultAlertContent: document.getElementById('labResultAlertContent'),

    // Pharmacist Corner Elements
    pharmacistSection: document.getElementById('pharmacistSection'),
    pharmacistTotalPatients: document.getElementById('pharmacistTotalPatients'),
    pharmacistPendingCount: document.getElementById('pharmacistPendingCount'),
    pharmacistCompletedCount: document.getElementById('pharmacistCompletedCount'),
    pharmacistQueuedCount: document.getElementById('pharmacistQueuedCount'),
    pharmacistSearchInput: document.getElementById('pharmacistSearchInput'),
    pharmacistCardsContainer: document.getElementById('pharmacistCardsContainer'),
    pharmacistNoResultsMessage: document.getElementById('pharmacistNoResultsMessage'),
    pharmacistEmptyState: document.getElementById('pharmacistEmptyState'),

    // Settings Section
    settingsSection: document.getElementById('settingsSection'),
    bookingEditorDate: document.getElementById('bookingEditorDate'),
    loadAppointmentsBtn: document.getElementById('loadAppointmentsBtn'),
    bookingEditorTableContainer: document.getElementById('bookingEditorTableContainer'),
    selectedDateDisplay: document.getElementById('selectedDateDisplay'),
    saveBookingChangesBtn: document.getElementById('saveBookingChangesBtn'),
    bookingEditorTable: document.getElementById('bookingEditorTable'),
    bookingEditorTableBody: document.getElementById('bookingEditorTableBody'),
    vipNumbersList: document.getElementById('vipNumbersList'),
    newVipNumber: document.getElementById('newVipNumber'),
    addVipNumberBtn: document.getElementById('addVipNumberBtn')
};

// ==================== STATE ====================
let patients = [];
let addresses = [];
let doctors = [];
let specialities = [];
let hospitals = [];
let appointments = [];
let instructions = [];
let expenses = [];
let expenseCategories = [];
let labRecords = [];
let labNames = ['TWOK', 'NN', 'YN', 'BH'];

// Load saved lab names from localStorage
function loadLabNames() {
    try {
        const saved = localStorage.getItem('twok_clinic_lab_names');
        if (saved) {
            const savedNames = JSON.parse(saved);
            // Merge with defaults, avoiding duplicates
            savedNames.forEach(name => {
                if (!labNames.includes(name)) {
                    labNames.push(name);
                }
            });
        }
    } catch (error) {
        console.error('[loadLabNames] Error loading:', error);
    }
    return labNames;
}

// Save lab names to localStorage
function saveLabName(name) {
    if (!labNames.includes(name)) {
        labNames.push(name);
        try {
            localStorage.setItem('twok_clinic_lab_names', JSON.stringify(labNames));
            console.log('[saveLabName] Saved new lab name:', name);
        } catch (error) {
            console.error('[saveLabName] Error saving:', error);
        }
    }
}

// Populate lab name datalist
function populateLabNameDatalist() {
    const datalist = document.getElementById('labNameOptions');
    if (!datalist) return;
    
    // Clear existing options
    datalist.innerHTML = '';
    
    // Add all lab names
    labNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
    });
}

// Update lab filter dropdown
function updateLabFilterDropdown() {
    if (!elements.labFilterLab) return;
    
    const currentValue = elements.labFilterLab.value;
    
    // Clear and rebuild
    elements.labFilterLab.innerHTML = '<option value="">All Labs</option>';
    labNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        elements.labFilterLab.appendChild(option);
    });
    
    // Restore selection if it still exists
    if (currentValue && labNames.includes(currentValue)) {
        elements.labFilterLab.value = currentValue;
    }
}

// Initialize lab names on app load
loadLabNames();
let patientIsEditing = false;

// Default appointment times by day of week (loaded from localStorage or uses defaults)
let defaultAppointmentTimes = JSON.parse(JSON.stringify(DEFAULT_APPOINTMENT_TIMES_DEFAULT));
let doctorIsEditing = false;
let appointmentIsEditing = false;
let doctorCurrentSort = { field: null, direction: 'asc' };
let appointmentCurrentSort = { field: null, direction: 'asc' };
let patientAutocompleteHighlighted = -1;
let doctorAutocompleteHighlighted = -1;
let labPatientAutocompleteHighlighted = -1;

// VIP Slot Selection State
let vipSlotPendingData = null; // Stores pending appointment data while selecting slot
let vipSlotRegularNumber = null; // Regular booking number for comparison
let labDoctorAutocompleteHighlighted = -1;
let currentConsultingAppointment = null; // For investigation dialog

// Settings State
let vipReservedNumbers = [1, 2, 5, 8, 12, 14, 18]; // Default VIP reserved numbers
let bookingEditorAppointments = []; // Stores appointments loaded in booking editor

// ==================== INITIALIZATION ====================
async function init() {
    // Initialize IndexedDB and migrate from localStorage if needed
    try {
        const migrated = await TWOKDB.initDB();
        if (migrated) {
            console.log('Data migrated from localStorage to IndexedDB');
            // Clear localStorage after successful migration
            localStorage.removeItem('twok_clinic_patients');
            localStorage.removeItem('twok_clinic_addresses');
            localStorage.removeItem('twok_clinic_doctors');
            localStorage.removeItem('twok_clinic_specialities');
            localStorage.removeItem('twok_clinic_hospitals');
            localStorage.removeItem('twok_clinic_appointments');
            localStorage.removeItem('twok_clinic_instructions');
            localStorage.removeItem('twok_clinic_expenses');
            localStorage.removeItem('twok_clinic_expense_categories');
            localStorage.removeItem('twok_clinic_lab_tracker');
        }
    } catch (error) {
        console.error('Error initializing IndexedDB:', error);
        alert('Error initializing database. Some features may not work properly.');
    }
    
    await loadFromStorage();
    console.log('[Init] loadFromStorage completed');

    // Load VIP reserved numbers from localStorage (or use default)
    const storedVipNumbers = localStorage.getItem('twok_clinic_vip_reserved');
    if (storedVipNumbers) {
        try {
            vipReservedNumbers = JSON.parse(storedVipNumbers);
        } catch (e) {
            console.error('Error loading VIP reserved numbers:', e);
            vipReservedNumbers = [...VIP_RESERVED_NUMBERS_DEFAULT];
        }
    } else {
        vipReservedNumbers = [...VIP_RESERVED_NUMBERS_DEFAULT];
    }
    
    renderAddressList();
    renderSpecialityList();
    renderHospitalList();
    renderPatientTable();
    renderDoctorTable();
    renderDoctorFilter();
    
    // Set default date filter to today
    const today = toLocalDateString(new Date());
    elements.appointmentDateFilter.value = today;
    
    renderAppointmentTable();
    generatePatientId();
    generateDoctorId();
    setupEventListeners();
    updateQueueSummary();
    renderInstructionDoctorFilter();
    renderInstructionTableWithSaved();
    loadExpenseCategories();
    renderExpenseMonthFilter();
    renderExpenses();
    renderCategorySummary();
    renderLabTracker();
    updatePendingResultsAlert();
    renderPharmacistCorner();

    // Expose functions globally for expense-form component
    window.renderExpenses = renderExpenses;
    window.renderCategorySummary = renderCategorySummary;

    // Initialize WebSocket for TV display
    initWebSocket();

    // Schedule daily 8AM status update check
    scheduleDailyStatusUpdate();
}

/**
 * Schedule daily status update check at 8AM
 * Converts 'Noted' to 'Booked' for Dr. Soe Chan Myae appointments
 * that are now within 2 days
 */
function scheduleDailyStatusUpdate() {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);

    // If 8AM already passed today, schedule for tomorrow
    if (now >= next8AM) {
        next8AM.setDate(next8AM.getDate() + 1);
    }

    const msUntil8AM = next8AM.getTime() - now.getTime();

    console.log(`Next status update scheduled for: ${next8AM.toLocaleString()} (in ${Math.round(msUntil8AM / 1000 / 60)} minutes)`);

    setTimeout(() => {
        console.log('Running scheduled 8AM status update...');
        updateNotedToBookedStatus();
        // Schedule the next day's update
        scheduleDailyStatusUpdate();
    }, msUntil8AM);
}

async function loadFromStorage() {
    // Load patients
    patients = await TWOKDB.getAll(TWOKDB.STORES.PATIENTS);
    window.patients = patients; // Expose globally for autocomplete

    // Load addresses (stored as objects, extract values)
    const addressesData = await TWOKDB.getAll(TWOKDB.STORES.ADDRESSES);
    addresses = addressesData.map(item => typeof item === 'string' ? item : (item.value || item.id));
    if (addresses.length === 0) {
        addresses = ['Yangon', 'Mandalay', 'Nay Pyi Taw', 'Bago', 'Mawlamyine'];
        await saveAddressesToStorage();
    }

    // Load doctors
    doctors = await TWOKDB.getAll(TWOKDB.STORES.DOCTORS);
    window.doctors = doctors; // Expose globally for autocomplete

    // Load specialities (stored as objects, extract values)
    const specialitiesData = await TWOKDB.getAll(TWOKDB.STORES.SPECIALITIES);
    specialities = specialitiesData.map(item => typeof item === 'string' ? item : (item.name || item.id));
    if (specialities.length === 0) {
        specialities = ['General Practitioner', 'Cardiologist', 'Paediatrician', 'Orthopaedic', 'Dermatologist', 'Neurologist'];
        await saveSpecialitiesToStorage();
    }

    // Load hospitals (stored as objects, extract values)
    const hospitalsData = await TWOKDB.getAll(TWOKDB.STORES.HOSPITALS);
    hospitals = hospitalsData.map(item => typeof item === 'string' ? item : (item.name || item.id));
    if (hospitals.length === 0) {
        hospitals = ['Yangon General Hospital', 'SSC Hospital', 'Asia Royal Hospital', 'Pun Hlaing Hospital', 'Bahosi Hospital'];
        await saveHospitalsToStorage();
    }

    // Load appointments
    appointments = await TWOKDB.getAll(TWOKDB.STORES.APPOINTMENTS);

    // Load instructions
    instructions = await TWOKDB.getAll(TWOKDB.STORES.INSTRUCTIONS);

    // Load expenses
    expenses = await TWOKDB.getAll(TWOKDB.STORES.EXPENSES);
    window.expenses = expenses; // Expose globally for expense form component

    // Load lab tracker
    labRecords = await TWOKDB.getAll(TWOKDB.STORES.LAB_TRACKER);

    // Load expense categories (stored as objects, extract values)
    await loadExpenseCategories();

    // Load default appointment times by day of week
    await loadDefaultAppointmentTimes();

    // Auto-update Noted → Booked for appointments within 2 days
    updateNotedToBookedStatus();
}

/**
 * Load expense categories from IndexedDB
 */
async function loadExpenseCategories() {
    const categoriesData = await TWOKDB.getAll(TWOKDB.STORES.EXPENSE_CATEGORIES);
    if (categoriesData && categoriesData.length > 0) {
        expenseCategories = categoriesData.map(item => typeof item === 'string' ? item : (item.name || item.id));
    } else {
        expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES];
        await saveExpenseCategories();
    }
}

/**
 * Save expense categories to IndexedDB
 */
async function saveExpenseCategories() {
    const categoryObjects = expenseCategories.map((cat, idx) => ({ id: `cat_${idx}`, name: cat }));
    await TWOKDB.bulkPut(TWOKDB.STORES.EXPENSE_CATEGORIES, categoryObjects);
}

/**
 * Load custom expense types from localStorage
 * Returns array of {icon, name} objects
 */
function loadCustomExpenseTypes() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.CUSTOM_EXPENSE_TYPES);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('[loadCustomExpenseTypes] Error loading:', error);
        return [];
    }
}

/**
 * Save custom expense type to localStorage
 * @param {Object} customType - {icon, name}
 */
function saveCustomExpenseType(customType) {
    try {
        const customTypes = loadCustomExpenseTypes();
        // Check if already exists
        const existing = customTypes.find(ct => ct.name === customType.name && ct.icon === customType.icon);
        if (!existing) {
            customTypes.push(customType);
            localStorage.setItem(STORAGE_KEYS.CUSTOM_EXPENSE_TYPES, JSON.stringify(customTypes));
            console.log('[saveCustomExpenseType] Saved custom type:', customType);
            return true;
        }
        return false; // Already exists
    } catch (error) {
        console.error('[saveCustomExpenseType] Error saving:', error);
        return false;
    }
}

/**
 * Get all expense types (default + custom)
 */
function getAllExpenseTypes() {
    const defaultTypes = [...DEFAULT_EXPENSE_CATEGORIES];
    const customTypes = loadCustomExpenseTypes();
    
    // Add custom types with icon prefix
    const customTypeStrings = customTypes.map(ct => `${ct.icon} ${ct.name}`.trim());
    
    return [...defaultTypes, ...customTypeStrings];
}

/**
 * Load default appointment times by day of week from localStorage
 */
async function loadDefaultAppointmentTimes() {
    console.log('[Settings] Loading default appointment times...');
    const stored = localStorage.getItem('twok_clinic_default_appointment_times');
    console.log('[Settings] Raw stored value:', stored);
    
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            defaultAppointmentTimes = parsed;
            console.log('[Settings] ✅ Successfully loaded from localStorage:', JSON.stringify(defaultAppointmentTimes, null, 2));
        } catch (e) {
            console.error('[Settings] Error parsing stored default appointment times:', e);
            defaultAppointmentTimes = JSON.parse(JSON.stringify(DEFAULT_APPOINTMENT_TIMES_DEFAULT));
            console.log('[Settings] Using defaults due to parse error');
        }
    } else {
        // Use defaults
        console.log('[Settings] No stored data found, initializing with defaults');
        defaultAppointmentTimes = JSON.parse(JSON.stringify(DEFAULT_APPOINTMENT_TIMES_DEFAULT));
        await saveDefaultAppointmentTimes();
    }
}

/**
 * Save default appointment times by day of week to localStorage
 */
async function saveDefaultAppointmentTimes() {
    try {
        const dataToSave = JSON.stringify(defaultAppointmentTimes);
        localStorage.setItem('twok_clinic_default_appointment_times', dataToSave);
        console.log('[Settings] ✅ Successfully saved to localStorage');
    } catch (e) {
        console.error('[Settings] Error saving to localStorage:', e);
    }
}

/**
 * Get default time for a specific day of week
 * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
 * @returns {object|null} - { hour, minute } or null if non-working day
 */
function getDefaultTimeForDay(dayOfWeek) {
    return defaultAppointmentTimes[dayOfWeek] || null;
}

/**
 * Validate if the selected date is a working day and show warning if not
 * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
 * @deprecated Use validateWorkingDayForDoctor instead
 */
function validateWorkingDay(dayOfWeek) {
    const isNonWorkingDay = NON_WORKING_DAYS.includes(dayOfWeek);
    
    // You can add UI warning here if needed
    if (isNonWorkingDay) {
        console.warn(`Warning: ${DAY_NAMES[dayOfWeek]} is configured as a non-working day for Dr. Soe Chan Myae`);
    }
    
    return !isNonWorkingDay;
}

/**
 * Show warning for non-working days
 */
function showNonWorkingDayWarning(dayOfWeek) {
    const dayName = DAY_NAMES[dayOfWeek];
    showNotification(`⚠️ Warning: Dr. Soe Chan Myae does not see patients on ${dayName}`, 'error');
}

/**
 * Automatically change Noted → Booked for Dr. Soe Chan Myae appointments
 * This runs at 8AM daily to convert 'Noted' to 'Booked' for appointments
 * that are now within 2 days (today or tomorrow)
 */
async function updateNotedToBookedStatus() {
    const now = new Date();
    let updated = false;

    appointments.forEach(appt => {
        // Only process Dr. Soe Chan Myae appointments
        if (appt.doctorName !== TARGET_DOCTOR_NAME) return;
        if (appt.status !== 'Noted' || !appt.appointmentTime) return;
        
        // Use the same logic as determineAppointmentStatus
        const newStatus = determineAppointmentStatus(appt.doctorName, appt.appointmentTime);
        
        // If status should now be 'Booked', update it
        if (newStatus === 'Booked') {
            appt.status = 'Booked';
            appt.bookedTime = toLocalISOString(now);
            appt.autoBooked = true;
            updated = true;
            console.log(`Auto-booking appointment for ${appt.patientName} on ${appt.appointmentTime}`);
        }
    });

    if (updated) {
        await saveAppointmentsToStorage();
        renderAppointmentTable();
        updateQueueSummary();
        showNotification('Appointments auto-updated to Booked');
    }
}

// ==================== STORAGE HELPERS (IndexedDB) ====================
async function savePatientsToStorage() {
    await TWOKDB.bulkPut(TWOKDB.STORES.PATIENTS, patients);
    window.patients = patients; // Keep global reference updated
}

async function saveAddressesToStorage() {
    // Store as simple objects with id for IndexedDB
    const addressObjects = addresses.map((addr, idx) => ({ id: `addr_${idx}`, value: addr }));
    await TWOKDB.bulkPut(TWOKDB.STORES.ADDRESSES, addressObjects);
}

async function saveDoctorsToStorage() {
    await TWOKDB.bulkPut(TWOKDB.STORES.DOCTORS, doctors);
    window.doctors = doctors; // Keep global reference updated
}

async function saveSpecialitiesToStorage() {
    // Store as simple objects with id for IndexedDB
    const specialityObjects = specialities.map((spec, idx) => ({ id: `spec_${idx}`, name: spec }));
    await TWOKDB.bulkPut(TWOKDB.STORES.SPECIALITIES, specialityObjects);
}

async function saveHospitalsToStorage() {
    // Store as simple objects with id for IndexedDB
    const hospitalObjects = hospitals.map((hosp, idx) => ({ id: `hosp_${idx}`, name: hosp }));
    await TWOKDB.bulkPut(TWOKDB.STORES.HOSPITALS, hospitalObjects);
}

async function saveAppointmentsToStorage() {
    await TWOKDB.bulkPut(TWOKDB.STORES.APPOINTMENTS, appointments);
    // Refresh doctor filter to include new appointment doctors
    renderDoctorFilter();
    // Refresh pharmacist corner if visible
    if (!elements.pharmacistSection.classList.contains('hidden')) {
        renderPharmacistCorner();
    }
}

async function saveInstructionsToStorage() {
    await TWOKDB.bulkPut(TWOKDB.STORES.INSTRUCTIONS, instructions);
    // Refresh pharmacist corner if visible
    if (!elements.pharmacistSection.classList.contains('hidden')) {
        renderPharmacistCorner();
    }
}

async function saveExpensesToStorage() {
    await TWOKDB.bulkPut(TWOKDB.STORES.EXPENSES, expenses);
    window.expenses = expenses; // Keep global reference updated
    // Refresh pharmacist corner if visible
    if (!elements.pharmacistSection.classList.contains('hidden')) {
        renderPharmacistCorner();
    }
}

async function saveLabRecordsToStorage() {
    await TWOKDB.bulkPut(TWOKDB.STORES.LAB_TRACKER, labRecords);
}

/**
 * Reload lab records from storage and re-render the tracker
 * Exposed globally for use by expense-form.js
 */
async function reloadLabTracker() {
    try {
        labRecords = await TWOKDB.getAll(TWOKDB.STORES.LAB_TRACKER);
        window.labRecords = labRecords; // Also expose globally
        console.log(`[LabTracker] Reloaded ${labRecords.length} lab records from storage`);
        if (typeof renderLabTracker === 'function') {
            renderLabTracker();
        }
        if (typeof updatePendingResultsAlert === 'function') {
            updatePendingResultsAlert();
        }
        // Refresh calendar if visible
        if (!elements.calendarSection.classList.contains('hidden')) {
            refreshCalendar();
        }
    } catch (error) {
        console.error('[LabTracker] Failed to reload:', error);
    }
}

// Expose globally for expense-form.js
window.reloadLabTracker = reloadLabTracker;

// ==================== NAVIGATION ====================
function switchSection(sectionName) {
    // Update sections visibility
    elements.patientSection.classList.add('hidden');
    elements.doctorSection.classList.add('hidden');
    elements.appointmentSection.classList.add('hidden');
    elements.instructionSection.classList.add('hidden');
    elements.calendarSection.classList.add('hidden');
    elements.expenseSection.classList.add('hidden');
    elements.labTrackerSection.classList.add('hidden');
    elements.pharmacistSection.classList.add('hidden');
    elements.settingsSection.classList.add('hidden');

    if (sectionName === 'patient') {
        elements.patientSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Patient Registration System';
    } else if (sectionName === 'doctor') {
        elements.doctorSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Doctor Registration System';
    } else if (sectionName === 'appointment') {
        elements.appointmentSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Appointment System';
        updateQueueSummary();
    } else if (sectionName === 'instruction') {
        elements.instructionSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Doctor Instructions';
        renderInstructionTableWithSaved();
    } else if (sectionName === 'calendar') {
        elements.calendarSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Calendar View';
        // Always refresh calendar data when switching to calendar tab
        refreshCalendar();
    } else if (sectionName === 'expense') {
        elements.expenseSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Clinic Expenses';
        try {
            renderExpenseMonthFilter();
            renderExpenses();
            renderCategorySummary();
        } catch (e) {
            console.error('Error rendering expense section:', e);
        }
    } else if (sectionName === 'lab') {
        elements.labTrackerSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Lab Tracking System';
        renderLabTracker();
        updatePendingResultsAlert();
    } else if (sectionName === 'pharmacist') {
        elements.pharmacistSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Pharmacist Corner';
        renderPharmacistCorner();
    } else if (sectionName === 'settings') {
        elements.settingsSection.classList.remove('hidden');
        elements.headerSubtitle.textContent = 'Settings';
        // Initialize settings section
        loadVipReservedNumbers();
        renderDefaultTimes();
        // Set default date to today
        elements.bookingEditorDate.value = toLocalDateString(new Date());
    }

    // Update nav items (bottom navigation)
    elements.navItems.forEach(item => {
        if (item.dataset.section === sectionName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update sidebar items
    elements.sidebarItems.forEach(item => {
        if (item.dataset.section === sectionName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Focus search input of active section - DISABLED to prevent keyboard popup on mobile
    // setTimeout(() => {
    //     if (sectionName === 'patient') {
    //         elements.patientSearchInput.focus();
    //     } else if (sectionName === 'doctor') {
    //         elements.doctorSearchInput.focus();
    //     } else if (sectionName === 'appointment') {
    //         elements.appointmentSearchInput.focus();
    //     } else if (sectionName === 'instruction') {
    //         elements.instructionSearchInput.focus();
    //     } else if (sectionName === 'expense') {
    //         elements.addExpenseBtn.focus();
    //     } else if (sectionName === 'lab') {
    //         elements.labSearchInput.focus();
    //     } else if (sectionName === 'pharmacist') {
    //         elements.pharmacistSearchInput.focus();
    //     }
    // }, 100);
}

/**
 * Toggle sidebar navigation
 */
function toggleSidebar() {
    if (elements.sidebarNav.classList.contains('sidebar-open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

/**
 * Open sidebar navigation
 */
function openSidebar() {
    elements.sidebarNav.classList.add('sidebar-open');
    elements.sidebarOverlay.classList.remove('hidden');
    elements.menuToggleBtn.classList.add('menu-open');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

/**
 * Close sidebar navigation
 */
function closeSidebar() {
    elements.sidebarNav.classList.remove('sidebar-open');
    elements.sidebarOverlay.classList.add('hidden');
    elements.menuToggleBtn.classList.remove('menu-open');
    document.body.style.overflow = '';
}

// ==================== ID GENERATORS ====================
function generatePatientId() {
    if (patients.length === 0) {
        elements.patientId.value = 'P0001';
        return;
    }
    const maxId = patients.reduce((max, p) => {
        const num = parseInt(p.id.replace('P', ''), 10);
        return num > max ? num : max;
    }, 0);
    elements.patientId.value = `P${String(maxId + 1).padStart(4, '0')}`;
}

function generateDoctorId() {
    if (doctors.length === 0) {
        elements.doctorId.value = 'D0001';
        return;
    }
    const maxId = doctors.reduce((max, d) => {
        const num = parseInt(d.id.replace('D', ''), 10);
        return num > max ? num : max;
    }, 0);
    elements.doctorId.value = `D${String(maxId + 1).padStart(4, '0')}`;
}

function generateAppointmentId() {
    if (appointments.length === 0) {
        return 'A0001';
    }
    const maxId = appointments.reduce((max, a) => {
        const num = parseInt(a.id.replace('A', ''), 10);
        return num > max ? num : max;
    }, 0);
    return `A${String(maxId + 1).padStart(4, '0')}`;
}

// ==================== RENDER LISTS ====================
function renderAddressList() {
    elements.addressList.innerHTML = '';
    addresses.forEach(addr => {
        const option = document.createElement('option');
        option.value = addr;
        elements.addressList.appendChild(option);
    });
}

function renderSpecialityList() {
    elements.specialityList.innerHTML = '';
    specialities.forEach(spec => {
        const option = document.createElement('option');
        option.value = spec;
        elements.specialityList.appendChild(option);
    });
}

function renderHospitalList() {
    elements.hospitalList.innerHTML = '';
    hospitals.forEach(hosp => {
        const option = document.createElement('option');
        option.value = hosp;
        elements.hospitalList.appendChild(option);
    });
}

function renderDoctorFilter() {
    elements.appointmentDoctorFilter.innerHTML = '<option value="">All Doctors</option>';

    // Collect unique doctor names from appointments
    const appointmentDoctors = new Set();
    appointments.forEach(appt => {
        if (appt.doctorName) {
            appointmentDoctors.add(appt.doctorName);
        }
    });

    // Also include doctors from the doctors list
    doctors.forEach(doctor => {
        if (doctor.name) {
            appointmentDoctors.add(doctor.name);
        }
    });

    // Sort and add to filter
    const sortedDoctors = Array.from(appointmentDoctors).sort();
    sortedDoctors.forEach(doctorName => {
        const option = document.createElement('option');
        option.value = doctorName;
        option.textContent = doctorName;
        elements.appointmentDoctorFilter.appendChild(option);
    });
}

function renderInstructionDoctorFilter() {
    if (!elements.instructionDoctorFilter) {
        return;
    }

    elements.instructionDoctorFilter.innerHTML = '<option value="">All Doctors</option>';

    // Collect unique doctor names from appointments with Done/Postpone status
    const instructionDoctors = new Set();
    appointments.forEach(appt => {
        if ((appt.status === 'Done' || appt.status === 'Postpone') && appt.doctorName) {
            instructionDoctors.add(appt.doctorName);
        }
    });

    // Also include doctors from the doctors list
    doctors.forEach(doctor => {
        if (doctor.name) {
            instructionDoctors.add(doctor.name);
        }
    });

    console.log('[Instruction Filter] Populating filter with doctors:', Array.from(instructionDoctors));

    // Sort and add to filter
    const sortedDoctors = Array.from(instructionDoctors).sort();
    sortedDoctors.forEach(doctorName => {
        const option = document.createElement('option');
        option.value = doctorName;
        option.textContent = doctorName;
        elements.instructionDoctorFilter.appendChild(option);
    });
}

function renderAddressManageList() {
    elements.addressListManage.innerHTML = '';
    if (addresses.length === 0) {
        elements.addressListManage.innerHTML = '<li style="text-align:center;color:var(--text-secondary);">No addresses saved</li>';
        return;
    }
    addresses.forEach((addr, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(addr)}</span><button type="button" onclick="deleteAddress(event, ${idx})">Delete</button>`;
        elements.addressListManage.appendChild(li);
    });
}

function renderSpecialityManageList() {
    elements.specialityListManage.innerHTML = '';
    if (specialities.length === 0) {
        elements.specialityListManage.innerHTML = '<li style="text-align:center;color:var(--text-secondary);">No specialities saved</li>';
        return;
    }
    specialities.forEach((spec, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(spec)}</span><button type="button" onclick="deleteSpeciality(event, ${idx})">Delete</button>`;
        elements.specialityListManage.appendChild(li);
    });
}

function renderHospitalManageList() {
    elements.hospitalListManage.innerHTML = '';
    if (hospitals.length === 0) {
        elements.hospitalListManage.innerHTML = '<li style="text-align:center;color:var(--text-secondary);">No hospitals saved</li>';
        return;
    }
    hospitals.forEach((hosp, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${escapeHtml(hosp)}</span><button type="button" onclick="deleteHospital(event, ${idx})">Delete</button>`;
        elements.hospitalListManage.appendChild(li);
    });
}

// ==================== PATIENT TABLE ====================
function renderPatientTable(filteredPatients = null) {
    const data = filteredPatients !== null ? filteredPatients : patients;
    elements.patientCount.textContent = `${data.length} patient${data.length !== 1 ? 's' : ''}`;

    if (data.length === 0) {
        elements.patientTableBody.innerHTML = '';
        elements.patientEmptyTableMessage.classList.remove('hidden');
        elements.patientTable.classList.add('hidden');
        return;
    }

    elements.patientEmptyTableMessage.classList.add('hidden');
    elements.patientTable.classList.remove('hidden');

    elements.patientTableBody.innerHTML = data.map(patient => `
        <tr data-id="${patient.id}">
            <td>${escapeHtml(patient.id)}</td>
            <td>${escapeHtml(patient.name)}</td>
            <td>${escapeHtml(patient.age)}</td>
            <td>${escapeHtml(patient.sex)}</td>
            <td>${escapeHtml(patient.address)}</td>
            <td>${escapeHtml(patient.phone)}</td>
            <td>${patient.isFoc ? '<span class="status-badge status-booked">FOC</span>' : '<span style="color: var(--text-secondary);">-</span>'}</td>
            <td>${escapeHtml(patient.note)}</td>
            <td>
                <div class="action-buttons">
                    <button type="button" class="btn btn-edit" onclick="editPatient(event, '${patient.id}')">Edit</button>
                    <button type="button" class="btn btn-danger" onclick="deletePatient(event, '${patient.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    elements.patientTableBody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.action-buttons')) {
                loadPatientToForm(row.dataset.id);
            }
        });
    });
}

// ==================== DOCTOR TABLE ====================
function renderDoctorTable(filteredDoctors = null) {
    const data = filteredDoctors !== null ? filteredDoctors : doctors;
    elements.doctorCount.textContent = `${data.length} doctor${data.length !== 1 ? 's' : ''}`;

    if (data.length === 0) {
        elements.doctorTableBody.innerHTML = '';
        elements.doctorEmptyTableMessage.classList.remove('hidden');
        elements.doctorTable.classList.add('hidden');
        return;
    }

    elements.doctorEmptyTableMessage.classList.add('hidden');
    elements.doctorTable.classList.remove('hidden');

    elements.doctorTableBody.innerHTML = data.map(doctor => `
        <tr data-id="${doctor.id}">
            <td>${escapeHtml(doctor.id)}</td>
            <td>${escapeHtml(doctor.name)}</td>
            <td>${escapeHtml(doctor.speciality)}</td>
            <td>${escapeHtml(doctor.hospital)}</td>
            <td>${escapeHtml(doctor.phone)}</td>
            <td>
                <div class="action-buttons">
                    <button type="button" class="btn btn-edit" onclick="editDoctor(event, '${doctor.id}')">Edit</button>
                    <button type="button" class="btn btn-danger" onclick="deleteDoctor(event, '${doctor.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    elements.doctorTableBody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.action-buttons')) {
                loadDoctorToForm(row.dataset.id);
            }
        });
    });
}

function sortDoctors(field) {
    if (doctorCurrentSort.field === field) {
        doctorCurrentSort.direction = doctorCurrentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        doctorCurrentSort.field = field;
        doctorCurrentSort.direction = 'asc';
    }

    document.querySelectorAll('#doctorTable th[data-sort]').forEach(th => th.classList.remove('sorted'));
    const currentTh = document.querySelector(`#doctorTable th[data-sort="${field}"]`);
    if (currentTh) currentTh.classList.add('sorted');

    const sorted = [...doctors].sort((a, b) => {
        let aVal = a[field] || '';
        let bVal = b[field] || '';
        if (field === 'id') {
            aVal = parseInt(aVal.replace('D', ''), 10);
            bVal = parseInt(bVal.replace('D', ''), 10);
        }
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
        if (aVal < bVal) return doctorCurrentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return doctorCurrentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderDoctorTable(sorted);
}

// ==================== PATIENT CRUD ====================
function searchPatients(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
        renderPatientTable();
        elements.patientNoResultsMessage.classList.add('hidden');
        return;
    }
    const filtered = patients.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.age.toLowerCase().includes(term) ||
        p.phone.includes(term) ||
        p.address.toLowerCase().includes(term)
    );
    renderPatientTable(filtered);
    elements.patientNoResultsMessage.classList.toggle('hidden', filtered.length > 0);
}

function loadPatientToForm(patientId) {
    const index = patients.findIndex(p => p.id === patientId);
    if (index === -1) return;
    const p = patients[index];
    elements.patientEditIndex.value = index;
    elements.patientId.value = p.id;
    elements.patientName.value = p.name;
    elements.patientAge.value = p.age;
    elements.patientSex.value = p.sex;
    elements.patientAddress.value = p.address;
    elements.patientPhone.value = p.phone;
    elements.patientNote.value = p.note;
    elements.patientIsFoc.checked = p.isFoc || false;
    patientIsEditing = true;
    elements.patientFormTitle.textContent = 'Edit Patient';
    elements.patientSaveBtnText.textContent = 'Update Patient';
    elements.patientDeleteBtn.style.display = 'inline-block';
    // Editing is always from patient tab
    window.patientFormSourceSection = 'patient';
    
    // Load appointment timeline for this patient
    loadPatientAppointmentTimeline(p.id);
    
    openPatientFormModal();
    elements.patientName.focus();
}

/**
 * Load and display appointment timeline for a patient
 */
let timelineVisible = false;

function loadPatientAppointmentTimeline(patientId) {
    const timelineSection = document.getElementById('patientAppointmentTimelineSection');
    const timelineContainer = document.getElementById('patientAppointmentTimeline');
    const toggleBtn = document.getElementById('toggleTimelineBtn');

    // Find all appointments for this patient
    const patientAppointments = appointments
        .filter(a => a.patientId === patientId)
        .sort((a, b) => {
            // Sort by appointment date (newest first)
            return new Date(b.appointmentTime) - new Date(a.appointmentTime);
        });

    // Show timeline section only if patient is being edited (not creating new)
    if (patientIsEditing && patientAppointments.length > 0) {
        timelineSection.style.display = 'block';
        
        // Store appointments data for rendering when button is clicked
        window._timelinePatientAppointments = patientAppointments;
        
        // Reset timeline visibility when loading new patient
        timelineVisible = false;
        timelineContainer.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '📅 Show Timeline';
        }

        // Generate timeline HTML (stored for later use)
        let timelineHTML = '';
        patientAppointments.forEach(appt => {
            const apptDate = new Date(appt.appointmentTime);
            const dateStr = apptDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const timeStr = apptDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const statusClass = appt.status.toLowerCase().replace(' ', '-');
            const bookingNum = appt.bookingNumber !== null && appt.bookingNumber !== undefined ? `#${appt.bookingNumber}` : '';

            timelineHTML += `
                <div class="timeline-item status-${statusClass}">
                    <div class="timeline-date">
                        ${dateStr}<br>
                        <small style="color: #7f8c8d;">${timeStr}</small>
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-doctor">${appt.doctorName}</div>
                        <span class="timeline-status status-${statusClass}">${appt.status}</span>
                        ${bookingNum ? `<div class="timeline-booking-number">Booking: ${bookingNum}</div>` : ''}
                    </div>
                </div>
            `;
        });

        timelineContainer.innerHTML = timelineHTML;
    } else {
        // Hide timeline for new patients or if no appointments
        timelineSection.style.display = 'none';
        timelineContainer.innerHTML = '';
        timelineVisible = false;
    }
}

/**
 * Toggle timeline visibility
 */
function toggleTimeline() {
    const timelineContainer = document.getElementById('patientAppointmentTimeline');
    const toggleBtn = document.getElementById('toggleTimelineBtn');
    
    if (!timelineContainer || !toggleBtn) return;
    
    timelineVisible = !timelineVisible;
    
    if (timelineVisible) {
        timelineContainer.style.display = 'block';
        toggleBtn.innerHTML = '📅 Hide Timeline';
    } else {
        timelineContainer.style.display = 'none';
        toggleBtn.innerHTML = '📅 Show Timeline';
    }
}

function savePatient(e) {
    e.preventDefault();
    const data = {
        id: elements.patientId.value.trim(),
        name: elements.patientName.value.trim(),
        age: elements.patientAge.value.trim(),
        sex: elements.patientSex.value,
        address: elements.patientAddress.value.trim(),
        phone: elements.patientPhone.value.trim(),
        note: elements.patientNote.value.trim(),
        isFoc: elements.patientIsFoc.checked
    };
    if (!data.name) { showNotification('Patient name is required', 'error'); elements.patientName.focus(); return; }

    const addr = data.address.trim();
    if (addr && !addresses.includes(addr)) {
        addresses.push(addr);
        saveAddressesToStorage();
        renderAddressList();
    }

    if (patientIsEditing) {
        const idx = parseInt(elements.patientEditIndex.value, 10);
        if (idx >= 0 && idx < patients.length) {
            patients[idx] = data;
            savePatientsToStorage();
            showNotification('Patient updated successfully!');
        }
    } else {
        patients.push(data);
        savePatientsToStorage();
        showNotification('Patient registered successfully!');
        
        // If registering from appointment form, auto-fill and return to appointment
        if (window.patientFormSourceSection === 'appointment') {
            closePatientFormModal();
            // Auto-fill patient field in appointment form
            elements.appointmentPatient.value = data.name;
            elements.appointmentPatientId.value = data.id;
            // Fill patient info display
            elements.displayPatientAge.value = data.age || '';
            elements.displayPatientSex.value = data.sex || '';
            elements.displayPatientPhone.value = data.phone || '';
            elements.displayPatientFoc.value = data.isFoc ? 'FOC' : 'Regular';
            elements.patientInfoDisplay.style.display = 'grid';
            // Focus on doctor field
            setTimeout(() => elements.appointmentDoctor.focus(), 200);
            return;
        }
        // If from patient tab, just refresh the patient table
    }
    closePatientFormModal();
    renderPatientTable();
    generatePatientId();
}

function editPatient(event, patientId) {
    event.stopPropagation();
    loadPatientToForm(patientId);
}

function deletePatient(event, patientId) {
    event.stopPropagation();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    if (!confirm(`Are you sure you want to delete ${patient.name} (${patient.id})?\n\nThis action cannot be undone.`)) return;
    const idx = patients.findIndex(p => p.id === patientId);
    if (idx > -1) {
        patients.splice(idx, 1);
        savePatientsToStorage();
        renderPatientTable();
        showNotification('Patient deleted successfully!');
    }
}

function resetPatientForm() {
    elements.patientForm.reset();
    elements.patientEditIndex.value = '';
    patientIsEditing = false;
    elements.patientFormTitle.textContent = 'Register New Patient';
    elements.patientSaveBtnText.textContent = 'Save Patient';
    elements.patientDeleteBtn.style.display = 'none';
    
    // Hide and clear appointment timeline
    const timelineSection = document.getElementById('patientAppointmentTimelineSection');
    const timelineContainer = document.getElementById('patientAppointmentTimeline');
    timelineSection.style.display = 'none';
    timelineContainer.innerHTML = '';
    
    generatePatientId();
    elements.patientName.focus();
}

function openPatientFormModal() {
    elements.patientFormModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePatientFormModal() {
    elements.patientFormModal.classList.add('hidden');
    document.body.style.overflow = '';
    resetPatientForm();
    // Clear the source section flag
    window.patientFormSourceSection = null;
}

function clearPatientForm() {
    resetPatientForm();
    elements.patientName.focus();
}

// ==================== DOCTOR CRUD ====================
function searchDoctors(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
        renderDoctorTable();
        elements.doctorNoResultsMessage.classList.add('hidden');
        return;
    }
    const filtered = doctors.filter(d =>
        d.name.toLowerCase().includes(term) ||
        d.speciality.toLowerCase().includes(term) ||
        d.hospital.toLowerCase().includes(term) ||
        d.phone.includes(term)
    );
    renderDoctorTable(filtered);
    elements.doctorNoResultsMessage.classList.toggle('hidden', filtered.length > 0);
}

function loadDoctorToForm(doctorId) {
    const index = doctors.findIndex(d => d.id === doctorId);
    if (index === -1) return;
    const d = doctors[index];
    elements.doctorEditIndex.value = index;
    elements.doctorId.value = d.id;
    elements.doctorName.value = d.name;
    elements.doctorSpeciality.value = d.speciality;
    elements.doctorHospital.value = d.hospital;
    elements.doctorPhone.value = d.phone;
    doctorIsEditing = true;
    elements.doctorFormTitle.textContent = 'Edit Doctor';
    elements.doctorSaveBtnText.textContent = 'Update Doctor';
    elements.doctorDeleteBtn.style.display = 'inline-block';
    openDoctorFormModal();
    elements.doctorName.focus();
}

function saveDoctor(e) {
    e.preventDefault();
    const data = {
        id: elements.doctorId.value.trim(),
        name: elements.doctorName.value.trim(),
        speciality: elements.doctorSpeciality.value.trim(),
        hospital: elements.doctorHospital.value.trim(),
        phone: elements.doctorPhone.value.trim()
    };
    if (!data.name) { showNotification('Doctor name is required', 'error'); elements.doctorName.focus(); return; }
    if (!data.speciality) { showNotification('Speciality is required', 'error'); elements.doctorSpeciality.focus(); return; }
    if (!data.hospital) { showNotification('Hospital is required', 'error'); elements.doctorHospital.focus(); return; }
    if (!data.phone) { showNotification('Phone number is required', 'error'); elements.doctorPhone.focus(); return; }

    const spec = data.speciality.trim();
    if (spec && !specialities.includes(spec)) {
        specialities.push(spec);
        saveSpecialitiesToStorage();
        renderSpecialityList();
    }
    const hosp = data.hospital.trim();
    if (hosp && !hospitals.includes(hosp)) {
        hospitals.push(hosp);
        saveHospitalsToStorage();
        renderHospitalList();
    }

    if (doctorIsEditing) {
        const idx = parseInt(elements.doctorEditIndex.value, 10);
        if (idx >= 0 && idx < doctors.length) {
            doctors[idx] = data;
            saveDoctorsToStorage();
            showNotification('Doctor updated successfully!');
        }
    } else {
        doctors.push(data);
        saveDoctorsToStorage();
        showNotification('Doctor registered successfully!');
    }
    closeDoctorFormModal();
    renderDoctorTable();
    generateDoctorId();
}

function editDoctor(event, doctorId) {
    event.stopPropagation();
    loadDoctorToForm(doctorId);
}

function deleteDoctor(event, doctorId) {
    event.stopPropagation();
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return;
    if (!confirm(`Are you sure you want to delete ${doctor.name} (${doctor.id})?\n\nThis action cannot be undone.`)) return;
    const idx = doctors.findIndex(d => d.id === doctorId);
    if (idx > -1) {
        doctors.splice(idx, 1);
        saveDoctorsToStorage();
        renderDoctorTable();
        renderDoctorFilter();
        showNotification('Doctor deleted successfully!');
    }
}

function resetDoctorForm() {
    elements.doctorForm.reset();
    elements.doctorEditIndex.value = '';
    doctorIsEditing = false;
    elements.doctorFormTitle.textContent = 'Register New Doctor';
    elements.doctorSaveBtnText.textContent = 'Save Doctor';
    elements.doctorDeleteBtn.style.display = 'none';
    generateDoctorId();
    elements.doctorName.focus();
}

function openDoctorFormModal() {
    elements.doctorFormModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeDoctorFormModal() {
    elements.doctorFormModal.classList.add('hidden');
    document.body.style.overflow = '';
    resetDoctorForm();
}

function clearDoctorForm() {
    resetDoctorForm();
    elements.doctorName.focus();
}

// ==================== ADDRESS MANAGEMENT ====================
function openAddressModal() {
    renderAddressManageList();
    elements.addressModal.classList.remove('hidden');
    elements.newAddressInput.focus();
}

function closeAddressModal() {
    elements.addressModal.classList.add('hidden');
    elements.newAddressInput.value = '';
}

function addAddress() {
    const addr = elements.newAddressInput.value.trim();
    if (!addr) { showNotification('Please enter an address', 'error'); return; }
    if (addresses.includes(addr)) { showNotification('Address already exists', 'error'); elements.newAddressInput.focus(); return; }
    addresses.push(addr);
    saveAddressesToStorage();
    renderAddressList();
    renderAddressManageList();
    elements.newAddressInput.value = '';
    elements.newAddressInput.focus();
    showNotification('Address added successfully!');
}

function deleteAddress(event, index) {
    event.stopPropagation();
    const addr = addresses[index];
    const patientsUsing = patients.filter(p => p.address === addr);
    let confirmed = true;
    if (patientsUsing.length > 0) {
        confirmed = confirm(`Delete "${addr}"?\n\n${patientsUsing.length} patient(s) use this address.\nIt will be removed from dropdown but existing records keep their address.`);
    } else {
        confirmed = confirm(`Are you sure you want to delete "${addr}"?`);
    }
    if (!confirmed) return;
    addresses.splice(index, 1);
    saveAddressesToStorage();
    renderAddressList();
    renderAddressManageList();
    showNotification('Address deleted successfully!');
}

// ==================== SPECIALITY MANAGEMENT ====================
function openSpecialityModal() {
    renderSpecialityManageList();
    elements.specialityModal.classList.remove('hidden');
    elements.newSpecialityInput.focus();
}

function closeSpecialityModal() {
    elements.specialityModal.classList.add('hidden');
    elements.newSpecialityInput.value = '';
}

function addSpeciality() {
    const spec = elements.newSpecialityInput.value.trim();
    if (!spec) { showNotification('Please enter a speciality', 'error'); return; }
    if (specialities.includes(spec)) { showNotification('Speciality already exists', 'error'); elements.newSpecialityInput.focus(); return; }
    specialities.push(spec);
    saveSpecialitiesToStorage();
    renderSpecialityList();
    renderSpecialityManageList();
    elements.newSpecialityInput.value = '';
    elements.newSpecialityInput.focus();
    showNotification('Speciality added successfully!');
}

function deleteSpeciality(event, index) {
    event.stopPropagation();
    const spec = specialities[index];
    const docsUsing = doctors.filter(d => d.speciality === spec);
    let confirmed = true;
    if (docsUsing.length > 0) {
        confirmed = confirm(`Delete "${spec}"?\n\n${docsUsing.length} doctor(s) use this speciality.\nIt will be removed from dropdown but existing records keep their speciality.`);
    } else {
        confirmed = confirm(`Are you sure you want to delete "${spec}"?`);
    }
    if (!confirmed) return;
    specialities.splice(index, 1);
    saveSpecialitiesToStorage();
    renderSpecialityList();
    renderSpecialityManageList();
    showNotification('Speciality deleted successfully!');
}

// ==================== HOSPITAL MANAGEMENT ====================
function openHospitalModal() {
    renderHospitalManageList();
    elements.hospitalModal.classList.remove('hidden');
    elements.newHospitalInput.focus();
}

function closeHospitalModal() {
    elements.hospitalModal.classList.add('hidden');
    elements.newHospitalInput.value = '';
}

function addHospital() {
    const hosp = elements.newHospitalInput.value.trim();
    if (!hosp) { showNotification('Please enter a hospital', 'error'); return; }
    if (hospitals.includes(hosp)) { showNotification('Hospital already exists', 'error'); elements.newHospitalInput.focus(); return; }
    hospitals.push(hosp);
    saveHospitalsToStorage();
    renderHospitalList();
    renderHospitalManageList();
    elements.newHospitalInput.value = '';
    elements.newHospitalInput.focus();
    showNotification('Hospital added successfully!');
}

function deleteHospital(event, index) {
    event.stopPropagation();
    const hosp = hospitals[index];
    const docsUsing = doctors.filter(d => d.hospital === hosp);
    let confirmed = true;
    if (docsUsing.length > 0) {
        confirmed = confirm(`Delete "${hosp}"?\n\n${docsUsing.length} doctor(s) use this hospital.\nIt will be removed from dropdown but existing records keep their hospital.`);
    } else {
        confirmed = confirm(`Are you sure you want to delete "${hosp}"?`);
    }
    if (!confirmed) return;
    hospitals.splice(index, 1);
    saveHospitalsToStorage();
    renderHospitalList();
    renderHospitalManageList();
    showNotification('Hospital deleted successfully!');
}

// ==================== CLIPBOARD ====================
async function copyPatientPhone() {
    const phone = elements.patientPhone.value.trim();
    if (!phone) { showNotification('No phone number to copy', 'error'); return; }
    try {
        await navigator.clipboard.writeText(phone);
        showPatientTooltip();
    } catch {
        const ta = document.createElement('textarea');
        ta.value = phone;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showPatientTooltip();
    }
}

function showPatientTooltip() {
    elements.patientCopyTooltip.classList.add('show');
    setTimeout(() => elements.patientCopyTooltip.classList.remove('show'), 1500);
}

async function copyDoctorPhone() {
    const phone = elements.doctorPhone.value.trim();
    if (!phone) { showNotification('No phone number to copy', 'error'); return; }
    try {
        await navigator.clipboard.writeText(phone);
        showDoctorTooltip();
    } catch {
        const ta = document.createElement('textarea');
        ta.value = phone;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showDoctorTooltip();
    }
}

function showDoctorTooltip() {
    elements.doctorCopyTooltip.classList.add('show');
    setTimeout(() => elements.doctorCopyTooltip.classList.remove('show'), 1500);
}

// ==================== NOTIFICATION ====================
function showNotification(message, type = 'success') {
    elements.notificationText.textContent = message;
    elements.notification.style.backgroundColor = type === 'error' ? '#dc2626' : '#16a34a';
    elements.notification.classList.remove('hidden');
    setTimeout(() => elements.notification.classList.add('hidden'), 3000);
}

// ==================== UTILITY ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getStatusClass(status) {
    const statusMap = {
        'Noted': 'status-noted',
        'Booked': 'status-booked',
        'Arrived': 'status-arrived',
        'In Consult': 'status-in-consult',
        'Investigation': 'status-investigation',
        'Postpone': 'status-postpone',
        'Cancelled': 'status-cancelled',
        'Done': 'status-done'
    };
    return statusMap[status] || 'status-noted';
}

function getBookingTypeClass(type) {
    const typeMap = {
        'Emergency': 'booking-type-emergency',
        'VIP': 'booking-type-vip',
        'Regular': 'booking-type-regular',
        'FOC': 'booking-type-foc'
    };
    return typeMap[type] || 'booking-type-regular';
}

function getQueueNumberClass(type, number) {
    if (number === 0 || number === '0') return 'queue-number-zero';
    const typeMap = {
        'Emergency': 'queue-number-emergency',
        'VIP': 'queue-number-vip',
        'Regular': 'queue-number-regular',
        'FOC': 'queue-number-foc'
    };
    return typeMap[type] || 'queue-number-regular';
}

// ==================== BOOKING NUMBER LOGIC ====================
function getUsedNumbersForDate(doctorName, date, excludeAppointmentId = null) {
    const dateStr = typeof date === 'string' ? date : toLocalDateString(date);
    return appointments
        .filter(a => a.doctorName === doctorName &&
                     a.appointmentTime.startsWith(dateStr) &&
                     a.bookingType !== 'Emergency' &&
                     a.bookingNumber !== null &&
                     a.bookingNumber !== 0 &&
                     a.id !== excludeAppointmentId)
        .map(a => parseInt(a.bookingNumber, 10));
}

function calculateBookingNumber(doctorName, bookingType, appointmentDate, excludeAppointmentId = null) {
    // Only assign booking numbers for target doctor
    if (doctorName !== TARGET_DOCTOR_NAME) {
        return null;
    }

    // Emergency always gets 0
    if (bookingType === 'Emergency') {
        return 0;
    }

    const usedNumbers = getUsedNumbersForDate(doctorName, appointmentDate, excludeAppointmentId);

    // For VIP: check reserved numbers first, then any available
    if (bookingType === 'VIP') {
        // Find smallest available VIP reserved number
        for (const num of vipReservedNumbers) {
            if (!usedNumbers.includes(num)) {
                return num;
            }
        }
        // If all reserved are used, find smallest available from pool
        for (let i = 1; i <= MAX_BOOKING_NUMBER; i++) {
            if (!usedNumbers.includes(i)) {
                return i;
            }
        }
    }

    // For FOC: start from 10, find smallest available (skip VIP reserved)
    if (bookingType === 'FOC') {
        for (let i = 10; i <= MAX_BOOKING_NUMBER; i++) {
            if (!usedNumbers.includes(i) && !vipReservedNumbers.includes(i)) {
                return i;
            }
        }
        // If nothing from 10+, try from 1
        for (let i = 1; i < 10; i++) {
            if (!usedNumbers.includes(i) && !vipReservedNumbers.includes(i)) {
                return i;
            }
        }
    }

    // For Regular: find smallest available (skip VIP reserved)
    if (bookingType === 'Regular') {
        for (let i = 1; i <= MAX_BOOKING_NUMBER; i++) {
            if (!usedNumbers.includes(i) && !vipReservedNumbers.includes(i)) {
                return i;
            }
        }
    }

    return null;
}

/**
 * Determine appointment status based on date for Dr. Soe Chan Myae
 * - Today or Tomorrow: 'Booked'
 * - Day after tomorrow or later: 'Noted' (will auto-change to 'Booked' at 8AM on the day)
 * @param {string} doctorName 
 * @param {string} appointmentDateTime - ISO datetime string
 * @returns {string} 'Booked' or 'Noted'
 */
function determineAppointmentStatus(doctorName, appointmentDateTime) {
    // Only apply this logic to Dr. Soe Chan Myae
    if (doctorName !== TARGET_DOCTOR_NAME) {
        return 'Noted'; // Default for other doctors
    }

    const now = new Date();
    const apptDate = new Date(appointmentDateTime);
    
    // Normalize to midnight for date comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    const apptDateOnly = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
    
    // If appointment is today or tomorrow, status should be 'Booked'
    if (apptDateOnly.getTime() === today.getTime() || apptDateOnly.getTime() === tomorrow.getTime()) {
        return 'Booked';
    }
    
    // If appointment is day after tomorrow or later, status should be 'Noted'
    return 'Noted';
}

// ==================== APPOINTMENT TABLE ====================

// Status priority for queue ordering (lower number = higher priority)
const STATUS_PRIORITY = {
    'In Consult': 1,
    'Investigation': 2,
    'Arrived': 3,
    'Booked': 4,
    'Noted': 5,
    'Postpone': 6,
    'Cancelled': 7,
    'Done': 8
};

// Action button mapping based on status
const ACTION_BUTTON_MAP = {
    'Noted': { label: 'Booked', action: 'markBooked', class: 'action-btn-booked', icon: '📋' },
    'Booked': { label: 'Arrived', action: 'markArrived', class: 'action-btn-arrived', icon: '🙋' },
    'Arrived': { label: 'Consult', action: 'startConsult', class: 'action-btn-consult', icon: '💬' },
    'In Consult': { label: 'Investigation', action: 'showInvestigationDialog', class: 'action-btn-consult', icon: '🔬' },
    'Investigation': { label: 'Consult', action: 'startConsult', class: 'action-btn-consult', icon: '💬' },
    'Done': { label: '-', action: null, class: 'action-btn-disabled', icon: '✔️' },
    'Postpone': { label: '-', action: null, class: 'action-btn-disabled', icon: '⏸️' },
    'Cancelled': { label: '-', action: null, class: 'action-btn-disabled', icon: '❌' }
};

function renderAppointmentTable(filteredAppointments = null) {
    // If no specific filter is provided, apply current filter settings
    let data;
    if (filteredAppointments !== null) {
        data = filteredAppointments;
    } else {
        // Apply date and doctor filters if they are set
        const dateFilter = elements.appointmentDateFilter.value;
        const doctorFilter = elements.appointmentDoctorFilter.value;
        
        data = appointments;
        
        // Filter by date if set
        if (dateFilter) {
            data = data.filter(a => a.appointmentTime && a.appointmentTime.startsWith(dateFilter));
        }
        
        // Filter by doctor if set
        if (doctorFilter) {
            data = data.filter(a => a.doctorName === doctorFilter);
        }
    }
    
    elements.appointmentCount.textContent = `${data.length} appointment${data.length !== 1 ? 's' : ''}`;

    if (data.length === 0) {
        elements.appointmentTableBody.innerHTML = '';
        elements.appointmentEmptyTableMessage.classList.remove('hidden');
        elements.appointmentTable.classList.add('hidden');
        return;
    }

    elements.appointmentEmptyTableMessage.classList.add('hidden');
    elements.appointmentTable.classList.remove('hidden');

    // Sort by: 1) Status priority, 2) Penalty (no penalty first), 3) Booking number
    const sortedData = [...data].sort((a, b) => {
        // Priority 1: Status priority (lower number = higher priority)
        const aPriority = STATUS_PRIORITY[a.status] || 99;
        const bPriority = STATUS_PRIORITY[b.status] || 99;
        
        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }
        
        // Priority 2: Penalty (patients without penalty first)
        const aHasPenalty = a.penaltyTurns && a.penaltyTurns > 0;
        const bHasPenalty = b.penaltyTurns && b.penaltyTurns > 0;
        
        if (aHasPenalty && !bHasPenalty) return 1;
        if (!aHasPenalty && bHasPenalty) return -1;
        
        // Priority 3: Booking number ascending
        if (a.bookingNumber === null || a.bookingNumber === undefined) return 1;
        if (b.bookingNumber === null || b.bookingNumber === undefined) return -1;
        return parseInt(a.bookingNumber, 10) - parseInt(b.bookingNumber, 10);
    });

    elements.appointmentTableBody.innerHTML = sortedData.map(appt => {
        const statusClass = getStatusClass(appt.status);
        const typeClass = getBookingTypeClass(appt.bookingType);
        const queueClass = getQueueNumberClass(appt.bookingType, appt.bookingNumber);
        const displayNumber = appt.bookingNumber !== null ? appt.bookingNumber : '-';
        const timeDisplay = appt.appointmentTime ? new Date(appt.appointmentTime).toLocaleString() : '-';
        const arrivalTimeDisplay = appt.arrivalTime ? formatDateTime(appt.arrivalTime) : '-';
        
        // Get action button config
        const actionConfig = ACTION_BUTTON_MAP[appt.status] || ACTION_BUTTON_MAP['Noted'];
        const isCurrentlyConsulting = appt.status === 'In Consult';
        const rowClass = isCurrentlyConsulting ? 'current-patient' : '';
        
        let actionButtonHtml = '';
        if (actionConfig.action) {
            actionButtonHtml = `<button type="button" class="action-btn ${actionConfig.class}" onclick="handleAppointmentAction(event, '${appt.id}')">${actionConfig.icon} ${actionConfig.label}</button>`;
        } else {
            actionButtonHtml = `<span style="color: var(--text-secondary); font-size: 0.85rem;">${actionConfig.icon} ${actionConfig.label}</span>`;
        }

        return `
            <tr data-id="${appt.id}" class="${rowClass}">
                <td>
                    ${appt.bookingNumber !== null ?
                        `<span class="queue-number-badge ${queueClass}">${displayNumber}</span>` :
                        '<span>-</span>'}
                    ${buildLabStatusIcons(appt)}
                </td>
                <td>${escapeHtml(appt.patientName)}</td>
                <td>${escapeHtml(appt.age)}</td>
                <td>${escapeHtml(appt.phone)}</td>
                <td>${escapeHtml(appt.doctorName)}</td>
                <td>${timeDisplay}</td>
                <td><span class="booking-type-badge ${typeClass}">${appt.bookingType}</span></td>
                <td><span class="status-badge ${statusClass}">${appt.status}</span></td>
                <td>${arrivalTimeDisplay}</td>
                <td>${appt.penaltyTurns && appt.penaltyTurns > 0 ? `<span class="penalty-badge-appointment">+${appt.penaltyTurns} turns</span>` : '<span style="color: var(--text-secondary);">-</span>'}</td>
                <td>${actionButtonHtml}</td>
            </tr>
        `;
    }).join('');

    elements.appointmentTableBody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', (e) => {
            if (!e.target.closest('.action-buttons') && !e.target.closest('.action-btn')) {
                loadAppointmentToForm(row.dataset.id);
            }
        });
    });
}

// ==================== APPOINTMENT WORKFLOW ACTIONS ====================

/**
 * Build lab status icons for appointment table
 * Shows icons for lab results that are out but not yet received by patient
 * @param {Object} appt - Appointment object
 * @returns {string} HTML string with lab status icons
 */
function buildLabStatusIcons(appt) {
    if (!appt) return '';

    // Find all lab records for this patient by ID
    let patientLabs = [];
    if (appt.patientId) {
        patientLabs = labRecords.filter(lab => lab.patientId === appt.patientId);
    }
    
    // Fallback: if no labs found by ID, try matching by patient name
    if (patientLabs.length === 0 && appt.patientName) {
        const normalizedName = appt.patientName.toLowerCase().trim();
        patientLabs = labRecords.filter(lab => {
            const labName = (lab.patientName || '').toLowerCase().trim();
            return labName === normalizedName || labName.includes(normalizedName) || normalizedName.includes(labName);
        });
    }

    if (patientLabs.length === 0) return '';

    // Check for results that are out but not received by patient
    const pendingLabs = patientLabs.filter(lab => 
        lab.status === 'Partial Result Out' || lab.status === 'Complete Result Out'
    );

    if (pendingLabs.length === 0) return '';

    let html = '<div class="lab-status-icons">';

    pendingLabs.forEach(lab => {
        const isPartial = lab.status === 'Partial Result Out';
        const bgColor = isPartial ? '#fef3c7' : '#d1fae5';
        const icon = isPartial ? '⚠️' : '📋';
        const title = isPartial ? 'Partial results - some tests pending' : 'Complete results - awaiting patient pickup';

        html += `
            <span 
                class="lab-status-icon" 
                title="${title}"
                style="background-color: ${bgColor};"
                onclick="showPatientLabDetails('${appt.patientId}', '${escapeHtml(appt.patientName)}')"
            >
                ${icon}
            </span>
        `;
    });

    html += '</div>';
    return html;
}

/**
 * Show patient lab details dialog
 * @param {string} patientId - Patient ID
 * @param {string} patientName - Patient name
 */
function showPatientLabDetails(patientId, patientName) {
    const patientLabs = labRecords.filter(lab => lab.patientId === patientId);
    
    if (patientLabs.length === 0) {
        showNotification('No lab records found for this patient', 'info');
        return;
    }

    let html = `
        <div style="padding: 8px;">
            <div style="margin-bottom: 16px; padding: 12px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">Patient</div>
                <div style="font-weight: 600; color: #1e40af;">${escapeHtml(patientName)}</div>
            </div>
    `;

    patientLabs.forEach((lab, index) => {
        const statusColor = {
            'Sent to Lab': '#3b82f6',
            'Partial Result Out': '#f59e0b',
            'Complete Result Out': '#10b981'
        }[lab.status] || '#6b7280';

        const testName = lab.testName || lab.labName;

        html += `
            <div style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #f9fafb; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 0.75rem; color: #6b7280;">Lab ID</div>
                        <div style="font-weight: 600; color: #1f2937; font-family: monospace;">${escapeHtml(lab.labId)}</div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button 
                            onclick="window.editLabRecord('${lab.labId}')" 
                            style="padding: 6px 12px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 500;"
                        >
                            Edit
                        </button>
                        <button 
                            onclick="window.showTimeline('${lab.labId}')" 
                            style="padding: 6px 12px; background-color: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 500;"
                        >
                            Timeline
                        </button>
                    </div>
                </div>
                <div style="padding: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.8rem;">
                        <div>
                            <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Test</div>
                            <div style="font-weight: 600; color: #1e40af;">${escapeHtml(testName)}</div>
                        </div>
                        <div>
                            <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Status</div>
                            <div style="color: ${statusColor}; font-weight: 600;">${escapeHtml(lab.status)}</div>
                        </div>
                        <div>
                            <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Lab</div>
                            <div style="font-weight: 500;">${escapeHtml(lab.labName)}</div>
                        </div>
                        <div>
                            <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Date</div>
                            <div style="font-weight: 500; font-size: 0.75rem;">${new Date(lab.dateTime).toLocaleString()}</div>
                        </div>
                    </div>
        `;

        if (lab.pendingTests) {
            html += `
                    <div style="margin-top: 10px; padding: 8px; background-color: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
                        <div style="font-size: 0.7rem; color: #92400e; font-weight: 600; margin-bottom: 4px;">⏳ Pending:</div>
                        <div style="font-size: 0.75rem; color: #78350f; white-space: pre-wrap;">${escapeHtml(lab.pendingTests)}</div>
                    </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    });

    html += `</div>`;

    showCustomDialog(`Lab Results - ${patientName}`, html);
}

/**
 * Handle action button click for appointment
 */
function handleAppointmentAction(event, appointmentId) {
    event.stopPropagation();
    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    const actionConfig = ACTION_BUTTON_MAP[appt.status];
    if (!actionConfig || !actionConfig.action) return;

    switch (actionConfig.action) {
        case 'markBooked':
            markAppointmentBooked(appointmentId);
            break;
        case 'markArrived':
            markAppointmentArrived(appointmentId);
            break;
        case 'startConsult':
            startConsultation(appointmentId);
            break;
        case 'showInvestigationDialog':
            showInvestigationDecisionDialog(appointmentId);
            break;
    }
}

/**
 * Mark appointment as Booked (from Noted)
 */
function markAppointmentBooked(appointmentId) {
    const index = appointments.findIndex(a => a.id === appointmentId);
    if (index === -1) return;

    const appt = appointments[index];
    appt.status = 'Booked';
    appt.bookedTime = toLocalISOString(new Date());
    saveAppointmentsToStorage();
    renderAppointmentTable();
    updateQueueSummary();
    showNotification('Appointment marked as Booked');
    
    // Broadcast to TV display
    sendQueueEvent('appointment_status_changed', {
        appointmentId: appt.id,
        bookingNumber: appt.bookingNumber,
        patientName: appt.patientName,
        status: 'Booked',
        doctorName: appt.doctorName
    });
}

/**
 * Mark appointment as Arrived (from Booked)
 * Records arrival time and calculates penalty if late
 */
function markAppointmentArrived(appointmentId) {
    const index = appointments.findIndex(a => a.id === appointmentId);
    if (index === -1) return;

    const appt = appointments[index];
    appt.status = 'Arrived';
    appt.arrivalTime = toLocalISOString(new Date());

    // Calculate penalty for late arrival
    const consultingNow = getCurrentlyConsultingNumber(appt.doctorName);
    const patientBookingNum = parseInt(appt.bookingNumber, 10) || 999;

    // If patient's booking number has already passed, apply 3-turn penalty
    if (consultingNow > 0 && patientBookingNum < consultingNow) {
        appt.penaltyTurns = 3;
        showNotification(`Late arrival! Patient #${patientBookingNum} receives 3-turn penalty`, 'error');
    } else {
        appt.penaltyTurns = 0;
    }

    saveAppointmentsToStorage();
    renderAppointmentTable();
    updateQueueSummary();
    showNotification('Patient marked as Arrived');
    
    // Broadcast to TV display
    sendQueueEvent('patient_arrived', {
        appointmentId: appt.id,
        bookingNumber: appt.bookingNumber,
        patientName: appt.patientName,
        status: 'Arrived',
        doctorName: appt.doctorName,
        arrivalTime: appt.arrivalTime
    });
}

/**
 * Get the current consulting number for a doctor
 */
function getCurrentlyConsultingNumber(doctorName) {
    const inConsult = appointments.find(a =>
        a.doctorName === doctorName && a.status === 'In Consult'
    );
    if (inConsult) {
        return parseInt(inConsult.bookingNumber, 10) || 0;
    }

    // Find the highest booking number that has been Done
    const doneAppointments = appointments
        .filter(a => a.doctorName === doctorName && a.status === 'Done')
        .map(a => parseInt(a.bookingNumber, 10) || 0);

    return doneAppointments.length > 0 ? Math.max(...doneAppointments) : 0;
}

/**
 * Start consultation (from Arrived or Investigation)
 */
function startConsultation(appointmentId) {
    const index = appointments.findIndex(a => a.id === appointmentId);
    if (index === -1) return;

    const appt = appointments[index];
    appt.status = 'In Consult';
    appt.consultStartTime = toLocalISOString(new Date());
    saveAppointmentsToStorage();
    renderAppointmentTable();
    updateQueueSummary();
    showNotification('Consultation started');

    // Broadcast to TV display
    sendQueueEvent('consultation_started', {
        appointmentId: appt.id,
        bookingNumber: appt.bookingNumber,
        patientName: appt.patientName,
        status: 'In Consult',
        doctorName: appt.doctorName
    });
}

/**
 * Show investigation decision dialog
 */
function showInvestigationDecisionDialog(appointmentId) {
    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    currentConsultingAppointment = appointmentId;
    elements.consultPatientName.textContent = appt.patientName;
    elements.consultPatientAge.textContent = appt.age || '-';
    elements.consultPatientSex.textContent = appt.sex || '-';
    elements.consultBookingNumber.textContent = appt.bookingNumber !== null ? appt.bookingNumber : '-';

    // Show investigation decision UI
    elements.investigationDialog.querySelector('.current-patient-info').classList.remove('hidden');
    elements.investigationDialog.querySelector('.investigation-question').classList.remove('hidden');
    elements.investigationDialog.querySelector('.investigation-dialog-actions').classList.remove('hidden');

    // Hide patient selection section
    elements.patientSelectionSection.classList.add('hidden');

    elements.investigationDialog.classList.remove('hidden');
}

/**
 * Close investigation dialog
 */
function closeInvestigationDialog() {
    elements.investigationDialog.classList.add('hidden');
    currentConsultingAppointment = null;
    
    // Reset dialog state
    elements.investigationDialog.querySelector('.current-patient-info').classList.remove('hidden');
    elements.investigationDialog.querySelector('.investigation-question').classList.remove('hidden');
    elements.investigationDialog.querySelector('.investigation-dialog-actions').classList.remove('hidden');
    elements.patientSelectionSection.classList.add('hidden');
}

/**
 * Handle YES - patient needs investigation
 */
function handleInvestigationYes() {
    if (!currentConsultingAppointment) return;

    const index = appointments.findIndex(a => a.id === currentConsultingAppointment);
    if (index === -1) {
        closeInvestigationDialog();
        return;
    }

    // Mark the patient as investigated
    appointments[index].status = 'Investigation';
    appointments[index].investigationOrderedTime = toLocalISOString(new Date());
    saveAppointmentsToStorage();

    // Track this patient as "just investigated" so they're excluded from next candidate list
    lastInvestigatedPatientId = currentConsultingAppointment;

    // Now show patient selection section for next patient
    elements.patientSelectionSection.classList.remove('hidden');
    elements.investigationDialog.querySelector('.current-patient-info').classList.add('hidden');
    elements.investigationDialog.querySelector('.investigation-question').classList.add('hidden');
    elements.investigationDialog.querySelector('.investigation-dialog-actions').classList.add('hidden');

    // Build candidate list for next patient (will exclude the just-investigated patient)
    const today = toLocalDateString(new Date());
    const todayAppointments = appointments.filter(a =>
        a.appointmentTime.startsWith(today) && a.doctorName === TARGET_DOCTOR_NAME
    );
    buildCandidateList(todayAppointments);

    renderAppointmentTable();
    updateQueueSummary();
    showNotification('Patient marked for investigation - select next patient');
}

/**
 * Reduce penalty turns for all waiting patients when a consultation is completed
 * Each patient with penalty loses 1 turn (minimum 0)
 * @returns {Object} Object containing reduced flag and patients info
 */
function reducePenaltyTurns() {
    const today = toLocalDateString(new Date());
    const waitingStatuses = ['Arrived', 'Investigation', 'Booked', 'Noted'];
    let penaltyReduced = false;
    const reducedPatients = [];

    appointments.forEach(appt => {
        const apptDate = appt.appointmentTime ? appt.appointmentTime.split('T')[0] : '';
        if (apptDate === today && waitingStatuses.includes(appt.status) && appt.penaltyTurns > 0) {
            const oldPenalty = appt.penaltyTurns;
            appt.penaltyTurns--;
            penaltyReduced = true;
            reducedPatients.push({
                name: appt.patientName,
                bookingNumber: appt.bookingNumber,
                oldPenalty: oldPenalty,
                newPenalty: appt.penaltyTurns
            });
        }
    });

    if (penaltyReduced) {
        saveAppointmentsToStorage();
    }

    return { reduced: penaltyReduced, patients: reducedPatients };
}

/**
 * Handle NO - patient does not need investigation
 */
function handleInvestigationNo() {
    if (!currentConsultingAppointment) return;

    const index = appointments.findIndex(a => a.id === currentConsultingAppointment);
    if (index === -1) {
        closeInvestigationDialog();
        return;
    }

    const appt = appointments[index];
    appt.status = 'Done';
    appt.completedTime = toLocalISOString(new Date());

    // Reduce penalty turns for all waiting patients
    const penaltyResult = reducePenaltyTurns();

    saveAppointmentsToStorage();

    // Now show patient selection section for next patient
    elements.patientSelectionSection.classList.remove('hidden');
    elements.investigationDialog.querySelector('.current-patient-info').classList.add('hidden');
    elements.investigationDialog.querySelector('.investigation-question').classList.add('hidden');
    elements.investigationDialog.querySelector('.investigation-dialog-actions').classList.add('hidden');

    // Build candidate list for next patient
    const today = toLocalDateString(new Date());
    const todayAppointments = appointments.filter(a =>
        a.appointmentTime.startsWith(today) && a.doctorName === TARGET_DOCTOR_NAME
    );
    buildCandidateList(todayAppointments);

    renderAppointmentTable();
    updateQueueSummary();

    // Show notification with penalty reduction info
    if (penaltyResult.reduced) {
        const patientList = penaltyResult.patients
            .map(p => `#${p.bookingNumber} ${p.name} (${p.oldPenalty}→${p.newPenalty})`)
            .join(', ');
        showNotification(`Consultation completed. Penalty reduced: ${patientList}`, 'success');
    } else {
        showNotification('Consultation completed - select next patient');
    }

    // Broadcast to TV display
    sendQueueEvent('consultation_finished', {
        appointmentId: appt.id,
        bookingNumber: appt.bookingNumber,
        patientName: appt.patientName,
        status: 'Done',
        doctorName: appt.doctorName
    });
}

/**
 * Sort appointments for queue display with penalty logic
 */
function sortAppointmentsForQueue(appts) {
    return [...appts].sort((a, b) => {
        // Priority 1: Status priority
        const aPriority = STATUS_PRIORITY[a.status] || 99;
        const bPriority = STATUS_PRIORITY[b.status] || 99;

        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }

        // Priority 2: Penalty (no penalty first, penalty last)
        const aHasPenalty = a.penaltyTurns && a.penaltyTurns > 0;
        const bHasPenalty = b.penaltyTurns && b.penaltyTurns > 0;

        if (aHasPenalty && !bHasPenalty) return 1;
        if (!aHasPenalty && bHasPenalty) return -1;

        // Priority 3: Booking number in ascending order (0, 1, 2, 3, ...)
        // null/undefined booking numbers go to the end
        if (a.bookingNumber === null || a.bookingNumber === undefined) return 1;
        if (b.bookingNumber === null || b.bookingNumber === undefined) return -1;

        // Sort by booking number ascending (0 comes before 1, 2, 3, etc.)
        const aNum = parseInt(a.bookingNumber, 10);
        const bNum = parseInt(b.bookingNumber, 10);
        return aNum - bNum;
    });
}

function sortAppointments(field) {
    if (appointmentCurrentSort.field === field) {
        appointmentCurrentSort.direction = appointmentCurrentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        appointmentCurrentSort.field = field;
        appointmentCurrentSort.direction = 'asc';
    }

    document.querySelectorAll('#appointmentTable th[data-sort]').forEach(th => th.classList.remove('sorted'));
    const currentTh = document.querySelector(`#appointmentTable th[data-sort="${field}"]`);
    if (currentTh) currentTh.classList.add('sorted');

    let sorted = [...appointments];
    sorted.sort((a, b) => {
        let aVal = a[field] !== null && a[field] !== undefined ? a[field] : '';
        let bVal = b[field] !== null && b[field] !== undefined ? b[field] : '';

        if (field === 'bookingNumber') {
            // For booking number sorting, use multi-level sort:
            // 1) Status priority, 2) Penalty, 3) Booking number
            const aPriority = STATUS_PRIORITY[a.status] || 99;
            const bPriority = STATUS_PRIORITY[b.status] || 99;
            
            if (aPriority !== bPriority) {
                return appointmentCurrentSort.direction === 'asc' ? aPriority - bPriority : bPriority - aPriority;
            }
            
            // Same status: check penalty
            const aHasPenalty = a.penaltyTurns && a.penaltyTurns > 0;
            const bHasPenalty = b.penaltyTurns && b.penaltyTurns > 0;
            
            if (aHasPenalty !== bHasPenalty) {
                return appointmentCurrentSort.direction === 'asc' 
                    ? (aHasPenalty ? 1 : -1) 
                    : (aHasPenalty ? -1 : 1);
            }
            
            // Same penalty status: sort by booking number
            aVal = aVal === null || aVal === 0 ? 999 : parseInt(aVal, 10);
            bVal = bVal === null || bVal === 0 ? 999 : parseInt(bVal, 10);
        } else if (field === 'appointmentTime') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        }

        if (aVal < bVal) return appointmentCurrentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return appointmentCurrentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderAppointmentTable(sorted);
}

function searchAppointments(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const dateFilter = elements.appointmentDateFilter.value;
    const doctorFilter = elements.appointmentDoctorFilter.value;

    // If no filters are active, show all appointments
    if (!term && !dateFilter && !doctorFilter) {
        renderAppointmentTable();
        elements.appointmentNoResultsMessage.classList.add('hidden');
        return;
    }

    let filtered = appointments;

    // Filter by search term
    if (term) {
        filtered = filtered.filter(a =>
            a.patientName.toLowerCase().includes(term) ||
            a.doctorName.toLowerCase().includes(term) ||
            (a.phone && a.phone.includes(term))
        );
    }

    // Filter by date
    if (dateFilter) {
        filtered = filtered.filter(a => a.appointmentTime && a.appointmentTime.startsWith(dateFilter));
    }

    // Filter by doctor
    if (doctorFilter) {
        filtered = filtered.filter(a => a.doctorName === doctorFilter);
    }

    renderAppointmentTable(filtered);
    elements.appointmentNoResultsMessage.classList.toggle('hidden', filtered.length > 0);
}

function updateQueueSummary() {
    const today = toLocalDateString(new Date());
    const todayAppointments = appointments.filter(a => a.appointmentTime.startsWith(today));

    const waiting = todayAppointments.filter(a =>
        ['Noted', 'Booked', 'Arrived', 'Investigation'].includes(a.status)
    ).length;

    const inConsult = todayAppointments.filter(a =>
        a.status === 'In Consult'
    ).length;

    const done = todayAppointments.filter(a =>
        a.status === 'Done'
    ).length;

    // Find next patient - ONLY for Dr. Soe Chan Myae
    const doctorAppointments = todayAppointments.filter(a =>
        a.doctorName === TARGET_DOCTOR_NAME
    );

    const queueSorted = sortAppointmentsForQueue(
        doctorAppointments.filter(a =>
            ['Arrived', 'Investigation', 'Booked', 'Noted'].includes(a.status)
        )
    );

    const nextPatient = queueSorted[0];

    // Find current consulting patient
    const currentConsult = doctorAppointments.find(a => a.status === 'In Consult');

    // Check if next patient has penalty
    let nextPatientDisplay = '-';
    if (nextPatient) {
        const penaltyInfo = nextPatient.penaltyTurns > 0 ? ` ⚠️` : '';
        nextPatientDisplay = `${nextPatient.patientName} (#${nextPatient.bookingNumber || '-'})${penaltyInfo}`;
    }

    // Display current consulting patient
    let currentConsultDisplay = '-';
    if (currentConsult) {
        currentConsultDisplay = `${currentConsult.patientName} (#${currentConsult.bookingNumber || '-'})`;
    }

    elements.waitingCount.textContent = waiting;
    elements.inConsultCount.textContent = inConsult;
    elements.doneCount.textContent = done;
    elements.nextPatientName.textContent = nextPatientDisplay;
    elements.currentConsultName.textContent = currentConsultDisplay;
}

/**
 * Handle Next Patient button click
 * Automates the queue flow for Dr. Soe Chan Myae's patients
 * 1. If someone is "In Consult", show investigation dialog
 * 2. When patient is sent for investigation, they are temporarily skipped for next selection
 * 3. Show patient selection dialog with:
 *    - Investigation patients (excluding the one just sent from current consult)
 *    - Arrived patients without penalty
 *    - Arrived patients with penalty
 */
function handleNextPatient() {
    const today = toLocalDateString(new Date());
    const todayAppointments = appointments.filter(a =>
        a.appointmentTime.startsWith(today) && a.doctorName === TARGET_DOCTOR_NAME
    );

    // Step 1: Check if someone is currently "In Consult"
    const inConsult = todayAppointments.find(a => a.status === 'In Consult');

    if (inConsult) {
        // Someone is consulting - show investigation dialog
        showInvestigationDecisionDialog(inConsult.id);
        return;
    }

    // Step 2: No one is consulting - show patient selection dialog
    showPatientSelectionDialog();
}

/**
 * Show patient selection dialog for selecting next patient
 */
function showPatientSelectionDialog() {
    const today = toLocalDateString(new Date());
    const todayAppointments = appointments.filter(a =>
        a.appointmentTime.startsWith(today) && a.doctorName === TARGET_DOCTOR_NAME
    );

    // Show the investigation dialog with patient selection section
    elements.investigationDialog.classList.remove('hidden');
    
    // Hide the investigation decision UI
    elements.investigationDialog.querySelector('.current-patient-info').classList.add('hidden');
    elements.investigationDialog.querySelector('.investigation-question').classList.add('hidden');
    elements.investigationDialog.querySelector('.investigation-dialog-actions').classList.add('hidden');
    
    // Show patient selection section
    elements.patientSelectionSection.classList.remove('hidden');
    
    // Build sorted candidate list and show first candidate
    buildCandidateList(todayAppointments);
}

/**
 * Candidate list state for patient selection
 */
let patientCandidates = [];
let currentCandidateIndex = 0;
let lastInvestigatedPatientId = null; // Track patient who just went to investigation

/**
 * Build sorted candidate list for patient selection
 * Priority: Investigation > Arrived (no penalty) > Arrived (with penalty)
 * Note: Excludes the patient who JUST went to investigation from current consult
 * @param {Array} todayAppointments - Today's appointments for target doctor
 */
function buildCandidateList(todayAppointments) {
    patientCandidates = [];
    currentCandidateIndex = 0;

    // Investigation patients (highest priority) - EXCLUDE the one just investigated
    const investigationPatients = todayAppointments
        .filter(a => a.status === 'Investigation' && a.id !== lastInvestigatedPatientId)
        .sort((a, b) => {
            if (a.bookingNumber === null || a.bookingNumber === undefined) return 1;
            if (b.bookingNumber === null || b.bookingNumber === undefined) return -1;
            return parseInt(a.bookingNumber) - parseInt(b.bookingNumber);
        });

    // Arrived patients without penalty
    const arrivedNoPenalty = todayAppointments
        .filter(a =>
            a.status === 'Arrived' &&
            (!a.penaltyTurns || a.penaltyTurns <= 0)
        )
        .sort((a, b) => {
            if (a.bookingNumber === null || a.bookingNumber === undefined) return 1;
            if (b.bookingNumber === null || b.bookingNumber === undefined) return -1;
            return parseInt(a.bookingNumber) - parseInt(b.bookingNumber);
        });

    // Arrived patients with penalty (sorted by penalty count, then booking number)
    const arrivedWithPenalty = todayAppointments
        .filter(a =>
            a.status === 'Arrived' &&
            a.penaltyTurns && a.penaltyTurns > 0
        )
        .sort((a, b) => {
            if (a.penaltyTurns !== b.penaltyTurns) {
                return a.penaltyTurns - b.penaltyTurns;
            }
            if (a.bookingNumber === null || a.bookingNumber === undefined) return 1;
            if (b.bookingNumber === null || b.bookingNumber === undefined) return -1;
            return parseInt(a.bookingNumber) - parseInt(b.bookingNumber);
        });

    // Combine all candidates with category info
    investigationPatients.forEach(p => patientCandidates.push({ appointment: p, category: 'investigation' }));
    arrivedNoPenalty.forEach(p => patientCandidates.push({ appointment: p, category: 'arrived' }));
    arrivedWithPenalty.forEach(p => patientCandidates.push({ appointment: p, category: 'penalty' }));

    // Clear the "just investigated" flag after building the list
    lastInvestigatedPatientId = null;

    // Show first candidate or no patients message
    if (patientCandidates.length > 0) {
        showCandidate(0);
    } else {
        showNoPatientsMessage();
    }
}

/**
 * Show a specific candidate from the list
 * @param {number} index - Index of candidate to show
 */
function showCandidate(index) {
    if (index >= patientCandidates.length) {
        // No more candidates, show no patients message
        showNoPatientsMessage();
        return;
    }
    
    currentCandidateIndex = index;
    const candidate = patientCandidates[index];
    const patient = candidate.appointment;

    // Update patient card display
    const bookingNum = patient.bookingNumber !== null && patient.bookingNumber !== undefined ? patient.bookingNumber : '-';

    elements.nextPatientBooking.textContent = `#${bookingNum}`;
    elements.nextPatientName.textContent = patient.patientName;
    elements.selectedPatientName.textContent = patient.patientName;
    elements.nextPatientAge.textContent = patient.age || '-';
    elements.nextPatientSex.textContent = patient.sex || '-';
    elements.nextPatientPhone.textContent = patient.phone || '-';

    // Update category badge
    elements.nextPatientCategory.textContent =
        candidate.category === 'investigation' ? '🔬 Investigation' :
        candidate.category === 'penalty' ? '⚠️ Penalty' : '🙋 Arrived';
    elements.nextPatientCategory.className = 'patient-card-badge ' + candidate.category;

    // Show penalty info if applicable
    if (candidate.category === 'penalty') {
        elements.nextPatientPenaltyInfo.classList.remove('hidden');
        elements.nextPatientPenaltyText.textContent = `${patient.penaltyTurns} penalty turn${patient.penaltyTurns > 1 ? 's' : ''} remaining`;
    } else {
        elements.nextPatientPenaltyInfo.classList.add('hidden');
    }
    
    // Show patient card, hide no patients message
    elements.singlePatientDisplay.classList.remove('hidden');
    elements.noPatientsMessage.classList.add('hidden');
}

/**
 * Show no patients message
 */
function showNoPatientsMessage() {
    elements.singlePatientDisplay.classList.add('hidden');
    elements.noPatientsMessage.classList.remove('hidden');
}

/**
 * Call the next patient to consultation
 * If no one is currently in consultation, start consultation for this patient
 * If someone is already in consultation, queue this patient for next turn
 * @param {Object} patient - Patient appointment object
 */
function callNextPatient(patient) {
    if (!patient) return;

    const today = toLocalDateString(new Date());
    const todayAppointments = appointments.filter(a =>
        a.appointmentTime.startsWith(today) && a.doctorName === TARGET_DOCTOR_NAME
    );

    // Check if someone is currently in consultation
    const currentInConsult = todayAppointments.find(a => a.status === 'In Consult');

    if (!currentInConsult) {
        // No one is consulting - start consultation for this patient
        patient.status = 'In Consult';
        patient.consultStartTime = toLocalISOString(new Date());
        patient.penaltyTurns = 0; // Clear any penalty turns
        
        saveAppointmentsToStorage();
        renderAppointmentTable();
        updateQueueSummary();

        showNotification(`Calling patient #${patient.bookingNumber || '-'} ${patient.patientName} to consultation`, 'success');

        // Broadcast to TV display
        sendQueueEvent('consultation_started', {
            appointmentId: patient.id,
            bookingNumber: patient.bookingNumber,
            patientName: patient.patientName,
            status: 'In Consult',
            doctorName: patient.doctorName
        });
    } else {
        // Someone is already consulting - queue this patient for next turn
        // Set status to Arrived with 0 penalty turns (highest priority for next)
        patient.status = 'Arrived';
        patient.penaltyTurns = 0;
        
        saveAppointmentsToStorage();
        renderAppointmentTable();
        updateQueueSummary();

        showNotification(`Patient #${patient.bookingNumber || '-'} ${patient.patientName} queued for next turn`, 'info');

        // Broadcast to TV display
        sendQueueEvent('patient_queued', {
            appointmentId: patient.id,
            bookingNumber: patient.bookingNumber,
            patientName: patient.patientName,
            status: 'Arrived',
            doctorName: patient.doctorName
        });
    }

    // Close the dialog after calling/queuing patient
    closeInvestigationDialog();
}

/**
 * Skip current candidate and show next one
 */
function skipToNextCandidate() {
    if (patientCandidates.length === 0) return;
    
    const nextIndex = currentCandidateIndex + 1;
    if (nextIndex >= patientCandidates.length) {
        // No more candidates
        showNoPatientsMessage();
    } else {
        showCandidate(nextIndex);
    }
}

// ==================== INSTRUCTION MODULE ====================

/**
 * Render the Done/Postpone Patients table (patients needing instructions)
 */
function renderInstructionTableWithSaved() {
    const searchTerm = elements.instructionSearchInput.value.toLowerCase().trim();
    const doctorFilter = elements.instructionDoctorFilter.value;
    const sortFilter = elements.instructionSortFilter.value;

    console.log('[Instruction Filter] Doctor filter value:', JSON.stringify(doctorFilter));

    // Get ALL appointments with status "Done" or "Postpone"
    let allAppointments = appointments.filter(appt => {
        return appt.status === 'Done' || appt.status === 'Postpone';
    });

    console.log('[Instruction Filter] Total Done/Postpone appointments:', allAppointments.length);

    // Filter by search
    if (searchTerm) {
        allAppointments = allAppointments.filter(appt =>
            appt.patientName.toLowerCase().includes(searchTerm)
        );
    }

    // Filter by doctor
    if (doctorFilter) {
        console.log('[Instruction Filter] Applying doctor filter:', JSON.stringify(doctorFilter));
        const beforeFilter = allAppointments.length;
        allAppointments = allAppointments.filter(appt => {
            const match = appt.doctorName === doctorFilter;
            if (!match) {
                console.log('[Instruction Filter] No match:', JSON.stringify(appt.doctorName), '!==', JSON.stringify(doctorFilter));
            }
            return match;
        });
        console.log('[Instruction Filter] After filter:', allAppointments.length, '(was', beforeFilter, ')');
    }

    // Sort by appointment date
    allAppointments.sort((a, b) => {
        const aTime = a.appointmentTime ? new Date(a.appointmentTime).getTime() : 0;
        const bTime = b.appointmentTime ? new Date(b.appointmentTime).getTime() : 0;
        return sortFilter === 'oldest' ? aTime - bTime : bTime - aTime;
    });

    elements.donePatientCount.textContent = `${allAppointments.length} patient${allAppointments.length !== 1 ? 's' : ''}`;

    if (allAppointments.length === 0) {
        elements.instructionTableBody.innerHTML = '';
        elements.instructionEmptyMessage.classList.remove('hidden');
        elements.instructionTable.classList.add('hidden');
        return;
    }

    elements.instructionEmptyMessage.classList.add('hidden');
    elements.instructionTable.classList.remove('hidden');

    elements.instructionTableBody.innerHTML = allAppointments.map(appt => {
        const appointmentInstructions = instructions.filter(inst => inst.appointmentId === appt.id);
        const hasInstructions = appointmentInstructions.length > 0;
        
        // Build instruction summary display
        let instructionSummaryHtml = '';
        if (hasInstructions) {
            instructionSummaryHtml = appointmentInstructions.map((inst, idx) => {
                const doctorLabel = inst.followUpDoctor || '-';
                const otherType = inst.otherInstruction || '';
                
                // Determine if date/duration should be shown
                // Hide for: PRN, Transfer to Hospital, After Results
                const shouldHideDate = otherType === 'PRN' || 
                                       otherType === 'Transfer to Hospital' || 
                                       otherType === 'After Results';
                
                let dateLabel = '-';
                if (!shouldHideDate) {
                    if (inst.nextAppointmentDate) {
                        dateLabel = inst.nextAppointmentDate;
                    } else if (inst.returnDuration && inst.returnUnit) {
                        dateLabel = `${inst.returnDuration} ${inst.returnUnit}`;
                    }
                }
                
                const typeLabel = otherType ? ` (${otherType})` : '';
                
                // Determine if tests should be shown
                // Show for: After Results, Do Tests Before
                // Hide for: PRN, Transfer to Hospital, or no other type selected
                const shouldShowTests = (otherType === 'After Results' || otherType === 'Do Tests Before') && 
                                        inst.selectedTests && inst.selectedTests.length > 0;
                const testsLabel = shouldShowTests ? ` [${inst.selectedTests.join(', ')}]` : '';

                return `
                    <div style="margin: 4px 0; padding: 6px 8px; background: #f9fafb; border-radius: 4px; font-size: 0.8rem; border-left: 3px solid #3b82f6;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${idx + 1}.</strong> ${escapeHtml(doctorLabel)}${typeLabel}
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="editInstruction('${inst.id}')" style="padding: 2px 8px; font-size: 0.75rem;" title="Edit this instruction">
                                ✏️ Edit
                            </button>
                        </div>
                        <div style="color: #6b7280; margin-top: 3px;">
                            📅 ${dateLabel}${testsLabel}
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        let buttonHtml;
        if (hasInstructions) {
            buttonHtml = `
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="openInstructionForm('${appt.id}')" title="Add another instruction">
                        + Add Another Instruction
                    </button>
                </div>
            `;
        } else {
            buttonHtml = `<button type="button" class="btn btn-primary btn-sm" onclick="openInstructionForm('${appt.id}')">📝 Add Instruction</button>`;
        }

        return `
            <tr data-id="${appt.id}">
                <td>${escapeHtml(appt.patientName)}</td>
                <td>${escapeHtml(appt.age)}</td>
                <td>${escapeHtml(appt.doctorName)}</td>
                <td>${appt.appointmentTime ? new Date(appt.appointmentTime).toLocaleDateString() : '-'}</td>
                <td>${appt.bookingNumber !== null ? appt.bookingNumber : '-'}</td>
                <td>
                    ${instructionSummaryHtml}
                    ${buttonHtml}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Open instruction form for an appointment
 */
function openInstructionForm(appointmentId) {
    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) {
        showNotification('Appointment not found', 'error');
        return;
    }

    // Check if instruction already exists
    const existingInstructions = instructions.filter(inst => inst.appointmentId === appointmentId);
    const instructionCount = existingInstructions.length;
    
    // Always open new instruction form (allow multiple instructions per appointment)
    elements.instructAppointmentId.value = appointmentId;
    elements.instructPatientId.value = appt.patientId || '';
    elements.instructPatientName.value = appt.patientName || '';
    elements.instructPatientAge.value = appt.age || '-';
    elements.instructDoctorName.value = appt.doctorName || '';

    // Show instruction count if exists
    const formTitle = elements.instructionFormPanel.querySelector('.slide-panel-header h3');
    if (formTitle && instructionCount > 0) {
        formTitle.textContent = `Add Instruction (${instructionCount} existing)`;
    } else if (formTitle) {
        formTitle.textContent = 'Add Doctor Instruction';
    }

    // Format appointment date with proper error handling
    let appointmentDateDisplay = '-';
    if (appt.appointmentTime) {
        try {
            const apptDate = new Date(appt.appointmentTime);
            if (!isNaN(apptDate.getTime())) {
                appointmentDateDisplay = apptDate.toLocaleDateString();
            }
        } catch (e) {
            console.warn('Error parsing appointment date in openInstructionForm:', e);
        }
    }
    elements.instructAppointmentDate.value = appointmentDateDisplay;
    
    // Get booking number with proper fallback
    const bookingNum = (appt.bookingNumber !== null && appt.bookingNumber !== undefined)
        ? appt.bookingNumber
        : ((appt.booking_number !== null && appt.booking_number !== undefined) ? appt.booking_number : '-');
    elements.instructBookingNumber.value = bookingNum;

    // Reset form fields
    elements.instructGeneralInstruction.value = '';
    elements.instructDuration.value = '';
    elements.instructDurationUnit.value = 'Days';
    elements.instructNextAppointmentDate.value = '';
    elements.instructNextDoctor.value = '';
    elements.instructOtherType.value = '';
    elements.instructTransferHospital.value = '';
    elements.instructCustomTest.value = '';
    elements.customTestGroup.classList.add('hidden');

    // Reset disabled state of duration and appointment date fields
    setDurationFieldsDisabled(false);
    setNextAppointmentDateDisabled(false);

    // Populate doctor datalist
    elements.doctorDatalist.innerHTML = '';
    doctors.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.name;
        elements.doctorDatalist.appendChild(option);
    });

    // Populate custom test datalist with saved custom tests
    const allTests = instructions.flatMap(i => i.selectedTests || []);
    const predefinedTests = ['Blood Test', 'C&S Results', 'USG', 'Echo', 'ECG', 'Xray', 'CT', 'MRI', 'Other'];
    const customTests = [...new Set(allTests.filter(t => !predefinedTests.includes(t)))];
    elements.customTestDatalist.innerHTML = '';
    customTests.forEach(test => {
        const option = document.createElement('option');
        option.value = test;
        elements.customTestDatalist.appendChild(option);
    });

    // Remove edit ID if exists
    elements.instructAppointmentId.removeAttribute('data-edit-id');

    // Hide delete button when adding new instruction
    elements.instructDeleteBtn.classList.add('hidden');

    // Toggle test selection visibility
    toggleTestSelection();

    // Show slide panel
    elements.instructionFormPanel.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Toggle test selection and transfer hospital visibility
 */
function toggleTestSelection() {
    const otherType = elements.instructOtherType.value;

    // Show/hide transfer hospital input
    if (otherType === 'Transfer to Hospital') {
        elements.transferHospitalGroup.classList.remove('hidden');
        elements.testSelectionGroup.classList.add('hidden');

        // Populate hospital datalist
        elements.hospitalDatalist.innerHTML = '';
        hospitals.forEach(hosp => {
            const option = document.createElement('option');
            option.value = hosp;
            elements.hospitalDatalist.appendChild(option);
        });

        // Disable Return Visit Duration and Next Appointment Date
        setDurationFieldsDisabled(true);
        setNextAppointmentDateDisabled(true);
    } else if (otherType === 'After Results' || otherType === 'Do Tests Before') {
        elements.transferHospitalGroup.classList.add('hidden');
        elements.testSelectionGroup.classList.remove('hidden');

        // After Results: disable duration and next appointment date
        // Do Tests Before: keep them enabled
        const shouldDisable = otherType === 'After Results';
        setDurationFieldsDisabled(shouldDisable);
        setNextAppointmentDateDisabled(shouldDisable);
    } else if (otherType === 'PRN') {
        // PRN: disable duration and next appointment date
        elements.transferHospitalGroup.classList.add('hidden');
        elements.testSelectionGroup.classList.add('hidden');
        setDurationFieldsDisabled(true);
        setNextAppointmentDateDisabled(true);
    } else {
        elements.transferHospitalGroup.classList.add('hidden');
        elements.testSelectionGroup.classList.add('hidden');
        setDurationFieldsDisabled(false);
        setNextAppointmentDateDisabled(false);
    }
}

/**
 * Enable/disable Return Visit Duration fields
 */
function setDurationFieldsDisabled(disabled) {
    elements.instructDuration.disabled = disabled;
    elements.instructDurationUnit.disabled = disabled;
    
    // Add/remove disabled class to parent groups for visual styling
    const durationParentGroup = elements.instructDuration.closest('.instruction-form-group');
    const durationUnitParentGroup = elements.instructDurationUnit.closest('.instruction-form-group');
    if (durationParentGroup) {
        durationParentGroup.classList.toggle('fields-disabled', disabled);
    }
    if (durationUnitParentGroup) {
        durationUnitParentGroup.classList.toggle('fields-disabled', disabled);
    }
    
    // Also disable quick duration buttons
    const quickDurationBtns = document.querySelectorAll('.quick-duration-btn');
    quickDurationBtns.forEach(btn => {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.5' : '';
        btn.style.pointerEvents = disabled ? 'none' : '';
    });
}

/**
 * Enable/disable Next Appointment Date field
 */
function setNextAppointmentDateDisabled(disabled) {
    elements.instructNextAppointmentDate.disabled = disabled;
    
    // Add/remove disabled class to parent group for visual styling
    const parentGroup = elements.instructNextAppointmentDate.closest('.instruction-form-group');
    if (parentGroup) {
        parentGroup.classList.toggle('fields-disabled', disabled);
    }
}

/**
 * Get selected tests
 */
function getSelectedTests() {
    const selected = [];
    elements.testCheckboxes.forEach(cb => {
        if (cb.checked) {
            selected.push(cb.value);
        }
    });
    // Add custom test if entered
    const customTest = elements.instructCustomTest.value.trim();
    if (customTest && !selected.includes('Other')) {
        selected.push(customTest);
    } else if (customTest && selected.includes('Other')) {
        // Replace 'Other' with actual custom test name
        const idx = selected.indexOf('Other');
        selected[idx] = customTest;
    }
    return selected;
}

/**
 * Set selected tests
 */
function setSelectedTests(tests) {
    if (!tests || !Array.isArray(tests)) {
        elements.testCheckboxes.forEach(cb => cb.checked = false);
        elements.customTestGroup.classList.add('hidden');
        elements.instructCustomTest.value = '';
        return;
    }
    
    elements.testCheckboxes.forEach(cb => {
        cb.checked = tests.includes(cb.value);
    });
    
    // Check if there's a custom test (not in predefined list)
    const predefinedTests = ['Blood Test', 'C&S Results', 'USG', 'Echo', 'ECG', 'Xray', 'CT', 'MRI', 'Other'];
    const customTests = tests.filter(t => !predefinedTests.includes(t));
    
    if (customTests.length > 0) {
        elements.instructCustomTest.value = customTests[0];
        elements.customTestGroup.classList.remove('hidden');
    } else {
        elements.instructCustomTest.value = '';
        elements.customTestGroup.classList.add('hidden');
    }
}

/**
 * Edit instruction
 */
function editInstruction(instructionId) {
    const inst = instructions.find(i => i.id === instructionId);
    if (!inst) {
        showNotification('Instruction not found', 'error');
        return;
    }

    // Load data into form
    const appt = appointments.find(a =>
        a.id === inst.appointmentId || a.appointment_id === inst.appointmentId ||
        a.id === inst.appointment_id || a.appointment_id === inst.appointment_id
    );
    if (!appt) {
        showNotification('Appointment not found for this instruction', 'error');
        return;
    }

    elements.instructAppointmentId.value = inst.appointmentId || inst.appointment_id || '';
    elements.instructPatientId.value = inst.patientId || inst.patient_id || '';
    elements.instructPatientName.value = inst.patientName || inst.patient_name || '';
    elements.instructPatientAge.value = inst.age || appt.age || '-';
    elements.instructDoctorName.value = inst.doctorName || inst.doctor_name || '';
    
    // Format appointment date - try instruction data first, then appointment data
    let appointmentDateDisplay = '-';
    const dateSource = inst.appointmentDate || appt.appointmentTime;
    if (dateSource) {
        try {
            const apptDate = new Date(dateSource);
            if (!isNaN(apptDate.getTime())) {
                appointmentDateDisplay = apptDate.toLocaleDateString();
            }
        } catch (e) {
            console.warn('Error parsing appointment date in editInstruction:', e);
        }
    }
    elements.instructAppointmentDate.value = appointmentDateDisplay;
    
    // Get booking number - try instruction first, then appointment
    const bookingNum = (inst.bookingNumber !== null && inst.bookingNumber !== undefined) 
        ? inst.bookingNumber 
        : ((inst.booking_number !== null && inst.booking_number !== undefined) 
            ? inst.booking_number 
            : ((appt.bookingNumber !== null && appt.bookingNumber !== undefined) ? appt.bookingNumber : '-'));
    elements.instructBookingNumber.value = bookingNum;
    elements.instructGeneralInstruction.value = inst.generalInstruction || '';
    elements.instructDuration.value = inst.returnDuration || '';
    elements.instructDurationUnit.value = inst.returnUnit || 'Days';
    elements.instructNextAppointmentDate.value = inst.nextAppointmentDate || '';
    elements.instructNextDoctor.value = inst.followUpDoctor || '';
    elements.instructOtherType.value = inst.otherInstruction || '';
    elements.instructTransferHospital.value = inst.transferHospital || '';
    
    // Set selected tests
    setSelectedTests(inst.selectedTests || []);

    // Populate doctor datalist
    elements.doctorDatalist.innerHTML = '';
    doctors.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.name;
        elements.doctorDatalist.appendChild(option);
    });

    // Store original ID for update
    elements.instructAppointmentId.setAttribute('data-edit-id', instructionId);

    // Show delete button in edit mode
    elements.instructDeleteBtn.classList.remove('hidden');

    // Toggle test selection visibility
    toggleTestSelection();

    // Show slide panel
    elements.instructionFormPanel.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Close instruction form panel
 */
function closeInstructionFormPanel() {
    elements.instructionFormPanel.classList.add('hidden');
    document.body.style.overflow = '';
}

// ==================== APPOINTMENT CRUD ====================
/**
 * Position an autocomplete dropdown below its input
 */
function positionAutocomplete(dropdown, wrapper) {
    if (!dropdown || !wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
    dropdown.style.zIndex = '1500';
}

function showPatientAutocomplete(searchTerm) {
    if (!searchTerm || searchTerm.length < 1) {
        elements.patientAutocomplete.classList.add('hidden');
        return;
    }

    const term = searchTerm.toLowerCase();
    const matches = patients.filter(p => p.name.toLowerCase().includes(term)).slice(0, 10);

    if (matches.length === 0) {
        elements.patientAutocomplete.innerHTML = `
            <div class="autocomplete-item" onclick="openPatientFormFromAutocomplete()">
                <div class="autocomplete-item-primary">No patient found</div>
                <div class="autocomplete-item-secondary">Click to register new patient</div>
            </div>
        `;
        elements.patientAutocomplete.classList.remove('hidden');
        return;
    }

    elements.patientAutocomplete.innerHTML = matches.map((p, idx) => `
        <div class="autocomplete-item" data-index="${idx}" data-id="${p.id}">
            <div class="autocomplete-item-primary">${escapeHtml(p.name)}</div>
            <div class="autocomplete-item-secondary">${escapeHtml(p.age)} — ${escapeHtml(p.phone)} — ${escapeHtml(p.address)}</div>
        </div>
    `).join('');

    elements.patientAutocomplete.classList.remove('hidden');
    positionAutocomplete(elements.patientAutocomplete, elements.patientAutocomplete.parentElement);

    // Add click handlers
    elements.patientAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            if (id) {
                selectPatient(id);
            }
        });
    });
}

function selectPatient(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;

    elements.appointmentPatient.value = patient.name;
    elements.appointmentPatientId.value = patient.id;
    elements.displayPatientPhone.value = patient.phone;
    elements.displayPatientAge.value = patient.age;
    elements.displayPatientSex.value = patient.sex || '-';
    elements.displayPatientFoc.value = patient.isFoc ? '💝 FOC' : '-';
    elements.patientInfoDisplay.style.display = 'grid';
    elements.patientAutocomplete.classList.add('hidden');

    // Auto-select FOC booking type for FOC patients
    if (patient.isFoc) {
        elements.appointmentBookingType.value = 'FOC';
        // Recalculate booking number for FOC
        const doctorName = elements.appointmentDoctor.value.trim();
        const dateTime = elements.appointmentDateTime.value;
        if (doctorName && dateTime) {
            const appointmentDate = dateTime.split('T')[0];
            const bookingNumber = calculateBookingNumber(doctorName, 'FOC', appointmentDate);
            elements.appointmentBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
        }
        // Show FOC indicator
        elements.patientInfoDisplay.style.backgroundColor = '#d1fae5';
        elements.patientInfoDisplay.style.borderColor = '#6ee7b7';
    } else {
        elements.patientInfoDisplay.style.backgroundColor = '#f0fdf4';
        elements.patientInfoDisplay.style.borderColor = '#bbf7d0';
    }

    // Check for pending lab results immediately when patient is selected
    console.log('selectPatient: about to check lab results for', patient.id);
    displayPendingLabResults(patient.id);

    elements.appointmentDoctor.focus();
}

function showDoctorAutocomplete(searchTerm) {
    if (!searchTerm || searchTerm.length < 1) {
        elements.doctorAutocomplete.classList.add('hidden');
        return;
    }

    const term = searchTerm.toLowerCase();
    const matches = doctors.filter(d => d.name.toLowerCase().includes(term)).slice(0, 10);

    if (matches.length === 0) {
        elements.doctorAutocomplete.innerHTML = `
            <div class="autocomplete-item">
                <div class="autocomplete-item-primary">No doctor found</div>
            </div>
        `;
        elements.doctorAutocomplete.classList.remove('hidden');
        return;
    }

    elements.doctorAutocomplete.innerHTML = matches.map((d, idx) => `
        <div class="autocomplete-item" data-index="${idx}" data-name="${escapeHtml(d.name)}">
            <div class="autocomplete-item-primary">${escapeHtml(d.name)}</div>
            <div class="autocomplete-item-secondary">${escapeHtml(d.speciality || '-')} — ${escapeHtml(d.hospital || '-')}</div>
        </div>
    `).join('');

    elements.doctorAutocomplete.classList.remove('hidden');
    positionAutocomplete(elements.doctorAutocomplete, elements.doctorAutocomplete.parentElement);

    // Add click handlers
    elements.doctorAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.name;
            if (name) {
                elements.appointmentDoctor.value = name;
                elements.appointmentDoctorId.value = name;
                elements.doctorAutocomplete.classList.add('hidden');
                elements.appointmentDateTime.focus();
            }
        });
    });
}

function openPatientFormFromAutocomplete() {
    elements.patientAutocomplete.classList.add('hidden');
    openPatientFormModal();
}

function loadAppointmentToForm(appointmentId) {
    const index = appointments.findIndex(a => a.id === appointmentId);
    if (index === -1) return;
    const a = appointments[index];

    elements.appointmentEditIndex.value = index;
    elements.appointmentId.value = a.id;
    elements.appointmentPatient.value = a.patientName;
    elements.appointmentPatientId.value = a.patientId || '';
    elements.displayPatientPhone.value = a.phone || '';
    elements.displayPatientAge.value = a.age || '';
    
    // Get sex from appointment or patient record
    if (a.sex) {
        elements.displayPatientSex.value = a.sex;
    } else if (a.patientId) {
        const patient = patients.find(p => p.id === a.patientId);
        elements.displayPatientSex.value = patient ? (patient.sex || '-') : '-';
    } else {
        elements.displayPatientSex.value = '-';
    }

    elements.patientInfoDisplay.style.display = 'grid';
    elements.appointmentDoctor.value = a.doctorName;
    elements.appointmentDoctorId.value = a.doctorId || '';
    elements.appointmentDateTime.value = a.appointmentTime ? a.appointmentTime.slice(0, 16) : '';
    elements.appointmentBookingType.value = a.bookingType;
    elements.appointmentBookingNumber.value = a.bookingNumber !== null ? a.bookingNumber : '';
    elements.appointmentStatus.value = a.status;
    elements.appointmentNotes.value = a.notes || '';

    // Show FOC indicator if patient is FOC
    const patient = patients.find(p => p.id === a.patientId);
    if (patient && patient.isFoc) {
        elements.displayPatientFoc.value = '💝 FOC';
        elements.patientInfoDisplay.style.backgroundColor = '#d1fae5';
        elements.patientInfoDisplay.style.borderColor = '#6ee7b7';
    } else {
        elements.displayPatientFoc.value = '-';
        elements.patientInfoDisplay.style.backgroundColor = '#f0fdf4';
        elements.patientInfoDisplay.style.borderColor = '#bbf7d0';
    }

    // Check for pending lab results
    displayPendingLabResults(a.patientId);

    appointmentIsEditing = true;
    elements.appointmentFormTitle.textContent = 'Edit Appointment';
    elements.appointmentSaveBtnText.textContent = 'Update Appointment';
    elements.appointmentDeleteBtn.style.display = 'inline-block';

    openAppointmentFormModal();
}

function saveAppointment(e) {
    e.preventDefault();

    const patientName = elements.appointmentPatient.value.trim();
    const doctorName = elements.appointmentDoctor.value.trim();
    const dateTime = elements.appointmentDateTime.value;
    const bookingType = elements.appointmentBookingType.value;
    const manualStatus = elements.appointmentStatus.value;

    // Only auto-determine status for NEW appointments with Dr. Soe Chan Myae
    // For existing appointments, preserve the manually selected status
    let status;
    if (!appointmentIsEditing && doctorName === TARGET_DOCTOR_NAME) {
        // For new Dr. Soe Chan Myae appointments, auto-determine based on date
        status = determineAppointmentStatus(doctorName, dateTime);
    } else {
        // For existing appointments or other doctors, use the manually selected status
        status = manualStatus || 'Noted';
    }

    if (!patientName) { showNotification('Patient name is required', 'error'); elements.appointmentPatient.focus(); return; }
    if (!doctorName) { showNotification('Doctor name is required', 'error'); elements.appointmentDoctor.focus(); return; }
    if (!dateTime) { showNotification('Date & Time is required', 'error'); elements.appointmentDateTime.focus(); return; }
    if (!bookingType) { showNotification('Booking type is required', 'error'); elements.appointmentBookingType.focus(); return; }

    // Calculate booking numbers for both Regular and VIP
    const appointmentDate = dateTime.split('T')[0];
    
    // If VIP booking for target doctor, check if we should show slot selection dialog
    if (bookingType === 'VIP' && doctorName === TARGET_DOCTOR_NAME && !appointmentIsEditing) {
        // Calculate what regular number would be
        const regularNumber = calculateBookingNumber(doctorName, 'Regular', appointmentDate);
        
        // Get available VIP slots that are less than regular number
        const availableVipSlots = getAvailableVipSlotsLessThan(doctorName, appointmentDate, regularNumber);
        
        // Show dialog if there are VIP slots available that are better than regular
        if (availableVipSlots.length > 0) {
            // Store pending data and show dialog
            vipSlotPendingData = {
                patientName: patientName,
                doctorName: doctorName,
                doctorId: elements.appointmentDoctorId.value,
                dateTime: dateTime,
                status: status,
                bookingType: bookingType,
                patientId: elements.appointmentPatientId.value,
                age: elements.displayPatientAge.value,
                sex: elements.displayPatientSex.value,
                phone: elements.displayPatientPhone.value,
                notes: elements.appointmentNotes.value.trim(),
                fromCalendar: false
            };
            vipSlotRegularNumber = regularNumber;
            showVipSlotDialog(availableVipSlots, regularNumber, patientName);
            return; // Stop here, wait for user selection
        }
        // If no better VIP slots available, VIP gets regular number (continue below)
    }

    // Calculate booking number (or use existing if editing)
    const excludeId = appointmentIsEditing ? elements.appointmentId.value : null;
    let bookingNumber = calculateBookingNumber(doctorName, bookingType, appointmentDate, excludeId);

    // If editing, keep existing booking number ONLY if same doctor, date, AND booking type
    if (appointmentIsEditing) {
        const idx = parseInt(elements.appointmentEditIndex.value, 10);
        const existing = appointments[idx];
        if (existing && existing.doctorName === doctorName &&
            existing.appointmentTime.startsWith(appointmentDate) &&
            existing.bookingType === bookingType) {
            bookingNumber = existing.bookingNumber;
        }
    }


    const data = {
        id: appointmentIsEditing ? elements.appointmentId.value : generateAppointmentId(),
        patientId: elements.appointmentPatientId.value,
        patientName: patientName,
        age: elements.displayPatientAge.value,
        sex: elements.displayPatientSex.value,
        phone: elements.displayPatientPhone.value,
        doctorId: elements.appointmentDoctorId.value,
        doctorName: doctorName,
        appointmentTime: dateTime,
        bookingType: bookingType,
        bookingNumber: bookingNumber,
        status: status,
        notes: elements.appointmentNotes.value.trim(),
        createdAt: appointmentIsEditing ? appointments[parseInt(elements.appointmentEditIndex.value, 10)]?.createdAt : toLocalISOString(new Date()),
        editedTime: toLocalISOString(new Date())
    };

    // Track status change time
    const statusTimeKey = status.toLowerCase().replace(' ', '') + 'Time';
    data[statusTimeKey] = toLocalISOString(new Date());

    if (appointmentIsEditing) {
        const idx = parseInt(elements.appointmentEditIndex.value, 10);
        if (idx >= 0 && idx < appointments.length) {
            // Preserve original created time and any existing status times
            const existing = appointments[idx];
            data.createdAt = existing.createdAt;
            // Merge status times
            Object.keys(existing).forEach(key => {
                if (key.endsWith('Time') && !data[key]) {
                    data[key] = existing[key];
                }
            });
            appointments[idx] = data;
            saveAppointmentsToStorage();
            showNotification('Appointment updated successfully!');
            
            // Broadcast update to TV displays via WebSocket
            sendQueueEvent('appointment_updated', { ...data, action: 'updated' });
        }
    } else {
        appointments.push(data);
        saveAppointmentsToStorage();
        showNotification('Appointment created successfully!');
        
        // Broadcast new appointment to TV displays via WebSocket
        sendQueueEvent('appointment_created', { ...data, action: 'created' });
    }

    closeAppointmentFormModal();
    renderAppointmentTable();
    updateQueueSummary();
    renderInstructionDoctorFilter();
    renderInstructionTableWithSaved();
}

/**
 * Get available VIP slots that are less than a given number
 */
function getAvailableVipSlotsLessThan(doctorName, appointmentDate, lessThanNumber) {
    const usedNumbers = getUsedNumbersForDate(doctorName, appointmentDate);

    // Filter VIP reserved numbers that are:
    // 1. Not used
    // 2. Less than the regular number
    return vipReservedNumbers.filter(num =>
        !usedNumbers.includes(num) && num < lessThanNumber
    ).sort((a, b) => a - b); // Sort ascending
}

/**
 * Show VIP slot selection dialog
 */
function showVipSlotDialog(availableSlots, regularNumber, patientName) {
    elements.vipSlotPatientName.textContent = patientName;
    elements.vipSlotRegularNumber.textContent = regularNumber;
    
    // Generate slot buttons
    elements.vipSlotOptions.innerHTML = availableSlots.map(slot => 
        `<button type="button" class="vip-slot-btn" onclick="selectVipSlot(${slot})">${slot}</button>`
    ).join('');
    
    // Show dialog
    elements.vipSlotDialog.classList.remove('hidden');
}

/**
 * Select a VIP slot and complete the appointment save
 */
function selectVipSlot(slotNumber) {
    if (!vipSlotPendingData) return;

    // Complete the save with selected VIP slot
    completeVipAppointmentSave(slotNumber);
    closeVipSlotDialog();
}

// Expose to global scope for inline onclick handlers
window.selectVipSlot = selectVipSlot;
window.useRegularNumberForVip = useRegularNumberForVip;

/**
 * Complete VIP appointment save with selected slot
 */
function completeVipAppointmentSave(selectedSlot) {
    // Check if appointment date is today or tomorrow
    const apptDate = new Date(vipSlotPendingData.dateTime.split('T')[0]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    apptDate.setHours(0, 0, 0, 0);
    
    // Upgrade status to "Booked" if today or tomorrow
    let finalStatus = vipSlotPendingData.status;
    if (apptDate.getTime() === today.getTime() || apptDate.getTime() === tomorrow.getTime()) {
        finalStatus = 'Booked';
    }

    const data = {
        id: generateAppointmentId(),
        patientId: vipSlotPendingData.patientId,
        patientName: vipSlotPendingData.patientName,
        age: vipSlotPendingData.age,
        sex: vipSlotPendingData.sex,
        phone: vipSlotPendingData.phone,
        doctorId: vipSlotPendingData.doctorId,
        doctorName: vipSlotPendingData.doctorName,
        appointmentTime: vipSlotPendingData.dateTime,
        bookingType: vipSlotPendingData.bookingType,
        bookingNumber: selectedSlot,
        status: finalStatus,
        notes: vipSlotPendingData.notes || '',
        createdAt: toLocalISOString(new Date()),
        editedTime: toLocalISOString(new Date())
    };

    // Track status change time
    const statusTimeKey = finalStatus.toLowerCase().replace(' ', '') + 'Time';
    data[statusTimeKey] = toLocalISOString(new Date());

    appointments.push(data);
    saveAppointmentsToStorage();
    showNotification(`VIP slot #${selectedSlot} assigned to ${vipSlotPendingData.patientName}!`);

    // Broadcast new appointment to TV displays via WebSocket
    sendQueueEvent('appointment_created', { ...data, action: 'created' });

    // Close the appropriate form
    if (vipSlotPendingData.fromCalendar) {
        closeCalendarAppointmentForm();
    } else {
        closeAppointmentFormModal();
    }
    
    renderAppointmentTable();
    updateQueueSummary();

    vipSlotPendingData = null;
    vipSlotRegularNumber = null;
}

/**
 * Use regular number instead of VIP slot
 */
function useRegularNumberForVip() {
    if (!vipSlotPendingData) return;

    // Calculate regular number and save
    const regularNumber = calculateBookingNumber(
        vipSlotPendingData.doctorName,
        'Regular',
        vipSlotPendingData.dateTime.split('T')[0]
    );

    // Check if appointment date is today or tomorrow
    const apptDate = new Date(vipSlotPendingData.dateTime.split('T')[0]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    apptDate.setHours(0, 0, 0, 0);
    
    // Upgrade status to "Booked" if today or tomorrow
    let finalStatus = vipSlotPendingData.status;
    if (apptDate.getTime() === today.getTime() || apptDate.getTime() === tomorrow.getTime()) {
        finalStatus = 'Booked';
    }

    const data = {
        id: generateAppointmentId(),
        patientId: vipSlotPendingData.patientId,
        patientName: vipSlotPendingData.patientName,
        age: vipSlotPendingData.age,
        sex: vipSlotPendingData.sex,
        phone: vipSlotPendingData.phone,
        doctorId: vipSlotPendingData.doctorId,
        doctorName: vipSlotPendingData.doctorName,
        appointmentTime: vipSlotPendingData.dateTime,
        bookingType: vipSlotPendingData.bookingType,
        bookingNumber: regularNumber,
        status: finalStatus,
        notes: vipSlotPendingData.notes || '',
        createdAt: toLocalISOString(new Date()),
        editedTime: toLocalISOString(new Date())
    };

    const statusTimeKey = finalStatus.toLowerCase().replace(' ', '') + 'Time';
    data[statusTimeKey] = toLocalISOString(new Date());

    appointments.push(data);
    saveAppointmentsToStorage();
    showNotification(`Regular slot #${regularNumber} assigned to ${vipSlotPendingData.patientName} (VIP)`);

    sendQueueEvent('appointment_created', { ...data, action: 'created' });

    // Close the appropriate form
    if (vipSlotPendingData.fromCalendar) {
        closeCalendarAppointmentForm();
    } else {
        closeAppointmentFormModal();
    }
    
    renderAppointmentTable();
    updateQueueSummary();

    vipSlotPendingData = null;
    vipSlotRegularNumber = null;
    closeVipSlotDialog();
}

/**
 * Close VIP slot dialog without saving
 */
function closeVipSlotDialog() {
    elements.vipSlotDialog.classList.add('hidden');
    vipSlotPendingData = null;
    vipSlotRegularNumber = null;
}

function editAppointment(event, appointmentId) {
    event.stopPropagation();
    loadAppointmentToForm(appointmentId);
}

async function deleteAppointment(event, appointmentId) {
    event.stopPropagation();
    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) return;
    if (!confirm(`Are you sure you want to delete this appointment for ${appt.patientName}?`)) return;
    
    try {
        // Delete from IndexedDB
        await TWOKDB.remove(TWOKDB.STORES.APPOINTMENTS, appointmentId);
        
        // Remove from local array
        const idx = appointments.findIndex(a => a.id === appointmentId);
        if (idx > -1) {
            appointments.splice(idx, 1);
        }
        
        renderAppointmentTable();
        updateQueueSummary();
        renderInstructionDoctorFilter();
        renderInstructionTableWithSaved();
        showNotification('Appointment deleted successfully!');
        
        // Broadcast deletion to TV displays via WebSocket
        sendQueueEvent('appointment_deleted', { appointmentId, patientName: appt.patientName });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        showNotification('Error deleting appointment', 'error');
    }
}

function resetAppointmentForm() {
    elements.appointmentForm.reset();
    elements.appointmentEditIndex.value = '';
    elements.appointmentId.value = '';
    elements.appointmentPatientId.value = '';
    elements.appointmentDoctorId.value = '';
    elements.patientInfoDisplay.style.display = 'none';
    elements.displayPatientPhone.value = '';
    elements.displayPatientAge.value = '';
    elements.displayPatientSex.value = '';
    appointmentIsEditing = false;
    elements.appointmentFormTitle.textContent = 'New Appointment';
    elements.appointmentSaveBtnText.textContent = 'Save Appointment';
    elements.appointmentDeleteBtn.style.display = 'none';
    
    // Clear lab result warning
    elements.labResultWarning.classList.add('hidden');
    elements.labWarningDetails.innerHTML = '';

    // Clear datetime field - don't set default value
    elements.appointmentDateTime.value = '';
}

/**
 * Apply default time based on selected doctor
 */
function applyDefaultTimeForSelectedDoctor(forceApply = false) {
    const doctorName = elements.appointmentDoctor.value.trim();
    const dateTimeValue = elements.appointmentDateTime.value;

    // Only apply default times for Dr. Soe Chan Myae
    if (doctorName !== TARGET_DOCTOR_NAME) {
        return;
    }

    // Apply default time when date is selected
    if (dateTimeValue) {
        const selectedDate = new Date(dateTimeValue);
        const dayOfWeek = selectedDate.getDay();
        const defaultTime = getDefaultTimeForDay(dayOfWeek);

        // Validate working day first
        const isWorkingDay = validateWorkingDayForDoctor(dayOfWeek, doctorName);

        // If it's a non-working day, show warning and clear the time
        if (!isWorkingDay) {
            showNonWorkingDayWarning(dayOfWeek);
            // Clear the datetime to prevent booking
            elements.appointmentDateTime.value = '';
            return;
        }

        // If it's a working day and default time exists, apply it
        if (defaultTime) {
            selectedDate.setHours(defaultTime.hour, defaultTime.minute, 0, 0);
            elements.appointmentDateTime.value = toLocalISOString(selectedDate).slice(0, 16);
        }
    }
}

/**
 * Validate working day only for Dr. Soe Chan Myae
 * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
 * @param {string} doctorName - The selected doctor name
 */
function validateWorkingDayForDoctor(dayOfWeek, doctorName) {
    // Only validate for Dr. Soe Chan Myae
    if (doctorName !== TARGET_DOCTOR_NAME) {
        return true;
    }
    
    const isNonWorkingDay = NON_WORKING_DAYS.includes(dayOfWeek);
    
    if (isNonWorkingDay) {
        console.warn(`Warning: ${DAY_NAMES[dayOfWeek]} is configured as a non-working day for Dr. Soe Chan Myae`);
    }
    
    return !isNonWorkingDay;
}

function openAppointmentFormModal() {
    elements.appointmentFormModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Create appointment from calendar event with prefilled data
 * @param {string} patientName - Patient display name
 * @param {string} patientId - Patient ID
 * @param {string} doctorName - Doctor name
 * @param {string} calendarDate - Calendar event date (YYYY-MM-DD)
 */
window.createAppointmentFromCalendar = function(patientName, patientId, doctorName, calendarDate) {
    try {
        console.log('[Calendar] Creating appointment from calendar event');
        console.log('[Calendar] Patient:', patientName, 'ID:', patientId);
        console.log('[Calendar] Doctor:', doctorName);
        console.log('[Calendar] Date:', calendarDate);

        // Close the detail dialog first
        if (window.currentCalendarDialog) {
            window.currentCalendarDialog.remove();
            window.currentCalendarDialog = null;
        }

        // Reset the form
        resetCalendarAppointmentForm();

        // Pre-fill patient
        if (patientId) {
            const patient = patients.find(p => p.id === patientId);
            if (patient) {
                selectCalendarPatient(patientId);
            } else {
                elements.calendarApptPatient.value = patientName.split(',')[0];
                elements.calendarApptPatientId.value = '';
                elements.calendarPatientInfoDisplay.style.display = 'none';
            }
        } else {
            elements.calendarApptPatient.value = patientName.split(',')[0];
            elements.calendarApptPatientId.value = '';
            elements.calendarPatientInfoDisplay.style.display = 'none';
        }

        // Pre-fill doctor
        if (doctorName) {
            elements.calendarApptDoctor.value = doctorName;
            elements.calendarApptDoctorId.value = doctorName;
        }

        // Pre-fill date/time
        if (calendarDate) {
            const defaultTime = '09:00';
            elements.calendarApptDateTime.value = `${calendarDate}T${defaultTime}`;
            
            if (doctorName) {
                const bookingNumber = calculateBookingNumber(doctorName, 'Walk-in', calendarDate);
                elements.calendarApptBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
            }
        }

        // Open the slide panel
        openCalendarAppointmentForm();

        showNotification('📝 Appointment form opened with prefilled data', 'success');
    } catch (error) {
        console.error('[Calendar] Failed to create appointment from calendar:', error);
        showNotification('❌ Failed to open appointment form', 'error');
    }
};

function closeAppointmentFormModal() {
    elements.appointmentFormModal.classList.add('hidden');
    elements.patientAutocomplete.classList.add('hidden');
    elements.doctorAutocomplete.classList.add('hidden');
    elements.labResultWarning.classList.add('hidden');
    elements.labWarningDetails.innerHTML = '';
    document.body.style.overflow = '';
    resetAppointmentForm();
}

/**
 * Open calendar appointment form slide panel
 */
function openCalendarAppointmentForm() {
    elements.calendarAppointmentFormPanel.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        elements.calendarApptPatient.focus();
    }, 100);
}

/**
 * Close calendar appointment form slide panel
 */
function closeCalendarAppointmentForm() {
    elements.calendarAppointmentFormPanel.classList.add('hidden');
    document.body.style.overflow = '';
    resetCalendarAppointmentForm();
}

/**
 * Reset calendar appointment form
 */
function resetCalendarAppointmentForm() {
    elements.calendarAppointmentForm.reset();
    elements.calendarApptEditIndex.value = '';
    elements.calendarApptId.value = '';
    elements.calendarPatientAutocomplete.classList.add('hidden');
    elements.calendarDoctorAutocomplete.classList.add('hidden');
    elements.calendarPatientInfoDisplay.style.display = 'none';
    elements.calendarLabResultWarning.classList.add('hidden');
    elements.calendarApptDeleteBtn.style.display = 'none';
}

/**
 * Select patient in calendar appointment form
 */
function selectCalendarPatient(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;

    elements.calendarApptPatient.value = patient.name;
    elements.calendarApptPatientId.value = patient.id;
    elements.calendarDisplayPatientPhone.value = patient.phone || '';
    elements.calendarDisplayPatientAge.value = patient.age || '-';
    elements.calendarDisplayPatientSex.value = patient.sex || '-';
    elements.calendarDisplayPatientFoc.value = patient.isFoc ? '💝 FOC' : '-';
    elements.calendarPatientInfoDisplay.style.display = 'grid';

    // Auto-select FOC booking type for FOC patients
    if (patient.isFoc) {
        elements.calendarApptBookingType.value = 'FOC';
    } else {
        elements.calendarApptBookingType.value = 'Walk-in';
    }

    // Recalculate booking number
    recalculateCalendarBookingNumber();

    // Check for pending lab results
    displayCalendarPendingLabResults(patient.id);

    elements.calendarApptDoctor.focus();
}

/**
 * Recalculate booking number for calendar appointment form
 */
function recalculateCalendarBookingNumber() {
    const doctorName = elements.calendarApptDoctor.value.trim();
    const dateTime = elements.calendarApptDateTime.value;
    const bookingType = elements.calendarApptBookingType.value;
    
    if (doctorName && dateTime && bookingType) {
        const appointmentDate = dateTime.split('T')[0];
        const bookingNumber = calculateBookingNumber(doctorName, bookingType, appointmentDate);
        elements.calendarApptBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
    }
}

/**
 * Save calendar appointment
 */
function saveCalendarAppointment(e) {
    e.preventDefault();

    const patientName = elements.calendarApptPatient.value.trim();
    const doctorName = elements.calendarApptDoctor.value.trim();
    const dateTime = elements.calendarApptDateTime.value;
    const bookingType = elements.calendarApptBookingType.value;
    const status = elements.calendarApptStatus.value;

    if (!patientName) { showNotification('Patient name is required', 'error'); elements.calendarApptPatient.focus(); return; }
    if (!doctorName) { showNotification('Doctor name is required', 'error'); elements.calendarApptDoctor.focus(); return; }
    if (!dateTime) { showNotification('Date & Time is required', 'error'); elements.calendarApptDateTime.focus(); return; }
    if (!bookingType) { showNotification('Booking type is required', 'error'); elements.calendarApptBookingType.focus(); return; }
    if (!status) { showNotification('Status is required', 'error'); elements.calendarApptStatus.focus(); return; }

    const appointmentDate = dateTime.split('T')[0];

    // If VIP booking for target doctor, check if we should show slot selection dialog
    if (bookingType === 'VIP' && doctorName === TARGET_DOCTOR_NAME) {
        // Calculate what regular number would be
        const regularNumber = calculateBookingNumber(doctorName, 'Regular', appointmentDate);

        // Get available VIP slots that are less than regular number
        const availableVipSlots = getAvailableVipSlotsLessThan(doctorName, appointmentDate, regularNumber);

        // Show dialog if there are VIP slots available that are better than regular
        if (availableVipSlots.length > 0) {
            // Store pending data and show dialog
            vipSlotPendingData = {
                patientName: patientName,
                doctorName: doctorName,
                doctorId: elements.calendarApptDoctorId.value,
                dateTime: dateTime,
                status: status,
                bookingType: bookingType,
                patientId: elements.calendarApptPatientId.value,
                age: elements.calendarDisplayPatientAge.value,
                sex: elements.calendarDisplayPatientSex.value,
                phone: elements.calendarDisplayPatientPhone.value,
                notes: elements.calendarApptNotes.value.trim(),
                fromCalendar: true
            };
            vipSlotRegularNumber = regularNumber;
            showVipSlotDialog(availableVipSlots, regularNumber, patientName);
            return; // Stop here, wait for user selection
        }
        // If no better VIP slots available, VIP gets regular number (continue below)
    }

    const bookingNumber = calculateBookingNumber(doctorName, bookingType, appointmentDate);

    const data = {
        id: generateAppointmentId(),
        patientId: elements.calendarApptPatientId.value,
        patientName: patientName,
        age: elements.calendarDisplayPatientAge.value,
        sex: elements.calendarDisplayPatientSex.value,
        phone: elements.calendarDisplayPatientPhone.value,
        doctorId: elements.calendarApptDoctorId.value,
        doctorName: doctorName,
        appointmentTime: dateTime,
        bookingType: bookingType,
        bookingNumber: bookingNumber,
        status: status,
        notes: elements.calendarApptNotes.value.trim(),
        createdAt: toLocalISOString(new Date())
    };

    appointments.push(data);
    saveAppointmentsToStorage();

    // Broadcast new appointment
    sendQueueEvent('appointment_created', { ...data, action: 'created' });

    closeCalendarAppointmentForm();
    showNotification('✅ Appointment created successfully!', 'success');

    // Refresh calendar if visible
    if (!elements.calendarSection.classList.contains('hidden')) {
        refreshCalendar();
    }

    // Update appointments table and queue summary
    renderAppointmentTable();
    updateQueueSummary();
}

/**
 * Show patient autocomplete in calendar form
 */
function showCalendarPatientAutocomplete(searchTerm) {
    if (!searchTerm || searchTerm.length < 1) {
        elements.calendarPatientAutocomplete.classList.add('hidden');
        return;
    }

    const term = searchTerm.toLowerCase();
    const matches = patients.filter(p => p.name.toLowerCase().includes(term)).slice(0, 10);

    if (matches.length === 0) {
        elements.calendarPatientAutocomplete.innerHTML = `
            <div class="autocomplete-item" onclick="openPatientFormModal()">
                <div class="autocomplete-item-primary">No patient found</div>
                <div class="autocomplete-item-secondary">Click to register new patient</div>
            </div>
        `;
        elements.calendarPatientAutocomplete.classList.remove('hidden');
        return;
    }

    elements.calendarPatientAutocomplete.innerHTML = matches.map((p, idx) => `
        <div class="autocomplete-item" data-index="${idx}" data-id="${p.id}">
            <div class="autocomplete-item-primary">${escapeHtml(p.name)}</div>
            <div class="autocomplete-item-secondary">${escapeHtml(p.age)} — ${escapeHtml(p.phone)} — ${escapeHtml(p.address)}</div>
        </div>
    `).join('');

    elements.calendarPatientAutocomplete.classList.remove('hidden');

    // Add click handlers
    elements.calendarPatientAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            if (id) {
                selectCalendarPatient(id);
                elements.calendarPatientAutocomplete.classList.add('hidden');
            }
        });
    });
}

/**
 * Show doctor autocomplete in calendar form
 */
function showCalendarDoctorAutocomplete(searchTerm) {
    if (!searchTerm || searchTerm.length < 1) {
        elements.calendarDoctorAutocomplete.classList.add('hidden');
        return;
    }

    const term = searchTerm.toLowerCase();
    const matches = doctors.filter(d => d.name.toLowerCase().includes(term)).slice(0, 10);

    if (matches.length === 0) {
        elements.calendarDoctorAutocomplete.innerHTML = `
            <div class="autocomplete-item">
                <div class="autocomplete-item-primary">No doctor found</div>
            </div>
        `;
        elements.calendarDoctorAutocomplete.classList.remove('hidden');
        return;
    }

    elements.calendarDoctorAutocomplete.innerHTML = matches.map((d, idx) => `
        <div class="autocomplete-item" data-index="${idx}" data-name="${escapeHtml(d.name)}">
            <div class="autocomplete-item-primary">${escapeHtml(d.name)}</div>
            <div class="autocomplete-item-secondary">${escapeHtml(d.speciality || '-')} — ${escapeHtml(d.hospital || '-')}</div>
        </div>
    `).join('');

    elements.calendarDoctorAutocomplete.classList.remove('hidden');

    // Add click handlers
    elements.calendarDoctorAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.name;
            if (name) {
                elements.calendarApptDoctor.value = name;
                elements.calendarApptDoctorId.value = name;
                elements.calendarDoctorAutocomplete.classList.add('hidden');
                elements.calendarApptDateTime.focus();
                
                // Recalculate booking number
                const dateTime = elements.calendarApptDateTime.value;
                if (dateTime) {
                    const appointmentDate = dateTime.split('T')[0];
                    const bookingType = elements.calendarApptBookingType.value;
                    const bookingNumber = calculateBookingNumber(name, bookingType, appointmentDate);
                    elements.calendarApptBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
                }
            }
        });
    });
}

function clearAppointmentForm() {
    resetAppointmentForm();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    console.log('[Setup] setupEventListeners called');
    console.log('[Setup] addLabTrackerBtn element:', elements.addLabTrackerBtn ? 'FOUND' : 'NULL');
    
    // Navigation - Bottom Navigation (desktop)
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchSection(item.dataset.section);
            // Scroll active item into view for better UX
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
    });

    // Navigation - Sidebar (tablet)
    elements.sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            switchSection(item.dataset.section);
            closeSidebar();
        });
    });

    // Menu toggle button
    elements.menuToggleBtn.addEventListener('click', toggleSidebar);

    // Close sidebar button
    elements.closeSidebarBtn.addEventListener('click', closeSidebar);

    // Overlay click to close sidebar
    elements.sidebarOverlay.addEventListener('click', closeSidebar);

    // Enable horizontal scroll with mouse drag for bottom nav
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        let isDown = false;
        let startX;
        let scrollLeft;

        bottomNav.addEventListener('mousedown', (e) => {
            isDown = true;
            bottomNav.style.cursor = 'grabbing';
            startX = e.pageX - bottomNav.offsetLeft;
            scrollLeft = bottomNav.scrollLeft;
        });

        bottomNav.addEventListener('mouseleave', () => {
            isDown = false;
            bottomNav.style.cursor = 'grab';
        });

        bottomNav.addEventListener('mouseup', () => {
            isDown = false;
            bottomNav.style.cursor = 'grab';
        });

        bottomNav.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - bottomNav.offsetLeft;
            const walk = (x - startX) * 2; // Scroll speed multiplier
            bottomNav.scrollLeft = scrollLeft - walk;
        });

        // Set initial cursor style
        bottomNav.style.cursor = 'grab';

        // Update scroll indicator
        function updateScrollIndicator() {
            const isScrollable = bottomNav.scrollWidth > bottomNav.clientWidth;
            const isScrolledToRight = bottomNav.scrollLeft >= bottomNav.scrollWidth - bottomNav.clientWidth - 5;
            
            if (isScrollable && !isScrolledToRight) {
                bottomNav.classList.add('has-more-right');
            } else {
                bottomNav.classList.remove('has-more-right');
            }
        }

        // Listen for scroll events
        bottomNav.addEventListener('scroll', updateScrollIndicator);
        
        // Check on resize
        window.addEventListener('resize', updateScrollIndicator);
        
        // Initial check
        setTimeout(updateScrollIndicator, 200);

        // Auto-scroll to active item on page load
        const activeItem = bottomNav.querySelector('.nav-item.active');
        if (activeItem) {
            setTimeout(() => {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                setTimeout(updateScrollIndicator, 300);
            }, 100);
        }
    }

    // Patient Search
    elements.patientSearchInput.addEventListener('input', (e) => searchPatients(e.target.value));

    // Patient - Add new link
    elements.addNewPatientLink.addEventListener('click', (e) => {
        e.preventDefault();
        elements.patientSearchInput.value = '';
        searchPatients('');
        openPatientFormModal();
    });

    // Patient - New button
    elements.newPatientBtn.addEventListener('click', () => {
        window.patientFormSourceSection = 'patient';
        elements.patientFormTitle.textContent = 'Register New Patient';
        openPatientFormModal();
    });
    elements.patientEmptyNewBtn.addEventListener('click', () => {
        window.patientFormSourceSection = 'patient';
        elements.patientFormTitle.textContent = 'Register New Patient';
        openPatientFormModal();
    });

    // Patient - Close modal
    elements.closePatientFormModal.addEventListener('click', closePatientFormModal);

    // Patient - Form submit
    elements.patientForm.addEventListener('submit', savePatient);

    // Patient - Mobile navigation (blur auto-advance)
    elements.patientName.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement.closest('#patientName') && elements.patientName.value) {
                elements.patientAge.focus();
            }
        }, 200);
    });

    elements.patientAge.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement.closest('#patientAge')) {
                elements.patientSex.focus();
            }
        }, 200);
    });

    elements.patientSex.addEventListener('change', () => {
        setTimeout(() => {
            elements.patientAddress.focus();
        }, 100);
    });

    elements.patientAddress.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement.closest('#patientAddress') && elements.patientAddress.value) {
                elements.patientPhone.focus();
            }
        }, 200);
    });

    // Patient - Clear/Cancel
    elements.patientClearBtn.addEventListener('click', clearPatientForm);
    elements.patientCancelBtn.addEventListener('click', closePatientFormModal);
    
    // Patient - Delete
    elements.patientDeleteBtn.addEventListener('click', () => {
        const patientId = elements.patientId.value;
        if (!patientId) return;
        
        const patient = patients.find(p => p.id === patientId);
        if (!patient) return;
        
        if (!confirm(`Are you sure you want to delete ${patient.name} (${patient.id})?\n\nThis action cannot be undone.`)) return;
        
        const idx = patients.findIndex(p => p.id === patientId);
        if (idx > -1) {
            patients.splice(idx, 1);
            savePatientsToStorage();
            closePatientFormModal();
            renderPatientTable();
            showNotification('Patient deleted successfully!');
        }
    });

    // Patient - Copy phone
    elements.patientCopyPhoneBtn.addEventListener('click', copyPatientPhone);
    elements.patientPhone.addEventListener('click', () => {
        if (elements.patientPhone.value.trim()) copyPatientPhone();
    });

    // Patient - Address blur auto-save
    elements.patientAddress.addEventListener('blur', () => {
        const addr = elements.patientAddress.value.trim();
        if (addr && !addresses.includes(addr)) {
            addresses.push(addr);
            saveAddressesToStorage();
            renderAddressList();
        }
    });

    // Address Management
    elements.manageAddressBtn.addEventListener('click', openAddressModal);
    elements.closeAddressModal.addEventListener('click', closeAddressModal);
    elements.addAddressBtn.addEventListener('click', addAddress);
    elements.newAddressInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addAddress(); });
    elements.addressModal.addEventListener('click', (e) => { if (e.target === elements.addressModal) closeAddressModal(); });

    // Doctor Search
    elements.doctorSearchInput.addEventListener('input', (e) => searchDoctors(e.target.value));

    // Doctor - Add new link
    elements.addNewDoctorLink.addEventListener('click', (e) => {
        e.preventDefault();
        elements.doctorSearchInput.value = '';
        searchDoctors('');
        openDoctorFormModal();
    });

    // Doctor - New button
    elements.newDoctorBtn.addEventListener('click', openDoctorFormModal);
    elements.doctorEmptyNewBtn.addEventListener('click', openDoctorFormModal);

    // Doctor - Close modal
    elements.closeDoctorFormModal.addEventListener('click', closeDoctorFormModal);

    // Doctor - Form submit
    elements.doctorForm.addEventListener('submit', saveDoctor);

    // Doctor - Clear/Cancel
    elements.doctorClearBtn.addEventListener('click', clearDoctorForm);
    elements.doctorCancelBtn.addEventListener('click', closeDoctorFormModal);
    
    // Doctor - Delete
    elements.doctorDeleteBtn.addEventListener('click', () => {
        const doctorId = elements.doctorId.value;
        if (!doctorId) return;
        
        const doctor = doctors.find(d => d.id === doctorId);
        if (!doctor) return;
        
        if (!confirm(`Are you sure you want to delete ${doctor.name} (${doctor.id})?\n\nThis action cannot be undone.`)) return;
        
        const idx = doctors.findIndex(d => d.id === doctorId);
        if (idx > -1) {
            doctors.splice(idx, 1);
            saveDoctorsToStorage();
            closeDoctorFormModal();
            renderDoctorTable();
            renderDoctorFilter();
            showNotification('Doctor deleted successfully!');
        }
    });

    // Doctor - Copy phone
    elements.doctorCopyPhoneBtn.addEventListener('click', copyDoctorPhone);
    elements.doctorPhone.addEventListener('click', () => {
        if (elements.doctorPhone.value.trim()) copyDoctorPhone();
    });

    // Doctor - Speciality/Hospital blur auto-save
    elements.doctorSpeciality.addEventListener('blur', () => {
        const spec = elements.doctorSpeciality.value.trim();
        if (spec && !specialities.includes(spec)) {
            specialities.push(spec);
            saveSpecialitiesToStorage();
            renderSpecialityList();
        }
    });
    elements.doctorHospital.addEventListener('blur', () => {
        const hosp = elements.doctorHospital.value.trim();
        if (hosp && !hospitals.includes(hosp)) {
            hospitals.push(hosp);
            saveHospitalsToStorage();
            renderHospitalList();
        }
    });

    // Speciality Management
    elements.manageSpecialityBtn.addEventListener('click', openSpecialityModal);
    elements.manageSpecialityInFormBtn.addEventListener('click', openSpecialityModal);
    elements.closeSpecialityModal.addEventListener('click', closeSpecialityModal);
    elements.addSpecialityBtn.addEventListener('click', addSpeciality);
    elements.newSpecialityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSpeciality(); });
    elements.specialityModal.addEventListener('click', (e) => { if (e.target === elements.specialityModal) closeSpecialityModal(); });

    // Hospital Management
    elements.manageHospitalBtn.addEventListener('click', openHospitalModal);
    elements.manageHospitalInFormBtn.addEventListener('click', openHospitalModal);
    elements.closeHospitalModal.addEventListener('click', closeHospitalModal);
    elements.addHospitalBtn.addEventListener('click', addHospital);
    elements.newHospitalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHospital(); });
    elements.hospitalModal.addEventListener('click', (e) => { if (e.target === elements.hospitalModal) closeHospitalModal(); });

    // Doctor - Table sorting
    document.querySelectorAll('#doctorTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortDoctors(th.dataset.sort));
    });

    // Close modals on backdrop click
    elements.patientFormModal.addEventListener('click', (e) => {
        if (e.target === elements.patientFormModal || e.target.classList.contains('bottom-sheet-backdrop')) closePatientFormModal();
    });
    elements.doctorFormModal.addEventListener('click', (e) => {
        if (e.target === elements.doctorFormModal || e.target.classList.contains('bottom-sheet-backdrop')) closeDoctorFormModal();
    });

    // Escape key handling
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.hospitalModal.classList.contains('hidden')) closeHospitalModal();
            else if (!elements.specialityModal.classList.contains('hidden')) closeSpecialityModal();
            else if (!elements.addressModal.classList.contains('hidden')) closeAddressModal();
            else if (!elements.doctorFormModal.classList.contains('hidden')) closeDoctorFormModal();
            else if (!elements.patientFormModal.classList.contains('hidden')) closePatientFormModal();
            else if (!elements.appointmentFormModal.classList.contains('hidden')) closeAppointmentFormModal();
            else if (document.activeElement === elements.doctorSearchInput) {
                elements.doctorSearchInput.value = '';
                searchDoctors('');
            } else if (document.activeElement === elements.patientSearchInput) {
                elements.patientSearchInput.value = '';
                searchPatients('');
            } else if (document.activeElement === elements.appointmentSearchInput) {
                elements.appointmentSearchInput.value = '';
                searchAppointments('');
            }
        }
    });

    // Reposition/hide autocomplete dropdowns on scroll/resize
    window.addEventListener('scroll', () => {
        document.querySelectorAll('.autocomplete-dropdown:not(.hidden)').forEach(dropdown => {
            if (dropdown.parentElement) {
                positionAutocomplete(dropdown, dropdown.parentElement);
            }
        });
    }, { passive: true });

    window.addEventListener('resize', () => {
        document.querySelectorAll('.autocomplete-dropdown:not(.hidden)').forEach(dropdown => {
            dropdown.classList.add('hidden');
        });
    });

    // Keyboard navigation - Patient form
    elements.patientForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            const formEls = Array.from(elements.patientForm.elements).filter(el => el.tagName !== 'BUTTON' && el.type !== 'hidden');
            const idx = formEls.indexOf(e.target);
            if (idx < formEls.length - 1) formEls[idx + 1].focus();
        }
    });

    // Keyboard navigation - Doctor form
    elements.doctorForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            const formEls = Array.from(elements.doctorForm.elements).filter(el => el.tagName !== 'BUTTON' && el.type !== 'hidden');
            const idx = formEls.indexOf(e.target);
            if (idx < formEls.length - 1) formEls[idx + 1].focus();
        }
    });

    // ==================== APPOINTMENT EVENT LISTENERS ====================
    
    // Appointment Search
    elements.appointmentSearchInput.addEventListener('input', (e) => searchAppointments(e.target.value));

    // Appointment filters
    elements.appointmentDateFilter.addEventListener('change', () => searchAppointments(elements.appointmentSearchInput.value));
    elements.appointmentDoctorFilter.addEventListener('change', () => searchAppointments(elements.appointmentSearchInput.value));

    // Today appointments button
    elements.todayAppointmentsBtn.addEventListener('click', () => {
        const today = toLocalDateString(new Date());
        elements.appointmentDateFilter.value = today;
        searchAppointments(elements.appointmentSearchInput.value);
    });

    // Add new appointment link
    elements.addNewAppointmentLink.addEventListener('click', (e) => {
        e.preventDefault();
        elements.appointmentSearchInput.value = '';
        elements.appointmentDateFilter.value = '';
        elements.appointmentDoctorFilter.value = '';
        searchAppointments('');
        openAppointmentFormModal();
    });

    // New appointment button
    elements.newAppointmentBtn.addEventListener('click', openAppointmentFormModal);
    elements.appointmentEmptyNewBtn.addEventListener('click', openAppointmentFormModal);

    // Next Patient button - automate queue flow
    elements.nextPatientBtn.addEventListener('click', handleNextPatient);

    // Close appointment modal
    elements.closeAppointmentFormModal.addEventListener('click', closeAppointmentFormModal);

    // Appointment form submit
    elements.appointmentForm.addEventListener('submit', saveAppointment);

    // Appointment - Mobile navigation (blur auto-advance)
    elements.appointmentPatient.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement.closest('#appointmentPatient') && elements.appointmentPatientId.value) {
                elements.appointmentDoctor.focus();
            }
        }, 200);
    });

    elements.appointmentDoctor.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement.closest('#appointmentDoctor') && elements.appointmentDoctorId.value) {
                elements.appointmentDateTime.focus();
            }
        }, 200);
    });

    elements.appointmentDateTime.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement.closest('#appointmentDateTime')) {
                elements.appointmentBookingType.focus();
            }
        }, 200);
    });

    elements.appointmentBookingType.addEventListener('change', () => {
        setTimeout(() => {
            elements.appointmentStatus.focus();
        }, 100);
    });

    // Appointment clear/cancel
    elements.appointmentClearBtn.addEventListener('click', clearAppointmentForm);
    elements.appointmentCancelBtn.addEventListener('click', closeAppointmentFormModal);
    
    // Appointment delete
    elements.appointmentDeleteBtn.addEventListener('click', async () => {
        const appointmentId = elements.appointmentId.value;
        if (!appointmentId) return;

        const appt = appointments.find(a => a.id === appointmentId);
        if (!appt) return;

        if (!confirm(`Are you sure you want to delete this appointment for ${appt.patientName}?\n\nThis action cannot be undone.`)) return;

        try {
            // Delete from IndexedDB
            await TWOKDB.remove(TWOKDB.STORES.APPOINTMENTS, appointmentId);
            
            // Remove from local array
            const idx = appointments.findIndex(a => a.id === appointmentId);
            if (idx > -1) {
                appointments.splice(idx, 1);
            }
            
            closeAppointmentFormModal();
            renderAppointmentTable();
            updateQueueSummary();
            showNotification('Appointment deleted successfully!');
            
            // Broadcast deletion to TV displays via WebSocket
            sendQueueEvent('appointment_deleted', { appointmentId, patientName: appt.patientName });
        } catch (error) {
            console.error('Error deleting appointment:', error);
            showNotification('Error deleting appointment', 'error');
        }
    });

    // Patient autocomplete
    elements.appointmentPatient.addEventListener('input', (e) => {
        showPatientAutocomplete(e.target.value);
        patientAutocompleteHighlighted = -1;
    });

    elements.appointmentPatient.addEventListener('focus', (e) => {
        if (e.target.value) showPatientAutocomplete(e.target.value);
    });

    elements.appointmentPatient.addEventListener('keydown', (e) => {
        const items = elements.patientAutocomplete.querySelectorAll('.autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            patientAutocompleteHighlighted = Math.min(patientAutocompleteHighlighted + 1, items.length - 1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === patientAutocompleteHighlighted);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            patientAutocompleteHighlighted = Math.max(patientAutocompleteHighlighted - 1, -1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === patientAutocompleteHighlighted);
            });
        } else if (e.key === 'Enter' && patientAutocompleteHighlighted >= 0) {
            e.preventDefault();
            items[patientAutocompleteHighlighted].click();
        } else if (e.key === 'Escape') {
            elements.patientAutocomplete.classList.add('hidden');
        }
    });

    // Click outside to close autocomplete
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            elements.patientAutocomplete.classList.add('hidden');
            elements.doctorAutocomplete.classList.add('hidden');
        }
    });

    // Doctor autocomplete
    elements.appointmentDoctor.addEventListener('input', (e) => {
        showDoctorAutocomplete(e.target.value);
        doctorAutocompleteHighlighted = -1;
    });

    elements.appointmentDoctor.addEventListener('focus', (e) => {
        if (e.target.value) showDoctorAutocomplete(e.target.value);
    });

    elements.appointmentDoctor.addEventListener('keydown', (e) => {
        const items = elements.doctorAutocomplete.querySelectorAll('.autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            doctorAutocompleteHighlighted = Math.min(doctorAutocompleteHighlighted + 1, items.length - 1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === doctorAutocompleteHighlighted);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            doctorAutocompleteHighlighted = Math.max(doctorAutocompleteHighlighted - 1, -1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === doctorAutocompleteHighlighted);
            });
        } else if (e.key === 'Enter' && doctorAutocompleteHighlighted >= 0) {
            e.preventDefault();
            items[doctorAutocompleteHighlighted].click();
        } else if (e.key === 'Escape') {
            elements.doctorAutocomplete.classList.add('hidden');
        }
    });

    // Register new patient from appointment form
    elements.registerNewPatientFromAppt.addEventListener('click', () => {
        elements.patientAutocomplete.classList.add('hidden');
        // Set flag to return to appointment form after saving patient
        window.patientFormSourceSection = 'appointment';
        // Update form title to show context
        elements.patientFormTitle.textContent = 'Register New Patient (for Appointment)';
        openPatientFormModal();
    });

    // Booking type change - recalculate booking number
    elements.appointmentBookingType.addEventListener('change', () => {
        const doctorName = elements.appointmentDoctor.value.trim();
        const bookingType = elements.appointmentBookingType.value;
        const dateTime = elements.appointmentDateTime.value;

        if (doctorName && bookingType && dateTime) {
            const appointmentDate = dateTime.split('T')[0];
            // Exclude current appointment being edited
            const excludeId = appointmentIsEditing ? elements.appointmentId.value : null;
            const bookingNumber = calculateBookingNumber(doctorName, bookingType, appointmentDate, excludeId);
            elements.appointmentBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
        }
    });

    // Doctor change - recalculate booking number
    elements.appointmentDoctor.addEventListener('blur', () => {
        const doctorName = elements.appointmentDoctor.value.trim();
        const bookingType = elements.appointmentBookingType.value;
        const dateTime = elements.appointmentDateTime.value;

        // Apply default time for Dr. Soe Chan Myae (force apply when doctor changes)
        applyDefaultTimeForSelectedDoctor(true);

        if (doctorName && bookingType && dateTime) {
            const appointmentDate = dateTime.split('T')[0];
            // Exclude current appointment being edited
            const excludeId = appointmentIsEditing ? elements.appointmentId.value : null;
            const bookingNumber = calculateBookingNumber(doctorName, bookingType, appointmentDate, excludeId);
            elements.appointmentBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
        }
    });

    // DateTime change - validate working day and apply default time for Dr. Soe Chan Myae
    let previousSelectedDate = null;

    elements.appointmentDateTime.addEventListener('change', () => {
        const dateTimeValue = elements.appointmentDateTime.value;
        if (!dateTimeValue) return;

        const selectedDate = new Date(dateTimeValue);
        const dayOfWeek = selectedDate.getDay();
        const doctorName = elements.appointmentDoctor.value.trim();

        // Extract just the date portion (YYYY-MM-DD)
        const datePortion = dateTimeValue.split('T')[0];

        // Only apply default times and validation for Dr. Soe Chan Myae
        if (doctorName === TARGET_DOCTOR_NAME) {
            const defaultTime = getDefaultTimeForDay(dayOfWeek);

            // Check if it's a non-working day
            if (!defaultTime) {
                showNonWorkingDayWarning(dayOfWeek);
                // Clear the datetime to prevent booking
                elements.appointmentDateTime.value = '';
                previousSelectedDate = null;
                return;
            }

            // Apply the default time for the selected day
            selectedDate.setHours(defaultTime.hour, defaultTime.minute, 0, 0);
            elements.appointmentDateTime.value = toLocalISOString(selectedDate).slice(0, 16);

            // Update the previous date
            previousSelectedDate = datePortion;
        }

        // Recalculate booking number
        const bookingType = elements.appointmentBookingType.value;

        if (doctorName && bookingType && dateTimeValue) {
            const appointmentDate = dateTimeValue.split('T')[0];
            // Exclude current appointment being edited
            const excludeId = appointmentIsEditing ? elements.appointmentId.value : null;
            const bookingNumber = calculateBookingNumber(doctorName, bookingType, appointmentDate, excludeId);
            elements.appointmentBookingNumber.value = bookingNumber !== null ? bookingNumber : '';
        }
    });

    // Doctor change - apply default time for Dr. Soe Chan Myae
    elements.appointmentDoctor.addEventListener('change', () => {
        applyDefaultTimeForSelectedDoctor(true);
    });

    // Status change - update timestamp
    elements.appointmentStatus.addEventListener('change', () => {
        // Timestamps are updated on save
    });

    // Appointment table sorting
    document.querySelectorAll('#appointmentTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortAppointments(th.dataset.sort));
    });

    // Close appointment modal on backdrop click
    elements.appointmentFormModal.addEventListener('click', (e) => {
        if (e.target === elements.appointmentFormModal || e.target.classList.contains('bottom-sheet-backdrop')) {
            closeAppointmentFormModal();
        }
    });

    // Keyboard navigation - Appointment form
    elements.appointmentForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('.autocomplete-wrapper')) {
            e.preventDefault();
            const formEls = Array.from(elements.appointmentForm.elements).filter(el => el.tagName !== 'BUTTON' && el.type !== 'hidden');
            const idx = formEls.indexOf(e.target);
            if (idx < formEls.length - 1) formEls[idx + 1].focus();
        }
    });

    // ==================== INVESTIGATION DIALOG EVENT LISTENERS ====================

    // Investigation dialog buttons
    elements.investigationYesBtn.addEventListener('click', handleInvestigationYes);
    elements.investigationNoBtn.addEventListener('click', handleInvestigationNo);

    // Close patient selection button
    elements.closePatientSelectionBtn.addEventListener('click', closeInvestigationDialog);

    // Skip patient button
    elements.skipPatientBtn.addEventListener('click', skipToNextCandidate);

    // Call patient button
    elements.callPatientBtn.addEventListener('click', () => {
        if (patientCandidates.length > 0 && currentCandidateIndex < patientCandidates.length) {
            const candidate = patientCandidates[currentCandidateIndex];
            callNextPatient(candidate.appointment);
        }
    });

    // Close investigation dialog on backdrop click
    elements.investigationDialog.addEventListener('click', (e) => {
        if (e.target === elements.investigationDialog) {
            closeInvestigationDialog();
        }
    });

    // VIP Slot dialog buttons
    elements.vipSlotUseRegularBtn.addEventListener('click', useRegularNumberForVip);
    elements.vipSlotCancelBtn.addEventListener('click', closeVipSlotDialog);

    // Close VIP slot dialog on backdrop click
    elements.vipSlotDialog.addEventListener('click', (e) => {
        if (e.target === elements.vipSlotDialog) {
            closeVipSlotDialog();
        }
    });

    // ==================== KEYBOARD SHORTCUTS ====================

    // Global keyboard shortcuts for appointment workflow
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+A - Mark first arrived patient as Arrived (keyboard shortcut)
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const today = toLocalDateString(new Date());
            const todayAppointments = appointments.filter(a =>
                a.appointmentTime.startsWith(today) && a.status === 'Booked'
            );

            if (todayAppointments.length > 0) {
                // Sort by: 1) Status priority, 2) Penalty, 3) Booking number
                todayAppointments.sort((a, b) => {
                    // Priority 1: Status priority
                    const aPriority = STATUS_PRIORITY[a.status] || 99;
                    const bPriority = STATUS_PRIORITY[b.status] || 99;
                    
                    if (aPriority !== bPriority) {
                        return aPriority - bPriority;
                    }
                    
                    // Priority 2: Penalty (no penalty first)
                    const aHasPenalty = a.penaltyTurns && a.penaltyTurns > 0;
                    const bHasPenalty = b.penaltyTurns && b.penaltyTurns > 0;
                    
                    if (aHasPenalty && !bHasPenalty) return 1;
                    if (!aHasPenalty && bHasPenalty) return -1;
                    
                    // Priority 3: Booking number
                    if (a.bookingNumber === null || a.bookingNumber === undefined) return 1;
                    if (b.bookingNumber === null || b.bookingNumber === undefined) return -1;
                    return parseInt(a.bookingNumber, 10) - parseInt(b.bookingNumber, 10);
                });

                markAppointmentArrived(todayAppointments[0].id);
            }
        }
    });

    // ==================== INSTRUCTION FORM EVENT LISTENERS ====================

    // Quick duration buttons
    document.querySelectorAll('.quick-duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.instructDuration.value = btn.dataset.duration;
            elements.instructDurationUnit.value = btn.dataset.unit;
        });
    });

    // Toggle test selection on other instruction type change
    elements.instructOtherType.addEventListener('change', toggleTestSelection);
    
    // Toggle custom test input on "Other" checkbox change
    elements.testCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.value === 'Other') {
                if (cb.checked) {
                    elements.customTestGroup.classList.remove('hidden');
                    elements.instructCustomTest.focus();
                } else {
                    elements.customTestGroup.classList.add('hidden');
                    elements.instructCustomTest.value = '';
                }
            }
        });
    });

    // Close instruction panel
    elements.closeInstructionPanel.addEventListener('click', closeInstructionFormPanel);
    elements.instructionFormPanel.querySelector('.slide-panel-overlay').addEventListener('click', closeInstructionFormPanel);

    // Instruction form submit
    elements.instructionForm.addEventListener('submit', saveInstruction);

    // Instruction cancel
    elements.instructCancelBtn.addEventListener('click', closeInstructionFormPanel);

    // Instruction delete
    elements.instructDeleteBtn.addEventListener('click', deleteInstruction);

    // Instruction table search and filters
    elements.instructionSearchInput.addEventListener('input', () => renderInstructionTableWithSaved());
    elements.instructionDoctorFilter.addEventListener('change', () => renderInstructionTableWithSaved());
    elements.instructionSortFilter.addEventListener('change', () => renderInstructionTableWithSaved());

    // ==================== EXPENSE EVENT LISTENERS ====================

    // Add expense button
    elements.addExpenseBtn.addEventListener('click', () => {
        if (window.expenseForm) {
            window.expenseForm.show(null);
        }
    });

    // Close category details dialog
    elements.closeCategoryDetails.addEventListener('click', closeCategoryDetailsDialog);
    elements.categoryDetailsDialog.addEventListener('click', (e) => {
        if (e.target === elements.categoryDetailsDialog) closeCategoryDetailsDialog();
    });

    // Set initial expense date/time to now
    const expenseDateTime = document.getElementById('globalExpenseDateTime');
    if (expenseDateTime) {
        const now = new Date();
        expenseDateTime.value = toLocalISOString(now).slice(0, 16);
    }

    // ==================== LAB TRACKER EVENT LISTENERS ====================

    // Add lab tracker button
    if (elements.addLabTrackerBtn) {
        console.log('[LabTracker] Event listener attached on Add Lab Tracker button');
        elements.addLabTrackerBtn.addEventListener('click', () => {
            console.log('[LabTracker] Add Lab Tracker button clicked');
            openLabFormModal();
        });
    } else {
        console.error('[LabTracker] addLabTrackerBtn element not found');
    }

    // Close lab form modal
    elements.closeLabFormModal.addEventListener('click', closeLabFormModal);

    // Lab form submit
    elements.labForm.addEventListener('submit', saveLabRecord);

    // Lab form clear/cancel
    elements.labClearBtn.addEventListener('click', clearLabForm);
    elements.labCancelBtn.addEventListener('click', closeLabFormModal);

    // Lab form delete
    elements.labDeleteBtn.addEventListener('click', async () => {
        const labId = elements.labId.value;
        if (!labId) return;
        await deleteLabRecord(labId);
        closeLabFormModal();
    });

    // Show/hide pending tests field based on status
    elements.labStatus.addEventListener('change', (e) => {
        const pendingSection = document.getElementById('pendingTestsSection');
        if (e.target.value === 'Partial Result Out') {
            pendingSection.classList.remove('hidden');
            document.getElementById('labPendingTests').focus();
        } else {
            pendingSection.classList.add('hidden');
            document.getElementById('labPendingTests').value = '';
        }
    });

    // Lab patient autocomplete
    elements.labPatient.addEventListener('input', (e) => {
        showLabPatientAutocomplete(e.target.value);
        labPatientAutocompleteHighlighted = -1;
    });

    elements.labPatient.addEventListener('focus', (e) => {
        if (e.target.value) showLabPatientAutocomplete(e.target.value);
    });

    elements.labPatient.addEventListener('keydown', (e) => {
        const items = elements.labPatientAutocomplete.querySelectorAll('.autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            labPatientAutocompleteHighlighted = Math.min(labPatientAutocompleteHighlighted + 1, items.length - 1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === labPatientAutocompleteHighlighted);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            labPatientAutocompleteHighlighted = Math.max(labPatientAutocompleteHighlighted - 1, -1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === labPatientAutocompleteHighlighted);
            });
        } else if (e.key === 'Enter' && labPatientAutocompleteHighlighted >= 0) {
            e.preventDefault();
            items[labPatientAutocompleteHighlighted].click();
        } else if (e.key === 'Escape') {
            elements.labPatientAutocomplete.classList.add('hidden');
        }
    });

    // Lab doctor autocomplete
    elements.labDoctor.addEventListener('input', (e) => {
        showLabDoctorAutocomplete(e.target.value);
        labDoctorAutocompleteHighlighted = -1;
    });

    elements.labDoctor.addEventListener('focus', (e) => {
        if (e.target.value) showLabDoctorAutocomplete(e.target.value);
    });

    elements.labDoctor.addEventListener('keydown', (e) => {
        const items = elements.labDoctorAutocomplete.querySelectorAll('.autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            labDoctorAutocompleteHighlighted = Math.min(labDoctorAutocompleteHighlighted + 1, items.length - 1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === labDoctorAutocompleteHighlighted);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            labDoctorAutocompleteHighlighted = Math.max(labDoctorAutocompleteHighlighted - 1, -1);
            items.forEach((item, idx) => {
                item.classList.toggle('highlighted', idx === labDoctorAutocompleteHighlighted);
            });
        } else if (e.key === 'Enter' && labDoctorAutocompleteHighlighted >= 0) {
            e.preventDefault();
            items[labDoctorAutocompleteHighlighted].click();
        } else if (e.key === 'Escape') {
            elements.labDoctorAutocomplete.classList.add('hidden');
        }
    });

    // Lab name input - save to localStorage when changed
    elements.labName.addEventListener('blur', () => {
        const labName = elements.labName.value.trim();
        if (labName) {
            saveLabName(labName);
            populateLabNameDatalist();
            updateLabFilterDropdown();
        }
    });

    // Lab tracker search and filters
    elements.labSearchInput.addEventListener('input', () => filterLabTracker());
    elements.labFilterStatus.addEventListener('change', () => filterLabTracker());
    elements.labFilterLab.addEventListener('change', () => filterLabTracker());
    elements.labFilterDate.addEventListener('change', () => filterLabTracker());

    // Close lab form modal on backdrop click
    elements.labFormModal.addEventListener('click', (e) => {
        if (e.target === elements.labFormModal || e.target.classList.contains('bottom-sheet-backdrop')) {
            closeLabFormModal();
        }
    });

    // Close timeline dialog
    elements.closeTimelineDialog.addEventListener('click', closeTimelineDialog);
    elements.timelineDialog.addEventListener('click', (e) => {
        if (e.target === elements.timelineDialog) closeTimelineDialog();
    });
    
    // Toggle timeline button
    if (elements.toggleTimelineBtn) {
        elements.toggleTimelineBtn.addEventListener('click', toggleTimeline);
    }

    // Close lab result alert
    elements.closeLabResultAlert.addEventListener('click', closeLabResultAlert);
    elements.labResultAlert.addEventListener('click', (e) => {
        if (e.target === elements.labResultAlert) closeLabResultAlert();
    });

    // Click outside to close autocomplete
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            elements.labPatientAutocomplete.classList.add('hidden');
            elements.labDoctorAutocomplete.classList.add('hidden');
        }
    });

    // Setup Pharmacist Corner
    setupPharmacistCornerListeners();

    // ==================== SETTINGS EVENT LISTENERS ====================
    
    // Load appointments button
    elements.loadAppointmentsBtn.addEventListener('click', loadAppointmentsForBookingEditor);
    
    // Save booking changes button
    elements.saveBookingChangesBtn.addEventListener('click', saveBookingChanges);
    
    // Add VIP number button
    elements.addVipNumberBtn.addEventListener('click', addVipNumber);

    // Enter key to add VIP number
    elements.newVipNumber.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addVipNumber();
    });

    // Save default times button
    const saveDefaultTimesBtn = document.getElementById('saveDefaultTimesBtn');
    if (saveDefaultTimesBtn) {
        saveDefaultTimesBtn.addEventListener('click', saveDefaultTimesFromSettings);
    }
}

// ==================== SETTINGS FUNCTIONS ====================

/**
 * Load VIP reserved numbers from state and render
 */
function loadVipReservedNumbers() {
    renderVipNumbersList();
}

/**
 * Render VIP reserved numbers list
 */
function renderVipNumbersList() {
    if (!elements.vipNumbersList) return;
    
    elements.vipNumbersList.innerHTML = vipReservedNumbers
        .sort((a, b) => a - b)
        .map(num => `
            <div class="vip-number-item">
                <span class="vip-number-value">${num}</span>
                <button type="button" class="vip-number-delete" onclick="deleteVipNumber(${num})" title="Delete">&times;</button>
            </div>
        `).join('');
    
    if (vipReservedNumbers.length === 0) {
        elements.vipNumbersList.innerHTML = '<p style="color: #666; font-size: 0.9rem;">No VIP reserved numbers configured.</p>';
    }
}

/**
 * Add a new VIP reserved number
 */
function addVipNumber() {
    const input = elements.newVipNumber;
    const value = parseInt(input.value, 10);
    
    if (isNaN(value) || value < 1 || value > 50) {
        showNotification('Please enter a number between 1 and 50.', 'error');
        return;
    }
    
    if (vipReservedNumbers.includes(value)) {
        showNotification('This number is already in the VIP reserved list.', 'error');
        return;
    }
    
    vipReservedNumbers.push(value);
    vipReservedNumbers.sort((a, b) => a - b);
    
    // Save to localStorage
    localStorage.setItem('twok_clinic_vip_reserved', JSON.stringify(vipReservedNumbers));
    
    input.value = '';
    renderVipNumbersList();
    showNotification(`VIP number ${value} added successfully!`);
}

/**
 * Delete a VIP reserved number
 * @param {number} number - The number to delete
 */
function deleteVipNumber(number) {
    if (!confirm(`Delete VIP reserved number ${number}?`)) return;

    const idx = vipReservedNumbers.indexOf(number);
    if (idx > -1) {
        vipReservedNumbers.splice(idx, 1);
        localStorage.setItem('twok_clinic_vip_reserved', JSON.stringify(vipReservedNumbers));
        renderVipNumbersList();
        showNotification(`VIP number ${number} deleted.`);
    }
}

/**
 * Render default appointment times in Settings
 */
function renderDefaultTimes() {
    const container = document.getElementById('defaultTimesContainer');
    if (!container) return;

    console.log('[Settings] Rendering UI from current defaultAppointmentTimes:', JSON.stringify(defaultAppointmentTimes, null, 2));

    container.innerHTML = DAY_NAMES.map((dayName, dayIndex) => {
        const timeConfig = defaultAppointmentTimes[dayIndex];
        const isWorkingDay = timeConfig !== null;
        
        // Format time for display
        let timeValue = '';
        if (isWorkingDay) {
            const hours = String(timeConfig.hour).padStart(2, '0');
            const minutes = String(timeConfig.minute).padStart(2, '0');
            timeValue = `${hours}:${minutes}`;
        }
        
        return `
            <div class="default-time-card ${!isWorkingDay ? 'non-working-day' : ''}" data-day="${dayIndex}">
                <div class="default-time-day">
                    <span>${dayName}</span>
                    <label class="working-toggle">
                        <input type="checkbox" class="working-day-toggle" data-day="${dayIndex}" ${isWorkingDay ? 'checked' : ''}>
                        <span>${isWorkingDay ? 'Working' : 'Off'}</span>
                    </label>
                </div>
                <div class="default-time-inputs">
                    <input type="time" class="default-time-input" data-day="${dayIndex}" value="${timeValue}" ${!isWorkingDay ? 'disabled' : ''}>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.working-day-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const dayIndex = parseInt(e.target.dataset.day);
            const timeInput = container.querySelector(`.default-time-input[data-day="${dayIndex}"]`);
            const label = e.target.nextElementSibling;
            const card = e.target.closest('.default-time-card');
            
            if (e.target.checked) {
                // Set as working day with default time
                card.classList.remove('non-working-day');
                label.textContent = 'Working';
                timeInput.disabled = false;
                
                // Set default time if empty or use default from constants
                if (!timeInput.value) {
                    const defaultTime = DEFAULT_APPOINTMENT_TIMES_DEFAULT[dayIndex];
                    if (defaultTime) {
                        const hours = String(defaultTime.hour).padStart(2, '0');
                        const minutes = String(defaultTime.minute).padStart(2, '0');
                        timeInput.value = `${hours}:${minutes}`;
                        
                        // Update the actual config
                        defaultAppointmentTimes[dayIndex] = { hour: defaultTime.hour, minute: defaultTime.minute };
                    }
                } else {
                    // Parse and update from existing time input
                    const [hours, minutes] = timeInput.value.split(':').map(Number);
                    defaultAppointmentTimes[dayIndex] = { hour: hours, minute: minutes };
                }
            } else {
                // Set as non-working day
                card.classList.add('non-working-day');
                label.textContent = 'Off';
                timeInput.disabled = true;
                timeInput.value = '';
                
                // Update the actual config to null (non-working day)
                defaultAppointmentTimes[dayIndex] = null;
            }
            
            // Auto-save to localStorage
            saveDefaultAppointmentTimes();
        });
    });

    container.querySelectorAll('.default-time-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const dayIndex = parseInt(e.target.dataset.day);
            const card = e.target.closest('.default-time-card');
            
            if (e.target.value) {
                card.classList.remove('non-working-day');
                
                // Parse and update the actual config
                const [hours, minutes] = e.target.value.split(':').map(Number);
                defaultAppointmentTimes[dayIndex] = { hour: hours, minute: minutes };
                
                // Auto-save to localStorage
                saveDefaultAppointmentTimes();
            } else {
                // If time is cleared, mark as non-working day
                card.classList.add('non-working-day');
                defaultAppointmentTimes[dayIndex] = null;
                saveDefaultAppointmentTimes();
            }
        });
    });
}

/**
 * Save default appointment times from Settings
 * (Changes are auto-saved, this just shows confirmation)
 */
async function saveDefaultTimesFromSettings() {
    // Force re-read from UI and save
    const container = document.getElementById('defaultTimesContainer');
    if (!container) return;

    const newConfig = {};
    
    DAY_NAMES.forEach((dayName, dayIndex) => {
        const checkbox = container.querySelector(`.working-day-toggle[data-day="${dayIndex}"]`);
        const timeInput = container.querySelector(`.default-time-input[data-day="${dayIndex}"]`);
        
        const isWorkingDay = checkbox.checked;
        
        if (isWorkingDay && timeInput.value) {
            // Parse time value (HH:MM)
            const [hours, minutes] = timeInput.value.split(':').map(Number);
            newConfig[dayIndex] = { hour: hours, minute: minutes };
        } else {
            // Non-working day
            newConfig[dayIndex] = null;
        }
    });

    // Update global config
    defaultAppointmentTimes = newConfig;
    console.log('[Settings] Manual save clicked. New config:', JSON.stringify(defaultAppointmentTimes, null, 2));
    
    // Save to localStorage
    await saveDefaultAppointmentTimes();
    
    showNotification('✅ Default appointment times saved successfully!', 'success');
}

/**
 * Load appointments for a specific date in the booking editor
 */
function loadAppointmentsForBookingEditor() {
    const selectedDate = elements.bookingEditorDate.value;
    if (!selectedDate) {
        showNotification('Please select a date.', 'error');
        return;
    }
    
    // Filter appointments for the selected date and doctor
    bookingEditorAppointments = appointments.filter(appt => 
        appt.appointmentTime.startsWith(selectedDate) &&
        appt.doctorName === TARGET_DOCTOR_NAME
    );
    
    // Sort by booking number ascending
    bookingEditorAppointments.sort((a, b) => {
        const aNum = a.bookingNumber !== null && a.bookingNumber !== undefined ? parseInt(a.bookingNumber, 10) : 9999;
        const bNum = b.bookingNumber !== null && b.bookingNumber !== undefined ? parseInt(b.bookingNumber, 10) : 9999;
        return aNum - bNum;
    });
    
    elements.selectedDateDisplay.textContent = selectedDate;
    elements.bookingEditorTableContainer.classList.remove('hidden');
    
    renderBookingEditorTable();
}

/**
 * Render the booking editor table
 */
function renderBookingEditorTable() {
    if (!elements.bookingEditorTableBody) return;
    
    if (bookingEditorAppointments.length === 0) {
        elements.bookingEditorTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 30px; color: #666;">
                    No appointments found for this date.
                </td>
            </tr>
        `;
        return;
    }
    
    elements.bookingEditorTableBody.innerHTML = bookingEditorAppointments.map((appt, index) => {
        const bookingTypeClass = appt.bookingType ? appt.bookingType.toLowerCase() : 'regular';
        const statusClass = appt.status ? appt.status.toLowerCase().replace(' ', '-') : '';
        const arrivalTime = appt.arrivedTime ? formatDateTime(appt.arrivedTime) : '-';
        
        return `
            <tr data-index="${index}">
                <td>
                    <input type="number" 
                           class="booking-number-input" 
                           value="${appt.bookingNumber !== null ? appt.bookingNumber : ''}" 
                           data-index="${index}"
                           min="0"
                           placeholder="-">
                </td>
                <td>${escapeHtml(appt.patientName)}</td>
                <td>${appt.age || '-'}</td>
                <td><span class="booking-type-badge ${bookingTypeClass}">${appt.bookingType || 'Regular'}</span></td>
                <td><span class="status-badge ${statusClass}">${appt.status || '-'}</span></td>
                <td>${arrivalTime}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Save booking number changes
 */
function saveBookingChanges() {
    if (bookingEditorAppointments.length === 0) {
        showNotification('No appointments to save.', 'error');
        return;
    }
    
    const selectedDate = elements.bookingEditorDate.value;
    const inputs = elements.bookingEditorTableBody.querySelectorAll('.booking-number-input');
    const changes = [];
    const usedNumbers = new Set();
    
    // Collect all changes and validate
    inputs.forEach(input => {
        const index = parseInt(input.dataset.index, 10);
        const appt = bookingEditorAppointments[index];
        const newValue = input.value.trim();
        const newNumber = newValue === '' ? null : parseInt(newValue, 10);
        
        // Validate: booking number 0 (Emergency) allows duplicates
        if (newNumber !== null && newNumber !== 0) {
            if (usedNumbers.has(newNumber)) {
                showNotification(`Booking number ${newNumber} is used multiple times. Each number must be unique (except 0 for Emergency).`, 'error');
                throw new Error('Duplicate booking number');
            }
            usedNumbers.add(newNumber);
        }
        
        changes.push({ appt, newNumber });
    });
    
    // Apply changes
    let updated = false;
    changes.forEach(({ appt, newNumber }) => {
        // Find the original appointment in the main appointments array
        const originalIndex = appointments.findIndex(a => a.id === appt.id);
        if (originalIndex > -1 && appointments[originalIndex].bookingNumber !== newNumber) {
            appointments[originalIndex].bookingNumber = newNumber;
            updated = true;
        }
    });
    
    if (updated) {
        saveAppointmentsToStorage();
        renderAppointmentTable();
        updateQueueSummary();
        
        // Broadcast update to TV displays via WebSocket
        sendQueueEvent('queue_update', { appointments: bookingEditorAppointments });
        
        showNotification('Booking numbers updated successfully!');
        
        // Reload the table to reflect changes
        loadAppointmentsForBookingEditor();
    } else {
        showNotification('No changes were made.');
    }
}

// Expose to global scope for inline onclick handlers
window.deleteVipNumber = deleteVipNumber;

// ==================== INSTRUCTION CRUD FUNCTIONS ====================

/**
 * Save instruction
 */
function saveInstruction(e) {
    e.preventDefault();

    const appointmentId = elements.instructAppointmentId.value;
    const patientId = elements.instructPatientId.value;
    const editId = elements.instructAppointmentId.getAttribute('data-edit-id');
    const appt = appointments.find(a => a.id === appointmentId);
    
    if (!appt) {
        showNotification('Appointment not found', 'error');
        return;
    }

    // Build instruction data
    const selectedTests = getSelectedTests();
    
    // Save new doctor if typed and not in list
    const newDoctor = elements.instructNextDoctor.value.trim();
    if (newDoctor && !doctors.some(d => d.name.toLowerCase() === newDoctor.toLowerCase())) {
        doctors.push({
            id: 'D' + String(doctors.length + 1).padStart(4, '0'),
            name: newDoctor,
            speciality: '',
            hospital: '',
            phone: ''
        });
        saveDoctorsToStorage();
        showNotification(`New doctor "${newDoctor}" added successfully!`);
    }
    
    const instructionData = {
        id: editId ? editId : 'I' + Date.now(),
        appointmentId: appointmentId,
        patientId: patientId,
        patientName: appt.patientName,
        age: appt.age,
        phone: appt.phone || appt.patientPhone || '',
        doctorName: appt.doctorName,
        appointmentDate: appt.appointmentTime,
        bookingNumber: appt.bookingNumber,
        generalInstruction: elements.instructGeneralInstruction.value.trim(),
        returnDuration: elements.instructDuration.value ? parseInt(elements.instructDuration.value) : '',
        returnUnit: elements.instructDurationUnit.value,
        nextAppointmentDate: elements.instructNextAppointmentDate.value,
        followUpDoctor: elements.instructNextDoctor.value.trim(),
        otherInstruction: elements.instructOtherType.value,
        transferHospital: elements.instructTransferHospital.value.trim(),
        selectedTests: selectedTests,
        createdTime: editId ? instructions.find(i => i.id === editId)?.createdTime : toLocalISOString(new Date()),
        editedTime: toLocalISOString(new Date())
    };

    if (editId) {
        // Update existing instruction
        const index = instructions.findIndex(i => i.id === editId);
        if (index > -1) {
            instructions[index] = instructionData;
            saveInstructionsToStorage();
            closeInstructionFormPanel();
            renderInstructionTableWithSaved();
            showNotification('Instruction updated successfully!');
            return;
        }
    }

    // New instruction
    instructions.push(instructionData);
    saveInstructionsToStorage();

    closeInstructionFormPanel();
    renderInstructionTableWithSaved();
    
    // Count total instructions for this appointment
    const totalInstructions = instructions.filter(inst => inst.appointmentId === appointmentId).length;
    const message = totalInstructions > 1 
        ? `Instruction saved! (${totalInstructions} total for this patient)` 
        : 'Instruction saved successfully!';
    showNotification(message);

    // Broadcast to calendar view via WebSocket
    sendQueueEvent('instruction_added', instructionData);
    
    // Dispatch custom event for calendar view (if open in same window)
    window.dispatchEvent(new CustomEvent('instruction-saved', {
        detail: instructionData
    }));
    
    // Refresh calendar if visible
    if (!elements.calendarSection.classList.contains('hidden')) {
        refreshCalendar();
    }
}

/**
 * Delete the current instruction being edited
 */
function deleteInstruction() {
    const editId = elements.instructAppointmentId.getAttribute('data-edit-id');
    if (!editId) {
        showNotification('No instruction selected for deletion', 'error');
        return;
    }

    const inst = instructions.find(i => i.id === editId);
    if (!inst) {
        showNotification('Instruction not found', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete this instruction for "${inst.patientName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    // Remove from array
    const index = instructions.findIndex(i => i.id === editId);
    if (index > -1) {
        instructions.splice(index, 1);
        saveInstructionsToStorage();
    }

    closeInstructionFormPanel();
    renderInstructionTableWithSaved();
    showNotification('Instruction deleted successfully!');

    // Refresh calendar if visible
    if (!elements.calendarSection.classList.contains('hidden')) {
        refreshCalendar();
    }
}

// ==================== EXPENSE MODULE ====================

/**
 * Set default date range filter to today
 */
function renderExpenseMonthFilter() {
    if (!elements.expenseDateFrom || !elements.expenseDateTo) {
        console.error('expenseDateFrom or expenseDateTo element not found');
        return;
    }

    // Set default date range to today
    const today = toLocalDateString(new Date());
    elements.expenseDateFrom.value = today;
    elements.expenseDateTo.value = today;

    // Add event listeners to update when dates change
    elements.expenseDateFrom.addEventListener('change', () => {
        renderCategorySummary();
        renderExpenses();
    });
    elements.expenseDateTo.addEventListener('change', () => {
        renderCategorySummary();
        renderExpenses();
    });
}

/**
 * Render expenses table grouped by date
 */
function renderExpenses() {
    console.log('[renderExpenses] Starting render...');
    console.log('[renderExpenses] expenseTableContainer:', elements.expenseTableContainer);
    console.log('[renderExpenses] expenseEmptyMessage:', elements.expenseEmptyMessage);
    console.log('[renderExpenses] expenseTotalCount:', elements.expenseTotalCount);
    
    if (!elements.expenseTableContainer || !elements.expenseEmptyMessage || !elements.expenseTotalCount) {
        console.error('Expense elements not found');
        return;
    }

    console.log('[renderExpenses] Total expenses in array:', expenses.length);

    // Apply date range filter
    let filteredExpenses = [...expenses];
    const from = elements.expenseDateFrom ? elements.expenseDateFrom.value : '';
    const to = elements.expenseDateTo ? elements.expenseDateTo.value : '';
    
    if (from && to) {
        filteredExpenses = expenses.filter(e => {
            const eDate = e.dateTime.split('T')[0];
            return eDate >= from && eDate <= to;
        });
    }

    // Sort by date/time descending
    filteredExpenses.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    elements.expenseTotalCount.textContent = `${filteredExpenses.length} record${filteredExpenses.length !== 1 ? 's' : ''}`;

    if (filteredExpenses.length === 0) {
        elements.expenseTableContainer.innerHTML = '';
        elements.expenseEmptyMessage.classList.remove('hidden');
        return;
    }

    elements.expenseEmptyMessage.classList.add('hidden');

    // Group by date
    const grouped = {};
    filteredExpenses.forEach(exp => {
        const date = exp.dateTime.split('T')[0];
        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(exp);
    });
    
    // Build HTML
    let html = '';
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(date => {
        const dateExpenses = grouped[date];
        const dateTotal = dateExpenses.reduce((sum, e) => sum + parseInt(e.amount), 0);
        const dateObj = new Date(date);
        const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        
        html += `
            <div class="expense-date-group">
                <div class="expense-date-header">
                    <span class="expense-date-title">${dateLabel}</span>
                    <span class="expense-date-subtotal">Total: ${formatCurrency(dateTotal)}</span>
                </div>
                <table class="expense-date-table">
                    <thead>
                        <tr>
                            <th style="width: 25%;">Category</th>
                            <th style="width: 40%;">Remark</th>
                            <th style="width: 15%; text-align: right;">Amount</th>
                            <th style="width: 5%; text-align: center;">Note</th>
                            <th style="width: 15%; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dateExpenses.map(exp => {
                            // Build category display: category + doctor name if available
                            let categoryDisplay = escapeHtml(exp.category);
                            if (exp.doctor_name) {
                                categoryDisplay += `<br><small style="color: #6b7280;">(${escapeHtml(exp.doctor_name)})</small>`;
                            }

                            // Build remark display: item name (bold) + patient name
                            let remarkDisplay = '-';
                            const itemName = exp.item_name || exp.remark || '';
                            const patientName = exp.patientName || '';

                            if (itemName || patientName) {
                                let parts = [];

                                // Item name (bold)
                                if (itemName) {
                                    parts.push(`<strong>${escapeHtml(itemName)}</strong>`);
                                }

                                // Patient name (in parentheses)
                                if (patientName) {
                                    parts.push(`(${escapeHtml(patientName)})`);
                                }

                                remarkDisplay = parts.join('<br>');
                            }

                            // Note indicator button
                            let noteCell = '';
                            if (exp.note) {
                                noteCell = `<td class="expense-note" style="text-align: center;"><button type="button" class="btn-note-indicator" onclick="event.stopPropagation(); showExpenseNote('${exp.id}')" title="View Note">📝</button></td>`;
                            } else {
                                noteCell = `<td class="expense-note" style="text-align: center;"></td>`;
                            }

                            return `
                                <tr data-id="${exp.id}">
                                    <td class="expense-category">${categoryDisplay}</td>
                                    <td class="expense-remark">${remarkDisplay}</td>
                                    <td class="expense-amount" style="text-align: right;">${formatCurrency(exp.amount)}</td>
                                    ${noteCell}
                                    <td class="expense-actions" style="text-align: right;">
                                        <button type="button" class="btn btn-edit btn-sm" onclick="event.stopPropagation(); openEditExpense('${exp.id}')">Edit</button>
                                        <button type="button" class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteExpense('${exp.id}')">Delete</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    console.log('[renderExpenses] Setting innerHTML with', Object.keys(grouped).length, 'date groups');
    elements.expenseTableContainer.innerHTML = html;
    console.log('[renderExpenses] Render complete!');
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return 'MMK 0';
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'MMK', minimumFractionDigits: 0 }).format(amount);
}

/**
 * Render category summary
 */
function renderCategorySummary() {
    if (!elements.categorySummaryContainer) {
        console.error('categorySummaryContainer element not found');
        return;
    }

    const dateFrom = elements.expenseDateFrom ? elements.expenseDateFrom.value : '';
    const dateTo = elements.expenseDateTo ? elements.expenseDateTo.value : '';
    
    if (!dateFrom || !dateTo) {
        elements.categorySummaryContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Select a date range to view summary</p>';
        return;
    }

    const filteredExpenses = expenses.filter(e => {
        const eDate = e.dateTime.split('T')[0];
        return eDate >= dateFrom && eDate <= dateTo;
    });

    if (filteredExpenses.length === 0) {
        elements.categorySummaryContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No expenses for this date range</p>';
        return;
    }

    // Calculate totals by category
    const categoryTotals = {};
    let grandTotal = 0;

    filteredExpenses.forEach(exp => {
        const amount = parseInt(exp.amount);
        categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + amount;
        grandTotal += amount;
    });

    // Build summary HTML
    let html = '';
    Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, total]) => {
            const percent = ((total / grandTotal) * 100).toFixed(1);
            html += `
                <div class="category-summary-item" onclick="showCategoryDetails('${category}', '${dateFrom}', '${dateTo}')">
                    <span class="category-summary-name">${escapeHtml(category)}</span>
                    <div class="category-summary-bar">
                        <div class="category-summary-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="category-summary-amount">${formatCurrency(total)}</span>
                    <span class="category-summary-percent">${percent}%</span>
                </div>
            `;
        });

    elements.categorySummaryContainer.innerHTML = html;
}

/**
 * Show category details dialog
 */
function showCategoryDetails(category, dateFrom, dateTo) {
    const categoryExpenses = expenses.filter(e => {
        const eDate = e.dateTime.split('T')[0];
        return e.category === category && eDate >= dateFrom && eDate <= dateTo;
    });

    if (categoryExpenses.length === 0) {
        showNotification('No expenses found for this category', 'error');
        return;
    }

    // Sort by date descending
    categoryExpenses.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    // Group by date
    const grouped = {};
    categoryExpenses.forEach(exp => {
        const date = exp.dateTime.split('T')[0];
        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(exp);
    });

    const fromDate = new Date(dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const toDate = new Date(dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    elements.categoryDetailsTitle.textContent = `${category} - ${fromDate} to ${toDate}`;
    
    let html = '';
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(date => {
        const dateExpenses = grouped[date];
        const dateTotal = dateExpenses.reduce((sum, e) => sum + parseInt(e.amount), 0);
        const dateLabel = new Date(date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        
        html += `
            <div class="category-details-group">
                <div class="category-details-date">${dateLabel}</div>
                <ul class="category-details-list">
                    ${dateExpenses.map(exp => `
                        <li class="category-details-item">
                            <span>${escapeHtml(exp.remark || '-')}</span>
                            <span>${formatCurrency(exp.amount)}</span>
                        </li>
                    `).join('')}
                </ul>
                <div class="category-details-subtotal">Subtotal: ${formatCurrency(dateTotal)}</div>
            </div>
        `;
    });
    
    elements.categoryDetailsContent.innerHTML = html;
    elements.categoryDetailsDialog.classList.remove('hidden');
}

/**
 * Close category details dialog
 */
function closeCategoryDetailsDialog() {
    elements.categoryDetailsDialog.classList.add('hidden');
}

/**
 * Open edit expense
 */
function openEditExpense(expenseId) {
    const exp = expenses.find(e => e.id === expenseId);
    if (!exp) {
        showNotification('Expense not found', 'error');
        return;
    }

    // Use global expense form component for editing
    if (window.expenseForm) {
        window.expenseForm.edit(exp);
    }
}

/**
 * Delete expense
 */
async function deleteExpense(expenseId) {
    const exp = expenses.find(e => e.id === expenseId);
    if (!exp) return;

    if (!confirm(`Are you sure you want to delete this expense?\n\nCategory: ${exp.category}\nAmount: ${formatCurrency(exp.amount)}`)) return;

    const idx = expenses.findIndex(e => e.id === expenseId);
    if (idx > -1) {
        // Remove from IndexedDB
        try {
            if (window.TWOKDB) {
                await TWOKDB.remove(TWOKDB.STORES.EXPENSES, expenseId);
            }
        } catch (error) {
            console.error('[deleteExpense] Failed to delete from IndexedDB:', error);
            showNotification('⚠️ Failed to delete expense from database', 'error');
            return;
        }

        // Remove from expenses array
        expenses.splice(idx, 1);
        window.expenses = expenses; // Update global reference

        renderExpenses();
        renderCategorySummary();
        showNotification('Expense deleted successfully!');
    }
}

/**
 * Show expense note in a popup
 */
function showExpenseNote(expenseId) {
    const exp = expenses.find(e => e.id === expenseId);
    if (!exp || !exp.note) return;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'expense-note-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'expense-note-modal';
    modal.style.cssText = `
        background-color: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        animation: slideUp 0.3s ease;
    `;

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; font-size: 18px; color: #1f2937;">📝 Expense Note</h3>
            <button type="button" onclick="this.closest('.expense-note-overlay').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
        <div style="margin-bottom: 12px; padding: 12px; background-color: #f9fafb; border-radius: 8px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Expense</div>
            <div style="font-weight: 600; color: #1f2937;">${escapeHtml(exp.category)} - ${formatCurrency(exp.amount)}</div>
            ${exp.patientName ? `<div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Patient: ${escapeHtml(exp.patientName)}</div>` : ''}
            ${exp.doctor_name ? `<div style="font-size: 14px; color: #6b7280;">Doctor: ${escapeHtml(exp.doctor_name)}</div>` : ''}
        </div>
        <div style="padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
            <div style="font-size: 14px; line-height: 1.6; color: #92400e; white-space: pre-wrap;">${escapeHtml(exp.note)}</div>
        </div>
        <div style="margin-top: 16px; text-align: right;">
            <button type="button" onclick="this.closest('.expense-note-overlay').remove()" style="padding: 8px 20px; background-color: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Close</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });

    // Close on Escape key
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// ==================== LAB TRACKER MODULE ====================

/**
 * Generate Lab ID
 */
function generateLabId() {
    if (labRecords.length === 0) {
        return 'L0000001';
    }
    const maxId = labRecords.reduce((max, lab) => {
        const labId = lab.labId || lab.id || '';
        const num = parseInt(labId.replace('L', ''), 10);
        return num > max ? num : max;
    }, 0);
    return `L${String(maxId + 1).padStart(7, '0')}`;
}

/**
 * Get status class for lab tracker
 */
function getLabStatusClass(status) {
    const statusMap = {
        'Sent to Lab': 'status-sent-to-lab',
        'Partial Result Out': 'status-partial-result',
        'Complete Result Out': 'status-complete-result',
        'Inform to Doctor': 'status-inform-doctor',
        'Inform to Patient': 'status-inform-patient',
        'Patient Received': 'status-patient-received'
    };
    return statusMap[status] || 'status-sent-to-lab';
}

/**
 * Render Lab Tracker table
 */
function renderLabTracker(filteredLabs = null) {
    const data = filteredLabs !== null ? filteredLabs : labRecords;
    elements.labRecordCount.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;

    if (data.length === 0) {
        elements.labTrackerTableBody.innerHTML = '';
        elements.labEmptyMessage.classList.remove('hidden');
        elements.labTrackerTable.classList.add('hidden');
        return;
    }

    elements.labEmptyMessage.classList.add('hidden');
    elements.labTrackerTable.classList.remove('hidden');

    // Sort by date/time descending (latest first)
    const sortedData = [...data].sort((a, b) => {
        const aTime = a.dateTime ? new Date(a.dateTime).getTime() : 0;
        const bTime = b.dateTime ? new Date(b.dateTime).getTime() : 0;
        return bTime - aTime;
    });

    elements.labTrackerTableBody.innerHTML = sortedData.map(lab => {
        // Check if this lab has a follow-up instruction
        const hasFollowUp = instructions.some(inst => 
            inst.patientId === lab.patientId && 
            inst.otherInstruction === 'After Results'
        );
        const followUpIndicator = hasFollowUp && lab.status === 'Complete Result Out' 
            ? '<span title="Doctor requested follow-up after results" style="margin-left: 5px;">🔔</span>' 
            : '';

        return `
            <tr data-id="${lab.labId}">
                <td><strong>${escapeHtml(lab.labId)}</strong></td>
                <td>${escapeHtml(lab.patientName)}${followUpIndicator}</td>
                <td>${escapeHtml(lab.doctorName)}</td>
                <td>${escapeHtml(lab.labName)}</td>
                <td style="text-align: right;">${formatCurrency(lab.amount)}</td>
                <td><span class="status-badge-lab ${getLabStatusClass(lab.status)}">${lab.status}</span></td>
                <td>${lab.dateTime ? formatDateTime(lab.dateTime) : '-'}</td>
                <td>
                    <div class="lab-actions">
                        <button type="button" class="btn btn-timeline btn-sm" onclick="showTimeline('${lab.labId}')" title="View Timeline">📅 Timeline</button>
                        <button type="button" class="btn btn-edit btn-sm" onclick="editLabRecord('${lab.labId}')" title="Edit">Edit</button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="deleteLabRecord('${lab.labId}')" title="Delete">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Check for follow-up alerts when rendering
    // checkAndShowFollowUpAlerts(); // Disabled - alerts handled by calendar view
}

/**
 * Check and show follow-up alerts for labs with complete results
 */
function checkAndShowFollowUpAlerts() {
    const alerts = [];

    labRecords.forEach(lab => {
        if (lab.status === 'Complete Result Out' && !lab.patientReceived) {
            // Check if there's an instruction for "After Results"
            const hasFollowUpInstruction = instructions.some(inst =>
                inst.patientId === lab.patientId &&
                inst.otherInstruction === 'After Results'
            );

            if (hasFollowUpInstruction) {
                alerts.push({
                    labId: lab.labId,
                    patientName: lab.patientName,
                    doctorName: lab.doctorName,
                    labName: lab.labName,
                    resultDate: lab.timeline.completeResult
                });
            }
        }
    });

    // Show alert for first pending follow-up (could be enhanced to show all)
    if (alerts.length > 0) {
        // Only show one alert at a time to avoid overwhelming the user
        const alert = alerts[0];
        showLabResultAlert(alert);
    }
}

/**
 * Update pending results alert
 */
function updatePendingResultsAlert() {
    // Count labs with "Complete Result Out" status but patient hasn't received
    const pendingCount = labRecords.filter(lab =>
        lab.status === 'Complete Result Out' ||
        lab.status === 'Partial Result Out' ||
        lab.status === 'Inform to Doctor' ||
        lab.status === 'Inform to Patient'
    ).length;

    if (pendingCount > 0) {
        elements.pendingResultsAlert.classList.remove('hidden');
        elements.pendingResultsCount.textContent = pendingCount;
    } else {
        elements.pendingResultsAlert.classList.add('hidden');
    }
}

/**
 * Filter lab tracker
 */
function filterLabTracker() {
    const searchTerm = elements.labSearchInput.value.toLowerCase().trim();
    const statusFilter = elements.labFilterStatus.value;
    const labFilter = elements.labFilterLab.value;
    const dateFilter = elements.labFilterDate.value;

    let filtered = [...labRecords];

    // Filter by search term
    if (searchTerm) {
        filtered = filtered.filter(lab =>
            lab.patientName.toLowerCase().includes(searchTerm) ||
            lab.doctorName.toLowerCase().includes(searchTerm)
        );
    }

    // Filter by status
    if (statusFilter) {
        filtered = filtered.filter(lab => lab.status === statusFilter);
    }

    // Filter by lab name
    if (labFilter) {
        filtered = filtered.filter(lab => lab.labName === labFilter);
    }

    // Filter by date
    if (dateFilter) {
        filtered = filtered.filter(lab => lab.dateTime && lab.dateTime.startsWith(dateFilter));
    }

    renderLabTracker(filtered);
}

// ==================== PHARMACIST CORNER ====================
let pharmacistCurrentFilter = 'all';
let pharmacistSearchTerm = '';

/**
 * Check if an appointment has an instruction
 * @param {string} appointmentId - The appointment ID to check
 * @returns {boolean}
 */
function appointmentHasInstruction(appointmentId) {
    return instructions.some(inst => 
        inst.appointmentId === appointmentId || 
        inst.appointment_id === appointmentId
    );
}

/**
 * Check if an appointment has an expense
 * @param {string} appointmentId - The appointment ID to check
 * @returns {boolean}
 */
function appointmentHasExpense(appointmentId) {
    return expenses.some(exp =>
        exp.appointment_id === appointmentId ||
        exp.appointmentId === appointmentId
    );
}

/**
 * Get count of expenses for an appointment
 */
function getAppointmentExpenseCount(appointmentId) {
    return expenses.filter(exp =>
        exp.appointment_id === appointmentId ||
        exp.appointmentId === appointmentId
    ).length;
}

/**
 * Render Pharmacist Corner
 */
function renderPharmacistCorner() {
    const today = toLocalDateString(new Date());

    // Get today's completed appointments (status = 'Done')
    const todayAppointments = appointments.filter(appt => {
        const apptDate = appt.appointmentTime ? appt.appointmentTime.split('T')[0] : '';
        return apptDate === today && appt.status === 'Done';
    });

    // Calculate statistics
    const totalPatients = todayAppointments.length;
    let pendingCount = 0;
    let completedCount = 0;

    todayAppointments.forEach(appt => {
        const apptId = appt.id || appt.appointment_id;
        const hasInstruction = appointmentHasInstruction(apptId);
        const hasExpense = appointmentHasExpense(apptId);

        if (hasInstruction && hasExpense) {
            completedCount++;
        } else {
            pendingCount++;
        }
    });

    // Update statistics
    elements.pharmacistTotalPatients.textContent = totalPatients;
    elements.pharmacistPendingCount.textContent = pendingCount;
    elements.pharmacistCompletedCount.textContent = completedCount;
    elements.pharmacistQueuedCount.textContent = 0; // No sync queue

    // Filter appointments based on search and filter
    let filteredAppointments = todayAppointments;

    // Apply search filter
    if (pharmacistSearchTerm) {
        filteredAppointments = filteredAppointments.filter(appt => {
            const patientName = (appt.patient_name || appt.patientName || '').toLowerCase();
            const bookingNumber = (appt.booking_number || appt.bookingNumber || '').toString();
            return patientName.includes(pharmacistSearchTerm.toLowerCase()) ||
                   bookingNumber.includes(pharmacistSearchTerm);
        });
    }

    // Apply status filter
    if (pharmacistCurrentFilter === 'pending') {
        filteredAppointments = filteredAppointments.filter(appt => {
            const apptId = appt.id || appt.appointment_id;
            const hasInstruction = appointmentHasInstruction(apptId);
            const hasExpense = appointmentHasExpense(apptId);
            return !(hasInstruction && hasExpense);
        });
    } else if (pharmacistCurrentFilter === 'completed') {
        filteredAppointments = filteredAppointments.filter(appt => {
            const apptId = appt.id || appt.appointment_id;
            const hasInstruction = appointmentHasInstruction(apptId);
            const hasExpense = appointmentHasExpense(apptId);
            return hasInstruction && hasExpense;
        });
    }

    // Show/hide empty state
    if (filteredAppointments.length === 0) {
        elements.pharmacistCardsContainer.innerHTML = '';
        if (todayAppointments.length === 0) {
            elements.pharmacistEmptyState.classList.remove('hidden');
            elements.pharmacistNoResultsMessage.classList.add('hidden');
        } else {
            elements.pharmacistEmptyState.classList.add('hidden');
            elements.pharmacistNoResultsMessage.classList.remove('hidden');
        }
        return;
    }

    elements.pharmacistEmptyState.classList.add('hidden');
    elements.pharmacistNoResultsMessage.classList.add('hidden');

    // Render patient cards
    elements.pharmacistCardsContainer.innerHTML = filteredAppointments.map(appt => {
        const apptId = appt.id || appt.appointment_id;
        const hasInstruction = appointmentHasInstruction(apptId);
        const expenseCount = getAppointmentExpenseCount(apptId);
        const isCompleted = hasInstruction;
        const statusClass = isCompleted ? 'completed' : 'pending';
        const statusLabel = isCompleted ? '✓ Completed' : '⏳ Pending';
        const statusBadgeClass = isCompleted ? 'pharmacist-completed' : 'pharmacist-pending';

        const patientName = appt.patient_name || appt.patientName || 'Unknown';
        const doctorName = appt.doctor_name || appt.doctorName || 'Unknown';
        const bookingNumber = appt.booking_number || appt.bookingNumber || '-';
        const age = appt.age || appt.patient_age || appt.patientAge || '-';

        return `
            <div class="pharmacist-card ${statusClass}" data-appointment-id="${appt.id || appt.appointment_id}">
                <div class="pharmacist-card-header">
                    <div>
                        <div class="pharmacist-card-title">${escapeHtml(patientName)}</div>
                        <div class="pharmacist-card-booking">Booking #${escapeHtml(bookingNumber)}</div>
                    </div>
                    <span class="status-badge ${statusBadgeClass}">${statusLabel}</span>
                </div>
                <div class="pharmacist-card-body">
                    <div class="pharmacist-info-row">
                        <span class="pharmacist-info-label">Age:</span>
                        <span class="pharmacist-info-value">${escapeHtml(age)}</span>
                    </div>
                    <div class="pharmacist-info-row">
                        <span class="pharmacist-info-label">Doctor:</span>
                        <span class="pharmacist-info-value">${escapeHtml(doctorName)}</span>
                    </div>
                    <div class="pharmacist-info-row">
                        <span class="pharmacist-info-label">Instruction:</span>
                        <span class="pharmacist-info-value">${hasInstruction ? '✓ Recorded' : '❌ Not Recorded'}</span>
                    </div>
                    <div class="pharmacist-info-row">
                        <span class="pharmacist-info-label">Expense:</span>
                        <span class="pharmacist-info-value">${expenseCount > 0 ? `${expenseCount} recorded` : '❌ Not Recorded'}</span>
                    </div>
                </div>
                <div class="pharmacist-card-actions">
                    <button type="button" class="btn btn-primary" onclick="openInstructionFromPharmacist('${appt.id || appt.appointment_id}')">
                        ${hasInstruction ? '✏️ Edit Instruction' : '📝 Instruction'}
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="openExpenseFromPharmacist('${appt.id || appt.appointment_id}')">
                        ${expenseCount > 0 ? `💰 Add Expense (${expenseCount})` : '💰 Expense'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Open instruction form from pharmacist corner
 */
function openInstructionFromPharmacist(appointmentId) {
    const appointment = appointments.find(appt => appt.id === appointmentId || appt.appointment_id === appointmentId);
    if (!appointment) {
        showNotification('Appointment not found', 'error');
        return;
    }

    // Check if instruction already exists - if so, edit it
    const existingInstruction = instructions.find(inst =>
        inst.appointmentId === appointmentId || inst.appointment_id === appointmentId
    );
    if (existingInstruction) {
        editInstruction(existingInstruction.id);
        return;
    }

    // New instruction - populate patient info
    elements.instructAppointmentId.value = appointmentId;
    elements.instructPatientId.value = appointment.patient_id || '';
    elements.instructPatientName.value = appointment.patient_name || appointment.patientName || '';
    elements.instructPatientAge.value = appointment.age || appointment.patient_age || appointment.patientAge || '-';
    elements.instructDoctorName.value = appointment.doctor_name || appointment.doctorName || '';

    // Format appointment date with proper error handling
    let appointmentDateDisplay = '-';
    const apptDateSource = appointment.appointment_time || appointment.appointmentTime;
    if (apptDateSource) {
        try {
            const apptDate = new Date(apptDateSource);
            if (!isNaN(apptDate.getTime())) {
                appointmentDateDisplay = apptDate.toLocaleDateString();
            }
        } catch (e) {
            console.warn('Error parsing appointment date in openInstructionFromPharmacist:', e);
        }
    }
    elements.instructAppointmentDate.value = appointmentDateDisplay;

    // Get booking number with proper fallback
    const bookingNum = (appointment.bookingNumber !== null && appointment.bookingNumber !== undefined)
        ? appointment.bookingNumber
        : ((appointment.booking_number !== null && appointment.booking_number !== undefined) ? appointment.booking_number : '-');
    elements.instructBookingNumber.value = bookingNum;

    // Reset form fields
    elements.instructGeneralInstruction.value = '';
    elements.instructDuration.value = '';
    elements.instructDurationUnit.value = 'Days';
    elements.instructNextAppointmentDate.value = '';
    elements.instructNextDoctor.value = '';
    elements.instructOtherType.value = '';
    elements.instructTransferHospital.value = '';
    elements.instructCustomTest.value = '';
    elements.customTestGroup.classList.add('hidden');

    // Populate doctor datalist
    elements.doctorDatalist.innerHTML = '';
    doctors.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.name;
        elements.doctorDatalist.appendChild(option);
    });

    // Populate custom test datalist with saved custom tests
    const allTests = instructions.flatMap(i => i.selectedTests || []);
    const predefinedTests = ['Blood Test', 'C&S Results', 'USG', 'Echo', 'ECG', 'Xray', 'CT', 'MRI', 'Other'];
    const customTests = [...new Set(allTests.filter(t => !predefinedTests.includes(t)))];
    elements.customTestDatalist.innerHTML = '';
    customTests.forEach(test => {
        const option = document.createElement('option');
        option.value = test;
        elements.customTestDatalist.appendChild(option);
    });

    // Remove edit ID if exists
    elements.instructAppointmentId.removeAttribute('data-edit-id');

    // Toggle test selection visibility
    toggleTestSelection();

    // Show slide panel
    elements.instructionFormPanel.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Open expense form from pharmacist corner
 */
function openExpenseFromPharmacist(appointmentId) {
    const appointment = appointments.find(appt => appt.id === appointmentId || appt.appointment_id === appointmentId);
    if (!appointment) {
        showNotification('Appointment not found', 'error');
        return;
    }

    // Use global expense form component
    if (window.expenseForm) {
        window.expenseForm.show(appointment);
    } else {
        // Fallback to legacy expense form
        openExpenseForm(appointmentId);
    }
}

/**
 * Setup pharmacist corner event listeners
 */
function setupPharmacistCornerListeners() {
    // Search input
    if (elements.pharmacistSearchInput) {
        elements.pharmacistSearchInput.addEventListener('input', (e) => {
            pharmacistSearchTerm = e.target.value.trim();
            renderPharmacistCorner();
        });
    }

    // Filter buttons
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            pharmacistCurrentFilter = e.target.dataset.filter;
            renderPharmacistCorner();
        });
    });

    // Listen for instruction/expense saved events
    window.addEventListener('instruction-saved', () => {
        renderPharmacistCorner();
    });

    window.addEventListener('expense-saved', (e) => {
        renderPharmacistCorner();
        
        // Update expenses array and re-render Expenses tab
        const expenseData = e.detail;
        if (expenseData) {
            const existingIdx = expenses.findIndex(exp => exp.id === expenseData.id);
            if (existingIdx > -1) {
                // Update existing expense
                expenses[existingIdx] = { ...expenses[existingIdx], ...expenseData };
            } else {
                // Add new expense
                expenses.push(expenseData);
            }
            
            // Save and re-render
            saveExpensesToStorage();
            renderExpenses();
            renderCategorySummary();
        }
    });
}


/**
 * Show lab form modal
 */
function openLabFormModal() {
    console.log('[LabTracker] Opening lab form modal...');
    if (!elements.labFormModal) {
        console.error('[LabTracker] labFormModal element not found');
        showNotification('Lab form not available', 'error');
        return;
    }

    // Populate lab name datalist and update filter
    populateLabNameDatalist();
    updateLabFilterDropdown();

    elements.labFormModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    console.log('[LabTracker] Lab form modal opened');

    // Focus on Patient Name field after modal opens
    setTimeout(() => {
        if (elements.labPatient) {
            elements.labPatient.focus();
        }
    }, 100);
}

/**
 * Close lab form modal
 */
function closeLabFormModal() {
    elements.labFormModal.classList.add('hidden');
    elements.labPatientAutocomplete.classList.add('hidden');
    elements.labDoctorAutocomplete.classList.add('hidden');
    document.body.style.overflow = '';
    resetLabForm();
}

/**
 * Reset lab form
 */
function resetLabForm() {
    elements.labForm.reset();
    elements.labEditIndex.value = '';
    elements.labId.value = '';
    elements.labPatientId.value = '';
    elements.labDoctorId.value = '';
    elements.labFormTitle.textContent = 'Add Lab Tracker';
    elements.labSaveBtnText.textContent = 'Save Lab Record';
    elements.labDeleteBtn.style.display = 'none';

    // Hide pending tests section and clear field
    const pendingSection = document.getElementById('pendingTestsSection');
    pendingSection.classList.add('hidden');
    document.getElementById('labPendingTests').value = '';

    // Set default datetime to now
    const now = new Date();
    elements.labDateTime.value = toLocalISOString(now).slice(0, 16);

    elements.labPatient.focus();
}

/**
 * Clear lab form
 */
function clearLabForm() {
    resetLabForm();
    elements.labPatient.focus();
}

/**
 * Show patient autocomplete in lab form
 */
function showLabPatientAutocomplete(searchTerm) {
    console.log('[LabAutocomplete] showLabPatientAutocomplete called with:', searchTerm);
    console.log('[LabAutocomplete] patients array length:', patients.length);
    
    if (!searchTerm || searchTerm.length < 1) {
        elements.labPatientAutocomplete.classList.add('hidden');
        return;
    }

    const term = searchTerm.toLowerCase();
    const matches = patients.filter(p => p.name.toLowerCase().includes(term)).slice(0, 10);
    
    console.log('[LabAutocomplete] matches found:', matches.length);

    if (matches.length === 0) {
        elements.labPatientAutocomplete.innerHTML = `
            <div class="autocomplete-item">
                <div class="autocomplete-item-primary">No patient found</div>
            </div>
        `;
        elements.labPatientAutocomplete.classList.remove('hidden');
        return;
    }

    elements.labPatientAutocomplete.innerHTML = matches.map((p, idx) => `
        <div class="autocomplete-item" data-index="${idx}" data-id="${p.id}">
            <div class="autocomplete-item-primary">${escapeHtml(p.name)}</div>
            <div class="autocomplete-item-secondary">${escapeHtml(p.age)} — ${escapeHtml(p.phone)}</div>
        </div>
    `).join('');

    elements.labPatientAutocomplete.classList.remove('hidden');
    positionAutocomplete(elements.labPatientAutocomplete, elements.labPatientAutocomplete.parentElement);

    elements.labPatientAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            if (id) {
                selectLabPatient(id);
            }
        });
    });
}

/**
 * Select patient in lab form
 */
function selectLabPatient(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;

    elements.labPatient.value = patient.name;
    elements.labPatientId.value = patient.id;
    elements.labPatientAutocomplete.classList.add('hidden');
    elements.labDoctor.focus();
}

/**
 * Show doctor autocomplete in lab form
 */
function showLabDoctorAutocomplete(searchTerm) {
    if (!searchTerm || searchTerm.length < 1) {
        elements.labDoctorAutocomplete.classList.add('hidden');
        return;
    }

    const term = searchTerm.toLowerCase();
    const matches = doctors.filter(d => d.name.toLowerCase().includes(term)).slice(0, 10);

    if (matches.length === 0) {
        elements.labDoctorAutocomplete.innerHTML = `
            <div class="autocomplete-item">
                <div class="autocomplete-item-primary">No doctor found</div>
            </div>
        `;
        elements.labDoctorAutocomplete.classList.remove('hidden');
        return;
    }

    elements.labDoctorAutocomplete.innerHTML = matches.map((d, idx) => `
        <div class="autocomplete-item" data-index="${idx}" data-name="${escapeHtml(d.name)}">
            <div class="autocomplete-item-primary">${escapeHtml(d.name)}</div>
            <div class="autocomplete-item-secondary">${escapeHtml(d.speciality || '-')} — ${escapeHtml(d.hospital || '-')}</div>
        </div>
    `).join('');

    elements.labDoctorAutocomplete.classList.remove('hidden');
    positionAutocomplete(elements.labDoctorAutocomplete, elements.labDoctorAutocomplete.parentElement);

    elements.labDoctorAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.name;
            if (name) {
                elements.labDoctor.value = name;
                elements.labDoctorId.value = name;
                elements.labDoctorAutocomplete.classList.add('hidden');
                elements.labName.focus();
            }
        });
    });
}

/**
 * Edit lab record
 */
function editLabRecord(labId) {
    const lab = labRecords.find(l => l.labId === labId);
    if (!lab) return;

    const index = labRecords.findIndex(l => l.labId === labId);

    elements.labEditIndex.value = index;
    elements.labId.value = lab.labId;
    elements.labPatient.value = lab.patientName;
    elements.labPatientId.value = lab.patientId || '';
    elements.labDoctor.value = lab.doctorName;
    elements.labDoctorId.value = lab.doctorId || '';
    elements.labName.value = lab.labName;
    elements.labAmount.value = lab.amount;
    elements.labStatus.value = lab.status;
    elements.labDateTime.value = lab.dateTime ? lab.dateTime.slice(0, 16) : '';

    // Populate pending tests field
    const pendingTestsField = document.getElementById('labPendingTests');
    const pendingSection = document.getElementById('pendingTestsSection');
    if (lab.status === 'Partial Result Out' && lab.pendingTests) {
        pendingTestsField.value = lab.pendingTests;
        pendingSection.classList.remove('hidden');
    } else {
        pendingTestsField.value = '';
        pendingSection.classList.add('hidden');
    }

    elements.labFormTitle.textContent = 'Edit Lab Record';
    elements.labSaveBtnText.textContent = 'Update Lab Record';
    elements.labDeleteBtn.style.display = 'inline-block';

    openLabFormModal();
    elements.labPatient.focus();
}

/**
 * Delete lab record
 */
async function deleteLabRecord(labId) {
    const lab = labRecords.find(l => l.labId === labId);
    if (!lab) return;

    if (!confirm(`Are you sure you want to delete lab record ${labId} for ${lab.patientName}?`)) return;

    const index = labRecords.findIndex(l => l.labId === labId);
    if (index > -1) {
        labRecords.splice(index, 1);
        
        // Save to in-memory array
        saveLabRecordsToStorage();
        
        // Delete from IndexedDB
        try {
            await TWOKDB.bulkRemove(TWOKDB.STORES.LAB_TRACKER, [labId]);
            console.log(`[LabTracker] Deleted lab record ${labId} from IndexedDB`);
        } catch (err) {
            console.error('[LabTracker] Failed to delete from IndexedDB:', err);
        }
        
        renderLabTracker();
        updatePendingResultsAlert();
        showNotification('Lab record deleted successfully!');
    }
}

/**
 * Save lab record
 */
function saveLabRecord(e) {
    e.preventDefault();

    const patientName = elements.labPatient.value.trim();
    const doctorName = elements.labDoctor.value.trim();
    const labName = elements.labName.value.trim();
    const amount = elements.labAmount.value.trim();
    const status = elements.labStatus.value.trim();
    const dateTime = elements.labDateTime.value;
    const pendingTests = document.getElementById('labPendingTests').value.trim();

    if (!patientName) { showNotification('Patient name is required', 'error'); elements.labPatient.focus(); return; }
    if (!doctorName) { showNotification('Doctor name is required', 'error'); elements.labDoctor.focus(); return; }
    if (!labName) { showNotification('Lab name is required', 'error'); elements.labName.focus(); return; }
    if (!amount) { showNotification('Amount is required', 'error'); elements.labAmount.focus(); return; }
    if (!status) { showNotification('Status is required', 'error'); elements.labStatus.focus(); return; }
    if (!dateTime) { showNotification('Date & Time is required', 'error'); elements.labDateTime.focus(); return; }
    
    // Validate pending tests for Partial Result Out status
    if (status === 'Partial Result Out' && !pendingTests) {
        showNotification('Please enter which test results are still pending', 'error');
        document.getElementById('labPendingTests').focus();
        return;
    }

    // Save new lab name if not exists
    saveLabName(labName);

    const labId = elements.labId.value || generateLabId();
    const patientId = elements.labPatientId.value;
    const doctorId = elements.labDoctorId.value;

    const labData = {
        id: labId, // Required for IndexedDB keyPath
        labId: labId,
        patientId: patientId,
        patientName: patientName,
        doctorId: doctorId,
        doctorName: doctorName,
        labName: labName,
        amount: parseInt(amount),
        status: status,
        dateTime: dateTime,
        pendingTests: status === 'Partial Result Out' ? pendingTests : null,
        timeline: buildTimeline(status, dateTime)
    };

    const editIndex = parseInt(elements.labEditIndex.value, 10);
    if (!isNaN(editIndex) && editIndex >= 0 && editIndex < labRecords.length) {
        // Update existing - preserve original timeline
        labData.timeline = { ...labRecords[editIndex].timeline };
        // Update timeline based on status change
        updateLabTimeline(labData.timeline, status, dateTime);
        // Preserve pending tests if not changing away from Partial Result Out
        if (status !== 'Partial Result Out') {
            labData.pendingTests = null;
        } else if (labRecords[editIndex].pendingTests) {
            // Keep existing pending tests if still in Partial Result Out status
            labData.pendingTests = labRecords[editIndex].pendingTests;
        }
        labRecords[editIndex] = labData;
        showNotification('Lab record updated successfully!');
    } else {
        labRecords.push(labData);
        showNotification('Lab record created successfully!');
    }

    saveLabRecordsToStorage();
    closeLabFormModal();
    renderLabTracker();
    updatePendingResultsAlert();

    // Broadcast to calendar view via WebSocket
    sendQueueEvent('lab_updated', labData);

    // Dispatch custom event for calendar view (if open in same window)
    window.dispatchEvent(new CustomEvent('lab-result-updated', {
        detail: labData
    }));

    // Refresh calendar if visible
    if (!elements.calendarSection.classList.contains('hidden')) {
        refreshCalendar();
    }
}

/**
 * Build initial timeline based on status
 */
function buildTimeline(status, dateTime) {
    const timeline = {
        sentToLab: null,
        partialResult: null,
        completeResult: null,
        informDoctor: null,
        informPatient: null,
        patientReceived: null
    };

    updateLabTimeline(timeline, status, dateTime);
    return timeline;
}

/**
 * Update timeline based on status
 */
function updateLabTimeline(timeline, status, dateTime) {
    const statusMap = {
        'Sent to Lab': 'sentToLab',
        'Partial Result Out': 'partialResult',
        'Complete Result Out': 'completeResult',
        'Inform to Doctor': 'informDoctor',
        'Inform to Patient': 'informPatient',
        'Patient Received': 'patientReceived'
    };

    const timelineKey = statusMap[status];
    if (timelineKey && !timeline[timelineKey]) {
        timeline[timelineKey] = dateTime;
    }
}

/**
 * Show timeline dialog
 */
function showTimeline(labId) {
    const lab = labRecords.find(l => l.labId === labId);
    if (!lab) return;

    elements.timelinePatientInfo.innerHTML = `
        <h4>${escapeHtml(lab.patientName)} - ${escapeHtml(lab.labName)}</h4>
        <p><strong>Lab ID:</strong> ${escapeHtml(lab.labId)}</p>
        <p><strong>Doctor:</strong> ${escapeHtml(lab.doctorName)}</p>
        <p><strong>Amount:</strong> ${formatCurrency(lab.amount)}</p>
    `;

    const timeline = lab.timeline || {};
    const events = [
        { key: 'sentToLab', label: 'Sent to Lab', icon: '📤', class: 'status-sent-to-lab' },
        { key: 'partialResult', label: 'Partial Result Out', icon: '📋', class: 'status-partial-result' },
        { key: 'completeResult', label: 'Complete Result Out', icon: '✅', class: 'status-complete-result' },
        { key: 'informDoctor', label: 'Inform to Doctor', icon: '👨‍⚕️', class: 'status-inform-doctor' },
        { key: 'informPatient', label: 'Inform to Patient', icon: '📞', class: 'status-inform-patient' },
        { key: 'patientReceived', label: 'Patient Received', icon: '🏥', class: 'status-patient-received' }
    ];

    let html = '';
    events.forEach(event => {
        const date = timeline[event.key];
        if (date) {
            // Check if this is the partial result event and has pending tests
            let pendingTestsHtml = '';
            if (event.key === 'partialResult' && lab.pendingTests) {
                pendingTestsHtml = `
                    <div class="timeline-event-pending-tests" style="margin-top: 8px; padding: 8px; background-color: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
                        <div style="font-size: 0.8rem; color: #92400e; font-weight: 600; margin-bottom: 4px;">⏳ Pending Tests:</div>
                        <div style="font-size: 0.85rem; color: #78350f; white-space: pre-wrap;">${escapeHtml(lab.pendingTests)}</div>
                    </div>
                `;
            }
            
            html += `
                <div class="timeline-event completed">
                    <div class="timeline-event-icon">${event.icon}</div>
                    <div class="timeline-event-title">${event.label}</div>
                    <div class="timeline-event-date">${formatDateTime(date)}</div>
                    ${pendingTestsHtml}
                </div>
            `;
        } else {
            html += `
                <div class="timeline-event pending">
                    <div class="timeline-event-icon">${event.icon}</div>
                    <div class="timeline-event-title">${event.label}</div>
                    <div class="timeline-event-empty">Pending</div>
                </div>
            `;
        }
    });

    elements.timelineContent.innerHTML = html;
    elements.timelineDialog.classList.remove('hidden');
}

/**
 * Close timeline dialog
 */
function closeTimelineDialog() {
    elements.timelineDialog.classList.add('hidden');
}

/**
 * Toggle patient contacted status in calendar
 * @param {string} patientId - Patient ID
 * @param {string} patientName - Patient name
 */
function togglePatientContacted(patientId, patientName) {
    const contactKey = `contacted_${patientId}`;
    
    // Toggle the status
    if (window[contactKey]) {
        delete window[contactKey];
    } else {
        window[contactKey] = true;
    }
    
    // Re-render calendar to reflect changes
    refreshCalendar();
}

/**
 * Build HTML list of linked lab records
 * @param {string} patientId - Patient ID
 * @param {Array} labIds - Array of lab IDs
 * @returns {string} HTML string
 */
function buildLinkedLabsListHTML(patientId, labIds) {
    if (!labIds || labIds.length === 0) {
        return '';
    }

    let html = `
        <div style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
            <div style="background-color: #f9fafb; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280; font-weight: 600;">
                🔗 Linked Lab Records (${labIds.length})
            </div>
            <div style="max-height: 300px; overflow-y: auto;">
    `;

    labIds.forEach((labId, index) => {
        const lab = labRecords.find(l => l.labId === labId);
        
        if (!lab) {
            html += `
                <div style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; background-color: #fef2f2;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 0.8rem; color: #991b1b;">
                            ⚠️ Lab ID <strong style="font-family: monospace;">${escapeHtml(labId)}</strong> not found
                        </div>
                        <button 
                            onclick="window.removeLabLinkFromCalendar('${patientId}', '${labId}', 'calLinkedLabsList_${patientId}')" 
                            style="padding: 4px 8px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem;"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        const statusColor = {
            'Sent to Lab': '#3b82f6',
            'Partial Result Out': '#f59e0b',
            'Complete Result Out': '#10b981'
        }[lab.status] || '#6b7280';

        const testName = lab.testName || lab.labName;
        const labLocation = lab.labName;

        html += `
            <div style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; ${index % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f9fafb;'}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-family: monospace; font-weight: 600; font-size: 0.85rem; color: #1e40af;">${escapeHtml(lab.labId)}</span>
                            <span style="padding: 2px 8px; background-color: ${statusColor}; color: white; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">
                                ${escapeHtml(lab.status)}
                            </span>
                        </div>
                        <div style="font-size: 0.8rem; color: #374151; font-weight: 500;">${escapeHtml(testName)}</div>
                        <div style="font-size: 0.75rem; color: #6b7280; margin-top: 2px;">
                            📍 ${escapeHtml(labLocation)} | 👨‍⚕️ ${escapeHtml(lab.doctorName || 'N/A')} | 📅 ${new Date(lab.dateTime).toLocaleDateString()}
                        </div>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button 
                            onclick="window.editLabRecord('${lab.labId}')" 
                            style="padding: 4px 8px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 500;"
                        >
                            Edit
                        </button>
                        <button 
                            onclick="window.showTimeline('${lab.labId}')" 
                            style="padding: 4px 8px; background-color: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 500;"
                        >
                            Timeline
                        </button>
                        <button 
                            onclick="window.removeLabLinkFromCalendar('${patientId}', '${lab.labId}', 'calLinkedLabsList_${patientId}')" 
                            style="padding: 4px 8px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 500;"
                        >
                            Unlink
                        </button>
                    </div>
                </div>
                ${lab.pendingTests ? `
                    <div style="padding: 6px 8px; background-color: #fef3c7; border-radius: 4px; border-left: 2px solid #f59e0b; font-size: 0.75rem; color: #78350f;">
                        ⏳ Pending: ${escapeHtml(lab.pendingTests)}
                    </div>
                ` : ''}
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    return html;
}

/**
 * Add a lab link to calendar pending event
 * @param {string} patientId - Patient ID
 * @param {string} patientName - Patient name
 * @param {string} inputId - ID of the input field
 */
function addLabLinkToCalendar(patientId, patientName, inputId) {
    const input = document.getElementById(inputId);
    const resultDiv = document.getElementById(inputId.replace('calLabIdInput_', 'calLabIdResult_'));
    const listDiv = document.getElementById(`calLinkedLabsList_${patientId}`);
    
    if (!input || !resultDiv || !listDiv) {
        showNotification('Error: Input field not found', 'error');
        return;
    }

    const labId = input.value.trim();
    
    if (!labId) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fef2f2; border-radius: 6px; border-left: 3px solid #ef4444; font-size: 0.8rem; color: #991b1b;">
                ⚠️ Please enter a Lab ID
            </div>
        `;
        return;
    }

    // Lookup the lab record
    const lab = labRecords.find(l => l.labId === labId);
    
    if (!lab) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fef2f2; border-radius: 6px; border-left: 3px solid #ef4444; font-size: 0.8rem; color: #991b1b;">
                ❌ Lab ID <strong>${escapeHtml(labId)}</strong> not found in lab tracker
            </div>
        `;
        return;
    }

    // Check if already linked
    const storageKey = `calLinkedLabs_${patientId}`;
    if (!window[storageKey]) {
        window[storageKey] = [];
    }
    
    if (window[storageKey].includes(labId)) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fffbeb; border-radius: 6px; border-left: 3px solid #f59e0b; font-size: 0.8rem; color: #92400e;">
                ⚠️ Lab ID <strong>${escapeHtml(labId)}</strong> is already linked
            </div>
        `;
        return;
    }

    // Validate patient match (warning only, don't block)
    if (lab.patientId && patientId && lab.patientId !== patientId) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fffbeb; border-radius: 6px; border-left: 3px solid #f59e0b; font-size: 0.8rem; color: #92400e;">
                ⚠️ Warning: This lab record belongs to patient ID ${escapeHtml(lab.patientId)}, but adding anyway...
            </div>
        `;
    }

    // Add to linked labs
    window[storageKey].push(labId);
    
    // Clear input
    input.value = '';

    // Show success message
    const testName = lab.testName || lab.labName;
    resultDiv.innerHTML = `
        <div style="padding: 8px; background-color: #f0fdf4; border-radius: 6px; border-left: 3px solid #10b981; font-size: 0.8rem; color: #166534;">
            ✅ Linked lab <strong>${escapeHtml(testName)}</strong> (${escapeHtml(labId)}) added successfully!
        </div>
    `;

    // Update the linked labs list
    listDiv.innerHTML = buildLinkedLabsListHTML(patientId, window[storageKey]);

    // Auto-clear success message after 3 seconds
    setTimeout(() => {
        if (resultDiv) {
            resultDiv.innerHTML = '';
        }
    }, 3000);
}

/**
 * Remove a lab link from calendar pending event
 * @param {string} patientId - Patient ID
 * @param {string} labId - Lab ID to remove
 * @param {string} listDivId - ID of the list div to update
 */
function removeLabLinkFromCalendar(patientId, labId, listDivId) {
    const storageKey = `calLinkedLabs_${patientId}`;
    
    if (!window[storageKey]) {
        return;
    }

    const index = window[storageKey].indexOf(labId);
    if (index > -1) {
        window[storageKey].splice(index, 1);
        
        // Update the list
        const listDiv = document.getElementById(listDivId);
        if (listDiv) {
            listDiv.innerHTML = buildLinkedLabsListHTML(patientId, window[storageKey]);
        }

        showNotification(`Lab ID ${labId} unlinked`, 'success');
    }
}

/**
 * Lookup lab record from calendar pending tests dialog
 * @param {string} patientId - Patient ID
 * @param {string} patientName - Patient name
 * @param {string} inputId - ID of the input field
 */
function lookupLabFromCalendar(patientId, patientName, inputId) {
    const input = document.getElementById(inputId);
    const resultDiv = document.getElementById(inputId.replace('calLabIdInput_', 'calLabIdResult_'));
    
    if (!input || !resultDiv) {
        showNotification('Error: Input field not found', 'error');
        return;
    }

    const labId = input.value.trim();
    
    if (!labId) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fef2f2; border-radius: 6px; border-left: 3px solid #ef4444; font-size: 0.8rem; color: #991b1b;">
                ⚠️ Please enter a Lab ID
            </div>
        `;
        return;
    }

    // Lookup the lab record
    const lab = labRecords.find(l => l.labId === labId);
    
    if (!lab) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fef2f2; border-radius: 6px; border-left: 3px solid #ef4444; font-size: 0.8rem; color: #991b1b;">
                ❌ Lab ID <strong>${escapeHtml(labId)}</strong> not found in lab tracker
            </div>
        `;
        return;
    }

    // Validate patient match (optional but helpful)
    if (lab.patientId && patientId && lab.patientId !== patientId) {
        resultDiv.innerHTML = `
            <div style="padding: 8px; background-color: #fffbeb; border-radius: 6px; border-left: 3px solid #f59e0b; font-size: 0.8rem; color: #92400e;">
                ⚠️ Warning: This lab record belongs to a different patient (ID: ${escapeHtml(lab.patientId)})
            </div>
            <div style="margin-top: 8px;">
                ${buildLabStatusDisplay(lab)}
            </div>
        `;
        return;
    }

    // Success - show lab status
    resultDiv.innerHTML = `
        <div style="padding: 8px; background-color: #f0fdf4; border-radius: 6px; border-left: 3px solid #10b981; font-size: 0.8rem; color: #166534; margin-bottom: 8px;">
            ✅ Lab record found and linked!
        </div>
        <div style="margin-top: 8px;">
            ${buildLabStatusDisplay(lab)}
        </div>
    `;
}

/**
 * Build HTML to display lab tracking status
 * @param {Object} lab - Lab record object
 * @returns {string} HTML string
 */
function buildLabStatusDisplay(lab) {
    const statusColor = {
        'Sent to Lab': '#3b82f6',
        'Partial Result Out': '#f59e0b',
        'Complete Result Out': '#10b981'
    }[lab.status] || '#6b7280';

    const testName = lab.testName || lab.labName;
    const labLocation = lab.labName;

    let html = `
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #f9fafb; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280;">Lab ID</div>
                    <div style="font-weight: 600; color: #1f2937; font-family: monospace;">${escapeHtml(lab.labId)}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button 
                        onclick="window.editLabRecord('${lab.labId}')" 
                        style="padding: 6px 12px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 500;"
                    >
                        Edit
                    </button>
                    <button 
                        onclick="window.showTimeline('${lab.labId}')" 
                        style="padding: 6px 12px; background-color: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 500;"
                    >
                        Timeline
                    </button>
                </div>
            </div>
            <div style="padding: 12px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.8rem;">
                    <div>
                        <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Test Name</div>
                        <div style="font-weight: 600; color: #1e40af;">${escapeHtml(testName)}</div>
                    </div>
                    <div>
                        <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Status</div>
                        <div style="color: ${statusColor}; font-weight: 600;">${escapeHtml(lab.status)}</div>
                    </div>
                    <div>
                        <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Lab Location</div>
                        <div style="font-weight: 500;">${escapeHtml(labLocation)}</div>
                    </div>
                    <div>
                        <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Doctor</div>
                        <div style="font-weight: 500;">${escapeHtml(lab.doctorName || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Amount</div>
                        <div style="font-weight: 500;">${lab.amount ? lab.amount + ' MMK' : 'N/A'}</div>
                    </div>
                    <div>
                        <div style="color: #6b7280; font-size: 0.7rem; margin-bottom: 2px;">Date & Time</div>
                        <div style="font-weight: 500; font-size: 0.75rem;">${new Date(lab.dateTime).toLocaleString()}</div>
                    </div>
                </div>
    `;

    // Show pending tests if applicable
    if (lab.pendingTests) {
        html += `
                <div style="margin-top: 10px; padding: 8px; background-color: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
                    <div style="font-size: 0.7rem; color: #92400e; font-weight: 600; margin-bottom: 4px;">⏳ Pending Tests:</div>
                    <div style="font-size: 0.75rem; color: #78350f; white-space: pre-wrap;">${escapeHtml(lab.pendingTests)}</div>
                </div>
        `;
    }

    html += `
            </div>
        </div>
    `;

    return html;
}

/**
 * View lab tracker entries from calendar pending tests event
 * @param {string} patientId - Patient ID
 * @param {string} patientName - Patient name
 * @param {Array} labIds - Array of lab record IDs to display
 */
function viewPendingLabRecords(patientId, patientName, labIds) {
    // Close the current calendar dialog
    if (window.currentCalendarDialog) {
        window.currentCalendarDialog.remove();
        window.currentCalendarDialog = null;
    }

    // Find the lab records
    const labs = labIds.map(id => labRecords.find(l => l.labId === id)).filter(Boolean);

    if (labs.length === 0) {
        showNotification('No lab records found', 'error');
        return;
    }

    // Build HTML for lab records display
    let html = `
        <div style="padding: 8px;">
            <div style="margin-bottom: 16px; padding: 12px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">Patient</div>
                <div style="font-weight: 600; color: #1e40af;">${escapeHtml(patientName)}</div>
            </div>
    `;

    labs.forEach((lab, index) => {
        const statusColor = {
            'Sent to Lab': '#3b82f6',
            'Partial Result Out': '#f59e0b',
            'Complete Result Out': '#10b981'
        }[lab.status] || '#6b7280';

        const testName = lab.testName || lab.labName;
        const labLocation = lab.labName;

        html += `
            <div style="margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #f9fafb; padding: 12px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; color: #1f2937;">
                        ${index + 1}. ${escapeHtml(testName)}
                    </div>
                    <button 
                        onclick="window.editLabRecord('${lab.labId}')" 
                        style="padding: 6px 12px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 500;"
                    >
                        Edit
                    </button>
                </div>
                <div style="padding: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem;">
                        <div>
                            <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 2px;">Status</div>
                            <div style="color: ${statusColor}; font-weight: 600;">${escapeHtml(lab.status)}</div>
                        </div>
                        <div>
                            <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 2px;">Lab Location</div>
                            <div style="font-weight: 500;">${escapeHtml(labLocation)}</div>
                        </div>
                        <div>
                            <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 2px;">Doctor</div>
                            <div style="font-weight: 500;">${escapeHtml(lab.doctorName || 'N/A')}</div>
                        </div>
                        <div>
                            <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 2px;">Amount</div>
                            <div style="font-weight: 500;">${lab.amount ? lab.amount + ' MMK' : 'N/A'}</div>
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 2px;">Date & Time</div>
                            <div style="font-weight: 500;">${new Date(lab.dateTime).toLocaleString()}</div>
                        </div>
                    </div>
        `;

        // Show pending tests if applicable
        if (lab.pendingTests) {
            html += `
                    <div style="margin-top: 12px; padding: 8px; background-color: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
                        <div style="font-size: 0.75rem; color: #92400e; font-weight: 600; margin-bottom: 4px;">⏳ Pending Tests:</div>
                        <div style="font-size: 0.8rem; color: #78350f; white-space: pre-wrap;">${escapeHtml(lab.pendingTests)}</div>
                    </div>
            `;
        }

        // View timeline button
        html += `
                    <div style="margin-top: 12px;">
                        <button 
                            onclick="window.showTimeline('${lab.labId}')" 
                            style="width: 100%; padding: 8px; background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 500;"
                        >
                            📊 View Timeline
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;

    // Show in dialog
    showCustomDialog(`Lab Tracker - ${patientName}`, html);
}

/**
 * Create lab record from expense (Lab category)
 */
function createLabFromExpense(expenseData) {
    if (expenseData.category !== 'Lab' && expenseData.category !== 'Lab Test') return;

    // Check if lab record already exists for this expense
    const existingLab = labRecords.find(l =>
        l.expenseId === expenseData.id || 
        (l.patientId === expenseData.patientId &&
         l.amount === expenseData.amount &&
         l.dateTime === expenseData.dateTime)
    );

    if (existingLab) return;

    const labId = generateLabId();
    const labData = {
        id: labId, // Required for IndexedDB keyPath
        labId: labId,
        expenseId: expenseData.id || null, // Link to the expense that created this
        patientId: expenseData.patientId || '',
        patientName: expenseData.patientName || 'Unknown',
        doctorId: '',
        doctorName: expenseData.doctorName || 'Unknown',
        labName: 'TWOK',
        testName: expenseData.itemName || expenseData.remark || 'Blood Test', // Test type
        amount: expenseData.amount,
        status: 'Sent to Lab',
        dateTime: expenseData.dateTime,
        pendingTests: null,
        timeline: {
            sentToLab: expenseData.dateTime,
            partialResult: null,
            completeResult: null,
            informDoctor: null,
            informPatient: null,
            patientReceived: null
        }
    };

    labRecords.push(labData);
    saveLabRecordsToStorage();
    
    // Broadcast to calendar view via WebSocket
    sendQueueEvent('lab_updated', labData);
    
    // Dispatch custom event for calendar view
    window.dispatchEvent(new CustomEvent('lab-result-updated', {
        detail: labData
    }));
    
    // Refresh calendar if visible
    if (!elements.calendarSection.classList.contains('hidden')) {
        refreshCalendar();
    }
}

/**
 * Check for lab results ready but not received (for appointment warning)
 */
function checkLabResultsForPatient(patientId) {
    let pendingLabs = labRecords.filter(lab =>
        lab.patientId === patientId &&
        (lab.status === 'Complete Result Out' || lab.status === 'Partial Result Out')
    );
    
    // Fallback: if no labs found by ID, try matching all labs with pending status
    // This helps when patientId might not be set correctly
    if (pendingLabs.length === 0) {
        pendingLabs = labRecords.filter(lab =>
            lab.status === 'Complete Result Out' || lab.status === 'Partial Result Out'
        );
    }
    
    return pendingLabs;
}

/**
 * Display pending lab results warning in appointment form
 * Shows all pending results line by line for multiple lab IDs
 */
function displayPendingLabResults(patientId) {
    console.log('displayPendingLabResults called for patientId:', patientId);
    console.log('Current labRecords count:', labRecords.length);
    
    const pendingLabs = checkLabResultsForPatient(patientId);
    console.log('Pending labs found:', pendingLabs.length, pendingLabs);
    
    if (pendingLabs && pendingLabs.length > 0) {
        console.log('Showing lab result warning');
        elements.labResultWarning.classList.remove('hidden');
        let warningHtml = '<div style="margin-bottom: 8px; font-weight: 500; color: #92400e;">Pending Lab Results:</div>';
        
        pendingLabs.forEach((lab, index) => {
            const resultDate = lab.timeline.completeResult || lab.timeline.partialResult;
            const statusLabel = lab.status === 'Complete Result Out' ? 'Complete' : 'Partial';
            
            warningHtml += `
                <div style="padding: 8px; background-color: #fffbeb; border-radius: 4px; margin-bottom: 5px; border-left: 3px solid #f59e0b;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>Lab ID:</strong> ${escapeHtml(lab.labId)} |
                            <strong>Lab:</strong> ${escapeHtml(lab.labName)}
                        </div>
                        <span style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background-color: ${lab.status === 'Complete Result Out' ? '#dcfce7' : '#fef3c7'}; color: ${lab.status === 'Complete Result Out' ? '#166534' : '#92400e'};">
                            ${statusLabel}
                        </span>
                    </div>
                    <div style="margin-top: 4px; font-size: 0.85rem; color: #78716c;">
                        <strong>Result Date:</strong> ${resultDate ? formatDateTime(resultDate) : '-'}
                    </div>
                </div>
            `;
            
            // Add separator between labs (except for the last one)
            if (index < pendingLabs.length - 1) {
                warningHtml += '<div style="height: 1px; background-color: #e5e7eb; margin: 5px 0;"></div>';
            }
        });
        
        elements.labWarningDetails.innerHTML = warningHtml;
    } else {
        elements.labResultWarning.classList.add('hidden');
        elements.labWarningDetails.innerHTML = '';
    }
}

/**
 * Check for doctor follow-up after results (for instructions integration)
 */
function checkFollowUpAfterResults() {
    const alerts = [];

    labRecords.forEach(lab => {
        if (lab.status === 'Complete Result Out' && !lab.patientReceived) {
            // Check if there's an instruction for "After Test Results"
            const hasFollowUpInstruction = instructions.some(inst =>
                inst.patientId === lab.patientId &&
                inst.otherInstruction === 'After Results'
            );

            if (hasFollowUpInstruction) {
                alerts.push({
                    labId: lab.labId,
                    patientName: lab.patientName,
                    doctorName: lab.doctorName,
                    labName: lab.labName,
                    resultDate: lab.timeline.completeResult
                });
            }
        }
    });

    return alerts;
}

/**
 * Display pending lab results warning in calendar appointment form
 * @param {string} patientId - Patient ID to check
 */
function displayCalendarPendingLabResults(patientId) {
    console.log('[Calendar] displayPendingLabResults called for patientId:', patientId);
    console.log('[Calendar] Current labRecords count:', labRecords.length);

    const pendingLabs = checkLabResultsForPatient(patientId);
    console.log('[Calendar] Pending labs found:', pendingLabs.length, pendingLabs);

    if (pendingLabs && pendingLabs.length > 0) {
        console.log('[Calendar] Showing lab result warning');
        elements.calendarLabResultWarning.classList.remove('hidden');
        let warningHtml = '<div style="margin-bottom: 8px; font-weight: 500; color: #92400e;">Pending Lab Results:</div>';

        pendingLabs.forEach((lab, index) => {
            const resultDate = lab.timeline.completeResult || lab.timeline.partialResult;
            const statusLabel = lab.status === 'Complete Result Out' ? 'Complete' : 'Partial';

            warningHtml += `
                <div style="padding: 8px; background-color: #fffbeb; border-radius: 4px; margin-bottom: 5px; border-left: 3px solid #f59e0b;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>Lab ID:</strong> ${escapeHtml(lab.labId)} |
                            <strong>Lab:</strong> ${escapeHtml(lab.labName)}
                        </div>
                        <span style="padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background-color: ${lab.status === 'Complete Result Out' ? '#dcfce7' : '#fef3c7'}; color: ${lab.status === 'Complete Result Out' ? '#166534' : '#92400e'};">
                            ${statusLabel}
                        </span>
                    </div>
                    <div style="margin-top: 4px; font-size: 0.85rem; color: #78716c;">
                        <strong>Result Date:</strong> ${resultDate ? formatDateTime(resultDate) : '-'}
                    </div>
                </div>
            `;

            // Add separator between labs (except for the last one)
            if (index < pendingLabs.length - 1) {
                warningHtml += '<div style="height: 1px; background-color: #e5e7eb; margin: 5px 0;"></div>';
            }
        });

        elements.calendarLabWarningDetails.innerHTML = warningHtml;
    } else {
        elements.calendarLabResultWarning.classList.add('hidden');
        elements.calendarLabWarningDetails.innerHTML = '';
    }
}

/**
 * Show lab result alert
 */
function showLabResultAlert(labData) {
    elements.labResultAlertContent.innerHTML = `
        <div class="lab-result-alert-content">
            <p class="alert-message">
                <strong>🔬 Lab result for ${escapeHtml(labData.patientName)} is ready.</strong><br>
                Doctor requested follow-up after results.
            </p>
            <div class="alert-details">
                <p><strong>Lab ID:</strong> ${escapeHtml(labData.labId)}</p>
                <p><strong>Lab Name:</strong> ${escapeHtml(labData.labName)}</p>
                <p><strong>Doctor:</strong> ${escapeHtml(labData.doctorName)}</p>
                <p><strong>Result Date:</strong> ${formatDateTime(labData.resultDate)}</p>
            </div>
            <button type="button" class="btn btn-primary" onclick="closeLabResultAlert()">OK</button>
        </div>
    `;
    elements.labResultAlert.classList.remove('hidden');
}

/**
 * Close lab result alert
 */
function closeLabResultAlert() {
    elements.labResultAlert.classList.add('hidden');
}

// ==================== GLOBAL FUNCTIONS ====================
window.editPatient = editPatient;
window.deletePatient = deletePatient;
window.deleteAddress = deleteAddress;
window.editDoctor = editDoctor;
window.deleteDoctor = deleteDoctor;
window.deleteSpeciality = deleteSpeciality;
window.deleteHospital = deleteHospital;
window.editAppointment = editAppointment;
window.deleteAppointment = deleteAppointment;
window.openPatientFormFromAutocomplete = openPatientFormFromAutocomplete;
window.handleAppointmentAction = handleAppointmentAction;
window.openInstructionForm = openInstructionForm;
window.editInstruction = editInstruction;
window.openEditExpense = openEditExpense;
window.deleteExpense = deleteExpense;
window.loadCustomExpenseTypes = loadCustomExpenseTypes;
window.saveCustomExpenseType = saveCustomExpenseType;
window.getAllExpenseTypes = getAllExpenseTypes;
window.loadLabNames = loadLabNames;
window.saveLabName = saveLabName;
window.populateLabNameDatalist = populateLabNameDatalist;
window.updateLabFilterDropdown = updateLabFilterDropdown;
window.editLabRecord = editLabRecord;
window.deleteLabRecord = deleteLabRecord;
window.showTimeline = showTimeline;
window.closeTimelineDialog = closeTimelineDialog;
window.closeLabResultAlert = closeLabResultAlert;
window.viewPendingLabRecords = viewPendingLabRecords;
window.lookupLabFromCalendar = lookupLabFromCalendar;
window.addLabLinkToCalendar = addLabLinkToCalendar;
window.removeLabLinkFromCalendar = removeLabLinkFromCalendar;
window.togglePatientContacted = togglePatientContacted;
window.showPatientLabDetails = showPatientLabDetails;
window.displayCalendarPendingLabResults = displayCalendarPendingLabResults;

/**
 * Calculate follow-up date from appointment date and duration
 * @param {string} appointmentDate - The appointment date (ISO string)
 * @param {number} duration - The duration value
 * @param {string} unit - The unit (Days/Weeks/Months)
 * @returns {string|null} - Calculated date in YYYY-MM-DD format or null
 */
function calculateFollowUpDate(appointmentDate, duration, unit) {
    if (!appointmentDate || !duration) return null;
    
    try {
        const date = new Date(appointmentDate);
        if (isNaN(date.getTime())) return null;
        
        switch (unit) {
            case 'Days':
                date.setDate(date.getDate() + duration);
                break;
            case 'Weeks':
                date.setDate(date.getDate() + (duration * 7));
                break;
            case 'Months':
                date.setMonth(date.getMonth() + duration);
                break;
            default:
                date.setDate(date.getDate() + duration);
        }
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error('[Calendar] Error calculating follow-up date:', error);
        return null;
    }
}

// ==================== CALENDAR MODULE ====================

let calendarDate = new Date();
let calendarEvents = {};

/**
 * Initialize calendar module
 */
async function initCalendar() {
    try {
        // Reload data from storage to ensure we have the latest data
        await loadFromStorage();
        await loadCalendarData();
        renderCalendar();
        populateCalendarDoctorFilter();
        setupCalendarEventListeners();
        updateCalendarConnectionStatus();
    } catch (error) {
        console.error('[Calendar] Failed to initialize:', error);
    }
}

/**
 * Load calendar data from instructions and lab records
 */
async function loadCalendarData() {
    calendarEvents = {};

    console.log('[Calendar] Loading calendar data...');
    console.log('[Calendar] Total instructions:', instructions.length);
    console.log('[Calendar] Total lab records:', labRecords.length);

    // Define test type categories
    const bloodTests = ['Blood Test', 'C&S Results'];
    const imagingTests = ['USG', 'Echo', 'ECG', 'Xray', 'CT', 'MRI', 'Other'];

    // Filter instructions for calendar display
    const validInstructions = instructions.filter(inst => {
        // Exclude PRN and Transfer to Hospital
        if (inst.otherInstruction === 'PRN' || inst.otherInstruction === 'Transfer to Hospital') {
            return false;
        }

        // For After Results: only show when lab results are available (handled separately)
        if (inst.otherInstruction === 'After Results') {
            return true; // Will be processed in after-results section
        }

        // For other instructions: must have next date, or tests with duration
        const hasDate = (inst.nextAppointmentDate && inst.nextAppointmentDate.trim() !== '') ||
                        (inst.createdTime && inst.createdTime.trim() !== '');
        const hasTests = inst.selectedTests && inst.selectedTests.length > 0;

        return hasDate || hasTests;
    });

    console.log(`[Calendar] Valid instructions: ${validInstructions.length}`);

    // Log all valid instructions for debugging
    validInstructions.forEach((inst, idx) => {
        console.log(`  [${idx}] ${inst.patientName} - Type: ${inst.otherInstruction || 'Regular'}, Date: ${inst.nextAppointmentDate || 'none'}, Doctor: ${inst.followUpDoctor || inst.doctorName}`);
    });

    // Generate follow-up and test-before events (EXCLUDE After Results from this section)
    const regularInstructions = validInstructions.filter(inst => inst.otherInstruction !== 'After Results');
    
    regularInstructions.forEach(inst => {
        // Calculate follow-up date using priority:
        // 1. nextAppointmentDate (if explicitly set)
        // 2. Calculated from appointmentDate + returnDuration + returnUnit
        // 3. createdTime (fallback)
        let date = null;

        if (inst.nextAppointmentDate && inst.nextAppointmentDate.trim() !== '') {
            date = inst.nextAppointmentDate;
        } else if (inst.returnDuration && inst.returnUnit) {
            date = calculateFollowUpDate(inst.appointmentDate, inst.returnDuration, inst.returnUnit);
        }

        // Skip if no explicit date/duration - TODO events will handle this
        if (!date) {
            return;
        }

        const doctorName = inst.followUpDoctor || inst.doctorName || 'Unknown Doctor';
        const phone = inst.phone || '';
        const patientDisplay = `${inst.patientName}${inst.age ? ', ' + inst.age : ''}${phone ? ' (' + phone + ')' : ''}`;

        if (!calendarEvents[date]) {
            calendarEvents[date] = {};
        }

        if (!calendarEvents[date][doctorName]) {
            calendarEvents[date][doctorName] = {
                doctor: doctorName,
                patients: [],
                types: new Set()
            };
        }

        calendarEvents[date][doctorName].patients.push({
            type: 'follow-up',
            patientName: patientDisplay,
            instruction: inst
        });

        calendarEvents[date][doctorName].types.add('follow-up');

        // Add tests before visit (only blood tests, not imaging)
        if (inst.selectedTests && inst.selectedTests.length > 0) {
            const hasBloodTests = inst.selectedTests.some(t => bloodTests.includes(t));
            if (hasBloodTests) {
                calendarEvents[date][doctorName].types.add('tests-before');
                const lastPatient = calendarEvents[date][doctorName].patients[calendarEvents[date][doctorName].patients.length - 1];
                lastPatient.tests = inst.selectedTests.filter(t => bloodTests.includes(t));
            }
        }
    });

    // Generate combined PENDING events for After Results (both blood and imaging tests pending)
    validInstructions.filter(inst => inst.otherInstruction === 'After Results').forEach(inst => {
        const requiredTests = inst.selectedTests || [];
        if (requiredTests.length === 0) return; // No tests required

        // Match lab records by patientId only (strict matching to avoid name duplicates)
        const patientLabs = labRecords.filter(lab => lab.patientId === inst.patientId);

        // Debug logging
        console.log(`[Calendar Pending] Patient: ${inst.patientName}, patientId: ${inst.patientId}`);
        console.log(`[Calendar Pending] Patient labs found: ${patientLabs.length}`);
        if (patientLabs.length > 0) {
            patientLabs.forEach((lab, idx) => {
                const testName = lab.testName || lab.labName; // Fallback to labName for backward compatibility
                console.log(`  Lab ${idx}: ${testName} (at ${lab.labName}), Status: ${lab.status}, patientId: ${lab.patientId || 'N/A'}, patientName: ${lab.patientName}`);
            });
        }

        const completedLabs = patientLabs.filter(lab =>
            lab.status === 'Partial Result Out' || lab.status === 'Complete Result Out'
        );
        // Use testName if available (new format), otherwise fall back to labName (old format)
        const completedTestNames = completedLabs.map(lab => lab.testName || lab.labName);

        // Get pending tests (both blood and imaging)
        const pendingBlood = requiredTests.filter(t => bloodTests.includes(t) && !completedTestNames.includes(t));
        const pendingImaging = requiredTests.filter(t => imagingTests.includes(t) && !completedTestNames.includes(t));

        // Only create pending event if there are pending tests
        if (pendingBlood.length === 0 && pendingImaging.length === 0) return;

        // Get lab status for each pending blood test from all patient's lab tracker entries
        // If multiple labs exist, show count of each status
        const bloodTestStatus = {};
        pendingBlood.forEach(test => {
            // Count statuses across all labs for this patient
            const statusCounts = {};
            patientLabs.forEach(lab => {
                if (lab.status) {
                    statusCounts[lab.status] = (statusCounts[lab.status] || 0) + 1;
                }
            });
            
            if (Object.keys(statusCounts).length > 0) {
                // Build status string like "1 Complete Result Out, 1 Sent to Lab"
                const statusParts = Object.entries(statusCounts).map(([status, count]) => 
                    `${count} ${status}`
                );
                bloodTestStatus[test] = statusParts.join(', ');
            } else {
                bloodTestStatus[test] = 'Not Started';
            }
        });

        // Use today's date or the latest lab date for the pending notification
        const latestLabDate = patientLabs.length > 0 ? patientLabs.sort((a, b) =>
            new Date(b.dateTime) - new Date(a.dateTime)
        )[0].dateTime.split('T')[0] : new Date().toISOString().split('T')[0];

        const date = latestLabDate;
        const doctorName = inst.followUpDoctor || inst.doctorName || 'Unknown Doctor';

        if (!calendarEvents[date]) {
            calendarEvents[date] = {};
        }

        if (!calendarEvents[date][doctorName]) {
            calendarEvents[date][doctorName] = {
                doctor: doctorName,
                patients: [],
                types: new Set()
            };
        }

        // Check if patient already has a pending entry
        const exists = calendarEvents[date][doctorName].patients.some(p =>
            p.type === 'pending' && p.instruction.patientId === inst.patientId
        );

        if (!exists) {
            const phone = inst.phone || '';
            const patientDisplay = `${inst.patientName}${inst.age ? ', ' + inst.age : ''}${phone ? ' (' + phone + ')' : ''}`;

            // Get appointment date
            const appointmentDate = inst.appointmentDate || inst.createdTime?.split('T')[0] || 'N/A';

            // Combine all pending tests
            const allPendingTests = [...pendingBlood, ...pendingImaging];

            // Create display text with doctor name and appointment date
            const displayText = `${inst.patientName}, ${inst.age || '-'}${phone ? ', ' + phone : ''} | Dr. ${doctorName} | Appt: ${appointmentDate}`;

            calendarEvents[date][doctorName].patients.push({
                type: 'pending',
                patientName: patientDisplay,
                displayText: displayText,
                instruction: inst,
                pendingTests: {
                    blood: pendingBlood,
                    imaging: pendingImaging,
                    all: allPendingTests
                },
                bloodTestStatus: bloodTestStatus,
                appointmentDate: appointmentDate,
                doctorName: doctorName,
                linkedLabIds: [] // Array to store multiple linked lab IDs
            });

            calendarEvents[date][doctorName].types.add('pending');
        }
    });

    // Generate TODO events for items without specific dates (appear on today's date)
    generateTODOCalendarEvents(instructions, labRecords, calendarEvents, bloodTests, imagingTests);

    const eventDates = Object.keys(calendarEvents);
    console.log(`[Calendar] Generated events for ${eventDates.length} dates:`, eventDates);
    console.log('[Calendar] Calendar events object:', calendarEvents);
}

/**
 * Generate TODO events for items without specific dates
 * These appear on today's date and persist day by day
 * Only for follow-ups with no date specified (After Results now uses "Pending" events)
 */
function generateTODOCalendarEvents(instructions, labRecords, calendarEvents, bloodTests, imagingTests) {
    const today = new Date().toISOString().split('T')[0];

    // Collect all instructions without determinable dates
    const noDateInstructions = instructions.filter(inst => {
        // Check if this instruction has NO determinable date
        let hasDate = false;
        if (inst.nextAppointmentDate && inst.nextAppointmentDate.trim() !== '') {
            hasDate = true;
        } else if (inst.returnDuration && inst.returnUnit) {
            hasDate = true;
        }
        return !hasDate;
    });

    noDateInstructions.forEach(inst => {
        // Skip After Results instructions - they now have dedicated "Pending" events
        if (inst.otherInstruction === 'After Results') {
            return;
        }

        // Determine TODO reasons
        const reasons = [];
        
        // Not After Results - check if follow-up date is missing
        reasons.push('follow-up-no-date');

        const doctorName = inst.followUpDoctor || inst.doctorName || 'Unknown Doctor';
        const phone = inst.phone || '';
        const patientDisplay = `${inst.patientName}${inst.age ? ', ' + inst.age : ''}${phone ? ' (' + phone + ')' : ''}`;

        if (!calendarEvents[today]) {
            calendarEvents[today] = {};
        }

        if (!calendarEvents[today][doctorName]) {
            calendarEvents[today][doctorName] = {
                doctor: doctorName,
                patients: [],
                types: new Set()
            };
        }

        // Check if patient already has a TODO entry for today
        const exists = calendarEvents[today][doctorName].patients.some(p =>
            p.type === 'todo' && p.instruction.patientId === inst.patientId
        );

        if (!exists) {
            const testsToCheck = inst.selectedTests || [];

            calendarEvents[today][doctorName].patients.push({
                type: 'todo',
                todoReasons: reasons,
                instruction: inst,
                patientName: patientDisplay,
                tests: testsToCheck,
                appointmentDate: inst.appointmentDate || null,
                isAfterResults: false,
                hasResults: false
            });

            calendarEvents[today][doctorName].types.add('todo');
        }
    });
}

/**
 * Render calendar grid
 */
function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    elements.calCurrentMonthYear.textContent = `${monthNames[month]} ${year}`;

    // Clear grid
    elements.calDaysGrid.innerHTML = '';

    // Add day headers (Sun, Mon, Tue, etc.) as first row
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(dayName => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'cal-day-header';
        dayHeader.textContent = dayName;
        elements.calDaysGrid.appendChild(dayHeader);
    });

    // Calculate days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const today = new Date();
    const todayStr = toLocalDateString(today);
    
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell';
        
        let dayNumber;
        let isOtherMonth = false;
        let dateStr;
        
        if (i < firstDay) {
            dayNumber = daysInPrevMonth - firstDay + i + 1;
            const prevMonth = month === 0 ? 11 : month - 1;
            const prevYear = month === 0 ? year - 1 : year;
            dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
            isOtherMonth = true;
        } else if (i >= firstDay + daysInMonth) {
            dayNumber = i - firstDay - daysInMonth + 1;
            const nextMonth = month === 11 ? 0 : month + 1;
            const nextYear = month === 11 ? year + 1 : year;
            dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
            isOtherMonth = true;
        } else {
            dayNumber = i - firstDay + 1;
            dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        }
        
        if (isOtherMonth) {
            cell.classList.add('other-month');
        }
        
        if (dateStr === todayStr) {
            cell.classList.add('today');
        }
        
        // Day number
        const dayNumberEl = document.createElement('div');
        dayNumberEl.className = 'cal-day-number';
        dayNumberEl.textContent = dayNumber;
        cell.appendChild(dayNumberEl);
        
        // Events container
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'cal-day-events';
        
        // Render events for this date
        if (calendarEvents[dateStr]) {
            const events = Object.values(calendarEvents[dateStr]);
            const maxDisplay = 3;
            const displayed = events.slice(0, maxDisplay);
            const remaining = events.length - maxDisplay;
            
            displayed.forEach(event => {
                const eventEl = createCalendarEventElement(event, dateStr);
                eventsContainer.appendChild(eventEl);
            });
            
            if (remaining > 0) {
                const moreEl = document.createElement('div');
                moreEl.className = 'cal-more-events';
                moreEl.textContent = `+${remaining} more`;
                eventsContainer.appendChild(moreEl);
            }
        }
        
        cell.appendChild(eventsContainer);
        elements.calDaysGrid.appendChild(cell);
    }
}

/**
 * Create calendar event element
 */
function createCalendarEventElement(event, date) {
    const eventEl = document.createElement('div');
    eventEl.className = 'cal-event';
    
    const types = Array.from(event.types);
    const primaryType = types[0];
    eventEl.classList.add(primaryType);
    
    const doctorEl = document.createElement('span');
    doctorEl.className = 'cal-event-doctor';
    doctorEl.textContent = event.doctor;
    eventEl.appendChild(doctorEl);
    
    if (event.patients.length > 0) {
        const patientEl = document.createElement('span');
        patientEl.style.fontSize = '0.65rem';
        patientEl.textContent = `${event.patients.length} patient${event.patients.length > 1 ? 's' : ''}`;
        eventEl.appendChild(patientEl);
    }
    
    eventEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showCalendarEventDetail(event, date);
    });
    
    return eventEl;
}

/**
 * Show event detail dialog
 */
function showCalendarEventDetail(event, date) {
    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    let html = `<div style="margin-bottom: 15px;"><strong style="color: #3b82f6;">${escapeHtml(event.doctor)}</strong></div>`;

    if (event.patients && event.patients.length > 0) {
        event.patients.forEach(patient => {
            let borderColor;
            if (patient.type === 'todo') {
                borderColor = '#a855f7';
            } else if (patient.type === 'follow-up') {
                borderColor = '#3b82f6';
            } else if (patient.type === 'tests-before') {
                borderColor = '#f97316';
            } else if (patient.type === 'pending') {
                borderColor = '#f59e0b';
            } else {
                borderColor = '#8b5cf6';
            }

            html += `<div style="padding: 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid ${borderColor};">`;

            // Add checkbox for patient contact status
            const patientId = patient.instruction?.patientId || '';
            const patientNameRaw = patient.patientName || '';
            const contactKey = `contacted_${patientId}`;
            const isContacted = window[contactKey] || false;

            // Main row: Checkbox (left) + Patient info (right)
            html += `<div style="display: flex; align-items: center; gap: 10px;">`;
            html += `
                <input
                    type="checkbox"
                    id="contact_checkbox_${patientId}"
                    ${isContacted ? 'checked' : ''}
                    onchange="window.togglePatientContacted('${patientId}', '${patientNameRaw.replace(/'/g, "\\'")}')"
                    style="cursor: pointer; width: 18px; height: 18px; flex-shrink: 0;"
                    title="Mark patient as contacted"
                />
            `;
            html += `<div style="flex: 1; font-weight: 500; ${isContacted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(patient.patientName)}</div>`;
            html += `</div>`;
            
            // Create Appointment button below patient name
            const doctorName = event.doctor || '';
            const calendarDate = date;
            html += `<button onclick="window.createAppointmentFromCalendar('${escapeHtml(patient.patientName)}', '${patientId}', '${escapeHtml(doctorName)}', '${calendarDate}')"
                style="margin-top: 8px; padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                📅 Create Appointment
            </button>`;

            // TODO specific information
            if (patient.type === 'todo') {
                // Show appointment date if available
                if (patient.appointmentDate) {
                    const apptDate = new Date(patient.appointmentDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    html += `<div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">📅 Appointment Date: ${apptDate}</div>`;
                }

                // Show reasons for TODO
                if (patient.todoReasons && patient.todoReasons.length > 0) {
                    patient.todoReasons.forEach(reason => {
                        if (reason === 'follow-up-no-date') {
                            html += `<div style="font-size: 0.8rem; color: #a855f7; margin-top: 4px; font-weight: 500;">⚠️ Follow-up date not specified</div>`;
                        } else if (reason === 'after-results-pending') {
                            html += `<div style="font-size: 0.8rem; color: #f97316; margin-top: 4px; font-weight: 500;">⏳ Awaiting lab results</div>`;
                        }
                    });
                }

                // Show tests to check
                if (patient.tests && patient.tests.length > 0) {
                    html += `<div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">🔬 Tests to Check: ${patient.tests.map(t => escapeHtml(t)).join(', ')}</div>`;
                }

                html += `<div style="font-size: 0.75rem; color: #6b7280; margin-top: 6px; font-style: italic;">📌 This task appears daily until a date is specified or results are available</div>`;
            }

            // Regular tests (for tests-before)
            else if (patient.tests && patient.tests.length > 0) {
                html += `<div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">→ Tests: ${patient.tests.map(t => escapeHtml(t)).join(', ')}</div>`;
            }

            // Combined Pending Tests (both blood and imaging)
            if (patient.type === 'pending' && patient.pendingTests) {
                // Show all pending tests in a list
                html += `<div style="font-size: 0.85rem; color: #f59e0b; margin-top: 6px; font-weight: 600;">⏳ Pending Tests:</div>`;
                html += `<div style="font-size: 0.8rem; margin-top: 4px; padding-left: 8px;">`;

                // Initialize or get linked lab IDs array for this patient
                if (!patient.linkedLabIds) {
                    patient.linkedLabIds = [];
                }

                // Store in window for access by functions
                const patientId = patient.instruction?.patientId || '';
                const patientNameForLookup = patient.instruction?.patientName || '';
                const storageKey = `calLinkedLabs_${patientId}`;

                // Load from window storage if it exists, otherwise use patient.linkedLabIds
                if (!window[storageKey]) {
                    window[storageKey] = patient.linkedLabIds || [];
                } else {
                    // Sync back to patient object
                    patient.linkedLabIds = window[storageKey];
                }

                // Auto-link all lab records for this patient that aren't already in the list
                const patientLabs = labRecords.filter(lab => lab.patientId === patientId);
                patientLabs.forEach(lab => {
                    if (!window[storageKey].includes(lab.labId)) {
                        window[storageKey].push(lab.labId);
                    }
                });

                // Build a map of linked labs for quick lookup
                const linkedLabsMap = {};
                window[storageKey].forEach(labId => {
                    const lab = labRecords.find(l => l.labId === labId);
                    if (lab) {
                        const testName = lab.testName || lab.labName;
                        if (!linkedLabsMap[testName]) {
                            linkedLabsMap[testName] = [];
                        }
                        linkedLabsMap[testName].push(lab);
                    }
                });

                // Blood tests with status and linked lab IDs
                if (patient.pendingTests.blood && patient.pendingTests.blood.length > 0) {
                    patient.pendingTests.blood.forEach(test => {
                        const status = patient.bloodTestStatus?.[test];
                        const linkedLabs = linkedLabsMap[test] || [];

                        html += `<div style="margin-top: 6px;">`;
                        
                        // Only show status if it exists and is not "Not Started"
                        if (status && status !== 'Not Started') {
                            html += `<div style="margin-top: 3px; color: #f97316; font-weight: 500;">• ${escapeHtml(test)} <span style="color: #6b7280; font-size: 0.75rem;">(Status: ${escapeHtml(status)})</span></div>`;
                        } else {
                            html += `<div style="margin-top: 3px; color: #f97316; font-weight: 500;">• ${escapeHtml(test)}</div>`;
                        }

                        // Show linked lab IDs if any
                        if (linkedLabs.length > 0) {
                            html += `<div style="margin-left: 12px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px;">`;
                            linkedLabs.forEach(lab => {
                                const statusColor = {
                                    'Sent to Lab': '#3b82f6',
                                    'Partial Result Out': '#f59e0b',
                                    'Complete Result Out': '#10b981'
                                }[lab.status] || '#6b7280';

                                html += `
                                    <a href="javascript:void(0)" 
                                       onclick="window.editLabRecord('${lab.labId}')" 
                                       style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background-color: ${statusColor}15; border: 1px solid ${statusColor}; border-radius: 12px; font-size: 0.7rem; font-family: monospace; color: ${statusColor}; text-decoration: none; cursor: pointer; transition: all 0.2s;"
                                       onmouseover="this.style.backgroundColor='${statusColor}25'; this.style.transform='scale(1.05)';"
                                       onmouseout="this.style.backgroundColor='${statusColor}15'; this.style.transform='scale(1)';"
                                       title="Click to edit ${lab.labId} (${escapeHtml(lab.status)})">
                                        <span style="font-weight: 600;">${lab.labId}</span>
                                        <span style="font-family: sans-serif; font-weight: 400; opacity: 0.8;">• ${escapeHtml(lab.status)}</span>
                                    </a>
                                `;
                            });
                            html += `</div>`;
                        }

                        html += `</div>`;
                    });
                }

                // Imaging tests with linked lab IDs
                if (patient.pendingTests.imaging && patient.pendingTests.imaging.length > 0) {
                    patient.pendingTests.imaging.forEach(test => {
                        const linkedLabs = linkedLabsMap[test] || [];

                        html += `<div style="margin-top: 6px;">`;
                        html += `<div style="margin-top: 3px; color: #8b5cf6; font-weight: 500;">• ${escapeHtml(test)}</div>`;

                        // Show linked lab IDs if any
                        if (linkedLabs.length > 0) {
                            html += `<div style="margin-left: 12px; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px;">`;
                            linkedLabs.forEach(lab => {
                                const statusColor = {
                                    'Sent to Lab': '#3b82f6',
                                    'Partial Result Out': '#f59e0b',
                                    'Complete Result Out': '#10b981'
                                }[lab.status] || '#6b7280';

                                html += `
                                    <a href="javascript:void(0)" 
                                       onclick="window.editLabRecord('${lab.labId}')" 
                                       style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background-color: ${statusColor}15; border: 1px solid ${statusColor}; border-radius: 12px; font-size: 0.7rem; font-family: monospace; color: ${statusColor}; text-decoration: none; cursor: pointer; transition: all 0.2s;"
                                       onmouseover="this.style.backgroundColor='${statusColor}25'; this.style.transform='scale(1.05)';"
                                       onmouseout="this.style.backgroundColor='${statusColor}15'; this.style.transform='scale(1)';"
                                       title="Click to edit ${lab.labId} (${escapeHtml(lab.status)})">
                                        <span style="font-weight: 600;">${lab.labId}</span>
                                        <span style="font-family: sans-serif; font-weight: 400; opacity: 0.8;">• ${escapeHtml(lab.status)}</span>
                                    </a>
                                `;
                            });
                            html += `</div>`;
                        }

                        html += `</div>`;
                    });
                }

                html += `</div>`;

                // Add lab ID linking section - support multiple lab IDs
                html += `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: #1e40af; margin-bottom: 8px;">🔗 Link to Lab Tracker</div>
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
                            <input 
                                type="text" 
                                id="calLabIdInput_${patientId}" 
                                placeholder="Enter Lab ID (e.g., L0000001)" 
                                style="flex: 1; padding: 8px 12px; border: 2px solid #d1d5db; border-radius: 6px; font-size: 0.85rem; outline: none; transition: border-color 0.2s;"
                                onfocus="this.style.borderColor='#3b82f6';"
                                onblur="this.style.borderColor='#d1d5db';"
                                onkeydown="if(event.key==='Enter'){event.preventDefault(); window.addLabLinkToCalendar('${patientId}', '${escapeHtml(patientNameForLookup)}', 'calLabIdInput_${patientId}');}"
                            />
                            <button 
                                onclick="window.addLabLinkToCalendar('${patientId}', '${escapeHtml(patientNameForLookup)}', 'calLabIdInput_${patientId}')" 
                                style="padding: 8px 16px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; white-space: nowrap; transition: all 0.2s ease;"
                                onmouseover="this.style.transform='translateY(-1px)';"
                                onmouseout="this.style.transform='translateY(0)';"
                            >
                                ➕ Add
                            </button>
                        </div>
                        <div id="calLabIdResult_${patientId}" style="margin-bottom: 8px;"></div>
                        <div id="calLinkedLabsList_${patientId}">
                            ${buildLinkedLabsListHTML(patientId, window[storageKey])}
                        </div>
                    </div>
                `;
            }

            if (patient.instruction && patient.instruction.generalInstruction) {
                html += `<div style="font-size: 0.85rem; color: #6b7280; margin-top: 6px; font-style: italic;">"${escapeHtml(patient.instruction.generalInstruction)}"</div>`;
            }

            html += `</div>`;
        });
    }
    
    showCustomDialog(`Events for ${formattedDate}`, html);
}

/**
 * Show custom dialog
 */
function showCustomDialog(title, content) {
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 2000;';

    dialog.innerHTML = `
        <div style="background: white; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
            <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; border-radius: 12px 12px 0 0;">
                <h3 style="margin: 0; font-size: 1.1rem;">${title}</h3>
                <button class="cal-dialog-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280; padding: 0; width: 30px; height: 30px;">&times;</button>
            </div>
            <div class="cal-dialog-body" style="padding: 20px;">
                ${content}
            </div>
            <div style="padding: 12px 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; background: #f9fafb; border-radius: 0 0 12px 12px;">
                <button class="cal-dialog-close-btn" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    
    // Store dialog reference for programmatic closing
    window.currentCalendarDialog = dialog;

    const closeDialog = () => {
        dialog.remove();
        window.currentCalendarDialog = null;
    };

    dialog.querySelector('.cal-dialog-close').addEventListener('click', closeDialog);
    dialog.querySelector('.cal-dialog-close-btn').addEventListener('click', closeDialog);
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) closeDialog();
    });
}

/**
 * Populate doctor filter dropdown
 */
function populateCalendarDoctorFilter() {
    const doctors = new Set();
    
    instructions.forEach(inst => {
        if (inst.otherInstruction === 'PRN' || inst.otherInstruction === 'Transfer to Hospital') return;
        const doctor = inst.followUpDoctor || inst.doctorName;
        if (doctor) doctors.add(doctor);
    });
    
    elements.calFilterDoctor.innerHTML = '<option value="">All Doctors</option>';
    Array.from(doctors).sort().forEach(doctor => {
        const option = document.createElement('option');
        option.value = doctor;
        option.textContent = doctor;
        elements.calFilterDoctor.appendChild(option);
    });
}

/**
 * Calendar initialization flag
 */
let calendarInitialized = false;

/**
 * Setup calendar event listeners
 */
function setupCalendarEventListeners() {
    if (calendarInitialized) {
        return; // Prevent duplicate listener registration
    }

    elements.calPrevMonth.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });

    elements.calNextMonth.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

    elements.calTodayBtn.addEventListener('click', () => {
        calendarDate = new Date();
        renderCalendar();
    });

    elements.calFilterDoctor.addEventListener('change', applyCalendarFilters);
    elements.calFilterType.addEventListener('change', applyCalendarFilters);

    elements.calClearFilters.addEventListener('click', () => {
        elements.calFilterDoctor.value = '';
        elements.calFilterType.value = '';
        renderCalendar();
    });

    // Calendar appointment form event listeners
    elements.closeCalendarApptForm.addEventListener('click', closeCalendarAppointmentForm);
    elements.cancelCalendarApptForm.addEventListener('click', closeCalendarAppointmentForm);
    elements.calendarAppointmentFormPanel.querySelector('.slide-panel-backdrop').addEventListener('click', closeCalendarAppointmentForm);
    
    // Calendar appointment form submission
    elements.calendarAppointmentForm.addEventListener('submit', saveCalendarAppointment);
    
    // Calendar appointment clear and delete
    elements.calendarApptClearBtn.addEventListener('click', () => {
        resetCalendarAppointmentForm();
        elements.calendarApptPatient.focus();
    });
    
    elements.calendarApptDeleteBtn.addEventListener('click', async () => {
        const appointmentId = elements.calendarApptId.value;
        if (!appointmentId) return;

        const appt = appointments.find(a => a.id === appointmentId);
        if (!appt) return;

        if (!confirm(`Are you sure you want to delete this appointment for ${appt.patientName}?\n\nThis action cannot be undone.`)) return;

        try {
            // Delete from IndexedDB
            await TWOKDB.remove(TWOKDB.STORES.APPOINTMENTS, appointmentId);

            // Remove from local array
            const idx = appointments.findIndex(a => a.id === appointmentId);
            if (idx > -1) {
                appointments.splice(idx, 1);
            }

            closeCalendarAppointmentForm();
            showNotification('Appointment deleted successfully!');

            // Broadcast deletion
            sendQueueEvent('appointment_deleted', { appointmentId, patientName: appt.patientName });

            // Refresh calendar
            if (!elements.calendarSection.classList.contains('hidden')) {
                refreshCalendar();
            }
        } catch (error) {
            console.error('Error deleting appointment:', error);
            showNotification('Error deleting appointment', 'error');
        }
    });
    
    // Calendar patient autocomplete
    elements.calendarApptPatient.addEventListener('input', (e) => {
        showCalendarPatientAutocomplete(e.target.value);
    });
    
    // Calendar doctor autocomplete and input
    elements.calendarApptDoctor.addEventListener('input', (e) => {
        showCalendarDoctorAutocomplete(e.target.value);
    });
    
    // Recalculate booking number when doctor, date, or booking type changes
    elements.calendarApptDoctor.addEventListener('change', () => {
        recalculateCalendarBookingNumber();
    });
    
    elements.calendarApptDateTime.addEventListener('change', () => {
        recalculateCalendarBookingNumber();
    });
    
    elements.calendarApptBookingType.addEventListener('change', () => {
        recalculateCalendarBookingNumber();
    });

    calendarInitialized = true;
}

/**
 * Apply calendar filters
 */
async function applyCalendarFilters() {
    const doctor = elements.calFilterDoctor.value;
    const type = elements.calFilterType.value;

    // Reload data from storage
    await loadFromStorage();

    // Regenerate events using the updated loadCalendarData logic
    await loadCalendarData();

    // Apply additional filters to calendarEvents
    if (doctor || type) {
        const filteredEvents = {};

        Object.keys(calendarEvents).forEach(date => {
            const filteredDay = {};

            Object.keys(calendarEvents[date]).forEach(doctorName => {
                const event = calendarEvents[date][doctorName];

                // Doctor filter
                if (doctor && event.doctor !== doctor) return;

                // Type filter
                if (type && !event.types.has(type)) return;

                filteredDay[doctorName] = event;
            });

            if (Object.keys(filteredDay).length > 0) {
                filteredEvents[date] = filteredDay;
            }
        });

        calendarEvents = filteredEvents;
    }

    renderCalendar();
}

/**
 * Update calendar connection status
 */
function updateCalendarConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.className = `status-indicator ${navigator.onLine ? 'online' : 'offline'}`;
        statusEl.title = navigator.onLine ? 'Online' : 'Offline - Using cached data';
    }
}

/**
 * Refresh calendar data
 */
async function refreshCalendar() {
    setupCalendarEventListeners(); // Ensure listeners are set up
    showCalendarLoading(true);
    await loadCalendarData();
    renderCalendar();
    populateCalendarDoctorFilter();
    showCalendarLoading(false);
}

/**
 * Show/hide calendar loading
 */
function showCalendarLoading(show) {
    elements.calLoading.style.display = show ? 'block' : 'none';
}

// Listen for online/offline events
window.addEventListener('online', updateCalendarConnectionStatus);
window.addEventListener('offline', updateCalendarConnectionStatus);

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', init);
"" 
