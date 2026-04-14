/**
 * Pharmacist Corner - Main Application Logic
 * Manages patient cards, instructions, and expenses workflow
 */

class PharmacistCornerApp {
    constructor() {
        this.appointments = [];
        this.instructions = [];
        this.expenses = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.today = this.getTodayDateString();
        
        this.init();
    }

    /**
     * Initialize application
     */
    async init() {
        console.log('[PharmacistCorner] Initializing...');
        
        // Load data from IndexedDB
        await this.loadData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup WebSocket for real-time updates
        this.setupWebSocket();
        
        // Render initial view
        this.render();

        // Listen for form submissions
        this.setupFormListeners();

        console.log('[PharmacistCorner] Initialized');
    }

    /**
     * Get today's date string in YYYY-MM-DD format
     */
    getTodayDateString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Load data from IndexedDB
     */
    async loadData() {
        try {
            this.appointments = await this.loadFromIndexedDB('appointments');
            this.instructions = await this.loadFromIndexedDB('instructions');
            this.expenses = await this.loadFromIndexedDB('expenses');
            
            console.log('[PharmacistCorner] Data loaded:', {
                appointments: this.appointments.length,
                instructions: this.instructions.length,
                expenses: this.expenses.length
            });
        } catch (error) {
            console.error('[PharmacistCorner] Failed to load data:', error);
        }
    }

    /**
     * Load data from IndexedDB store
     */
    loadFromIndexedDB(storeName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TWOK_Clinic_DB', 1);
            
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const getAllRequest = store.getAll();
                
                getAllRequest.onsuccess = () => {
                    resolve(getAllRequest.result || []);
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
     * Setup event listeners
     */
    setupEventListeners() {
        // Search input
        document.getElementById('patientSearchInput').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase().trim();
            this.render();
        });

        // Filter buttons
        document.querySelectorAll('.pharmacist-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.pharmacist-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.render();
            });
        });

        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('[PharmacistCorner] Browser is online');
        });

        window.addEventListener('offline', () => {
            console.log('[PharmacistCorner] Browser is offline');
        });

        // Listen for instruction/expense saved events
        window.addEventListener('instruction-saved', () => {
            this.loadData().then(() => this.render());
        });

        window.addEventListener('expense-saved', () => {
            this.loadData().then(() => this.render());
        });
    }

    /**
     * Setup form listeners
     */
    setupFormListeners() {
        // Forms are handled by their respective components
        // Just ensure they're available
        if (!window.instructionForm) {
            console.error('[PharmacistCorner] Instruction form not loaded');
        }
        if (!window.expenseForm) {
            console.error('[PharmacistCorner] Expense form not loaded');
        }
    }

    /**
     * Setup WebSocket for real-time updates
     */
    setupWebSocket() {
        if ('WebSocket' in window) {
            const wsUrl = 'ws://localhost:9000';
            
            try {
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('[PharmacistCorner] WebSocket connected');
                };
                
                this.ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'appointment_status_changed') {
                        // Reload data when appointment status changes
                        this.loadData().then(() => this.render());
                    }
                };
                
                this.ws.onclose = () => {
                    console.log('[PharmacistCorner] WebSocket disconnected');
                    // Reconnect after 5 seconds
                    setTimeout(() => this.setupWebSocket(), 5000);
                };
                
                this.ws.onerror = (error) => {
                    console.error('[PharmacistCorner] WebSocket error:', error);
                };
            } catch (error) {
                console.error('[PharmacistCorner] Failed to create WebSocket:', error);
            }
        }
    }

    /**
     * Update sync indicator
     */
    updateSyncIndicator(status, text) {
        const indicator = document.getElementById('syncIndicator');
        const statusText = document.getElementById('syncStatusText');

        if (!status) {
            indicator.classList.add('hidden');
            return;
        }

        indicator.classList.remove('hidden', 'syncing', 'synced');

        if (status === 'syncing') {
            indicator.classList.add('syncing');
        } else if (status === 'synced') {
            indicator.classList.add('synced');
        }
        
        statusText.textContent = text;
    }

    /**
     * Get filtered appointments (only "Done" status from today)
     */
    getFilteredAppointments() {
        // Filter appointments with status "Done" from today
        let filtered = this.appointments.filter(appt => {
            const apptDate = appt.appointmentTime ? appt.appointmentTime.split('T')[0] : '';
            return appt.status === 'Done' && apptDate === this.today;
        });

        // Apply search filter
        if (this.searchTerm) {
            filtered = filtered.filter(appt => {
                const patientName = (appt.patient_name || appt.patientName || '').toLowerCase();
                const bookingNumber = String(appt.booking_number || appt.bookingNumber || '');
                return patientName.includes(this.searchTerm) || bookingNumber.includes(this.searchTerm);
            });
        }

        // Apply status filter
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(appt => {
                const isCompleted = this.isAppointmentCompleted(appt);
                return this.currentFilter === 'completed' ? isCompleted : !isCompleted;
            });
        }

        // Sort by booking number
        filtered.sort((a, b) => {
            const aNum = parseInt(a.booking_number || a.bookingNumber || 0);
            const bNum = parseInt(b.booking_number || b.bookingNumber || 0);
            return aNum - bNum;
        });

        return filtered;
    }

    /**
     * Check if appointment is completed (has both instruction and expense)
     */
    isAppointmentCompleted(appt) {
        const apptId = appt.id || appt.appointment_id;
        const hasInstruction = this.instructions.some(inst => 
            inst.appointment_id === apptId || inst.appointmentId === apptId
        );
        const hasExpense = this.expenses.some(exp => 
            exp.appointment_id === apptId || exp.appointmentId === apptId
        );
        return hasInstruction && hasExpense;
    }

    /**
     * Check if appointment has instruction
     */
    hasInstruction(appt) {
        const apptId = appt.id || appt.appointment_id;
        return this.instructions.some(inst => 
            inst.appointment_id === apptId || inst.appointmentId === apptId
        );
    }

    /**
     * Check if appointment has expense
     */
    hasExpense(appt) {
        const apptId = appt.id || appt.appointment_id;
        return this.expenses.some(exp => 
            exp.appointment_id === apptId || exp.appointmentId === apptId
        );
    }

    /**
     * Render the view
     */
    render() {
        const filtered = this.getFilteredAppointments();
        const grid = document.getElementById('patientCardsGrid');
        const noResults = document.getElementById('noResultsMessage');

        // Update stats
        this.updateStats(filtered);

        if (filtered.length === 0) {
            grid.innerHTML = '';
            noResults.classList.remove('hidden');
            return;
        }

        noResults.classList.add('hidden');
        grid.innerHTML = filtered.map(appt => this.createPatientCard(appt)).join('');

        // Attach event listeners to cards
        this.attachCardListeners();
    }

    /**
     * Update statistics
     */
    updateStats(filtered) {
        const total = filtered.length;
        const completed = filtered.filter(appt => this.isAppointmentCompleted(appt)).length;
        const pending = total - completed;

        document.getElementById('totalPatientsCount').textContent = total;
        document.getElementById('pendingCount').textContent = pending;
        document.getElementById('completedCount').textContent = completed;
    }

    /**
     * Create patient card HTML
     */
    createPatientCard(appt) {
        const isCompleted = this.isAppointmentCompleted(appt);
        const hasInst = this.hasInstruction(appt);
        const hasExp = this.hasExpense(appt);
        const bookingNum = appt.booking_number || appt.bookingNumber || '-';
        const patientName = appt.patient_name || appt.patientName || 'Unknown';
        const age = appt.age || appt.patientAge || '-';
        const doctorName = appt.doctor_name || appt.doctorName || 'Unknown';

        return `
            <div class="patient-card ${isCompleted ? 'completed' : ''}" data-appointment-id="${appt.id || appt.appointment_id}">
                <div class="patient-card-header">
                    <span class="patient-card-booking">#${bookingNum}</span>
                    <span class="patient-card-status ${isCompleted ? 'completed' : 'pending'}">
                        ${isCompleted ? '✓ Completed' : '⏳ Pending'}
                    </span>
                </div>
                <div class="patient-card-body">
                    <h3 class="patient-card-name">${patientName}</h3>
                    <div class="patient-card-info">
                        <div class="patient-card-info-item">
                            <strong>Age</strong>
                            ${age}
                        </div>
                        <div class="patient-card-info-item">
                            <strong>Doctor</strong>
                            ${doctorName}
                        </div>
                    </div>
                    <div class="patient-card-actions">
                        <button class="patient-card-btn patient-card-btn-instructions" 
                                data-action="instructions" 
                                data-appointment='${JSON.stringify(appt).replace(/'/g, "&apos;")}'>
                            📝 Instructions
                        </button>
                        <button class="patient-card-btn patient-card-btn-expenses" 
                                data-action="expenses" 
                                data-appointment='${JSON.stringify(appt).replace(/'/g, "&apos;")}'>
                            💰 Expenses
                        </button>
                    </div>
                    ${isCompleted ? `
                        <div class="patient-card-completed-badge">
                            ✓ Completed
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners to cards
     */
    attachCardListeners() {
        document.querySelectorAll('.patient-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const appointmentStr = e.target.dataset.appointment;
                
                try {
                    const appointment = JSON.parse(appointmentStr.replace(/&apos;/g, "'"));
                    
                    if (action === 'instructions') {
                        window.instructionForm.show(appointment);
                    } else if (action === 'expenses') {
                        window.expenseForm.show(appointment);
                    }
                } catch (error) {
                    console.error('[PharmacistCorner] Failed to parse appointment data:', error);
                }
            });
        });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.pharmacistCorner = new PharmacistCornerApp();
});
