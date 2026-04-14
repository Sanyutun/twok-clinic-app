/**
 * Global Expense Form Component
 * Reusable form for recording expenses with Lab Tracker integration
 */

class ExpenseFormComponent {
    constructor() {
        this.currentAppointment = null;
        this.isVisible = false;
        this.isSubmitting = false; // Prevent double submissions
        this.init();
    }

    /**
     * Initialize component
     */
    init() {
        this.createModal();
        this.attachEventListeners();
        this.populateCustomExpenseTypes();
        this.populateLabNameDatalist();
    }

    /**
     * Populate lab name datalist from saved lab names
     */
    populateLabNameDatalist() {
        const datalist = document.getElementById('globalLabNameOptions');
        if (!datalist) return;

        // Load lab names
        let labNames = ['TWOK', 'NN', 'YN', 'BH'];
        try {
            const saved = localStorage.getItem('twok_clinic_lab_names');
            if (saved) {
                const savedNames = JSON.parse(saved);
                savedNames.forEach(name => {
                    if (!labNames.includes(name)) {
                        labNames.push(name);
                    }
                });
            }
        } catch (error) {
            console.warn('[ExpenseForm] Could not load lab names:', error);
        }

        // Clear and repopulate
        datalist.innerHTML = '';
        labNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            datalist.appendChild(option);
        });
    }

    /**
     * Populate custom expense types in dropdown
     */
    populateCustomExpenseTypes() {
        const select = document.getElementById('globalExpenseType');
        if (!select) return;

        // Remove previously added custom options (keep default + Custom)
        const existingCustomOptions = select.querySelectorAll('.custom-type-option');
        existingCustomOptions.forEach(opt => opt.remove());

        // Load custom types from localStorage
        let customTypes = [];
        try {
            const stored = localStorage.getItem('twok_clinic_custom_expense_types');
            customTypes = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('[ExpenseForm] Could not load custom types:', error);
            return;
        }

        if (customTypes.length === 0) return;

        // Find the "Custom" option to insert before it
        const customOption = select.querySelector('option[value="Custom"]');
        
        // Add custom types before the "Custom" option
        customTypes.forEach(ct => {
            const option = document.createElement('option');
            option.value = `${ct.icon} ${ct.name}`.trim();
            option.textContent = `${ct.icon} ${ct.name}`.trim();
            option.classList.add('custom-type-option');
            select.insertBefore(option, customOption);
        });
        
        console.log(`[ExpenseForm] Loaded ${customTypes.length} custom expense types into dropdown`);
    }

    /**
     * Create modal HTML
     */
    createModal() {
        const modalHTML = `
            <div id="expenseFormModal" class="global-form-modal hidden">
                <div class="global-form-modal-backdrop"></div>
                <div class="global-form-modal-content">
                    <div class="global-form-modal-header">
                        <h3>💰 Record Expense</h3>
                        <button type="button" class="global-form-modal-close">&times;</button>
                    </div>
                    <div class="global-form-modal-body">
                        <form id="globalExpenseForm">
                            <input type="hidden" id="globalExpenseAppointmentId">
                            <input type="hidden" id="globalExpensePatientId">

                            <div class="form-group" style="position: relative;">
                                <label>Patient Name</label>
                                <input type="text" id="globalExpensePatientName" class="form-control" placeholder="Search patient..." autocomplete="off" tabindex="1" inputmode="text">
                                <div id="globalExpensePatientAutocomplete" class="autocomplete-dropdown hidden"></div>
                                <input type="hidden" id="globalExpensePatientIdHidden">
                            </div>

                            <div class="form-group" style="position: relative;">
                                <label>Doctor Name</label>
                                <input type="text" id="globalExpenseDoctorName" class="form-control" placeholder="Search doctor..." autocomplete="off" tabindex="2" inputmode="text">
                                <div id="globalExpenseDoctorAutocomplete" class="autocomplete-dropdown hidden"></div>
                                <input type="hidden" id="globalExpenseDoctorIdHidden">
                            </div>

                            <div class="form-group">
                                <label for="globalExpenseType">Expense Type <span class="required">*</span></label>
                                <select id="globalExpenseType" class="form-control" required tabindex="3">
                                    <option value="">Select Type</option>
                                    <option value="Speciality Fee">👨‍⚕️ Speciality Fee</option>
                                    <option value="MO fees">🩺 MO fees</option>
                                    <option value="Radiologist Fees">🩻 Radiologist Fees</option>
                                    <option value="UNC Prepaid">💳 UNC Prepaid</option>
                                    <option value="Lab">🔬 Lab</option>
                                    <option value="X-ray OnCall">📡 X-ray OnCall</option>
                                    <option value="X-ray Opinion">🔍 X-ray Opinion</option>
                                    <option value="From Aung Nay Won">👤 From Aung Nay Won</option>
                                    <option value="Refer fees">📋 Refer fees</option>
                                    <option value="Promotion">🎁 Promotion</option>
                                    <option value="Kpay">📱 Kpay</option>
                                    <option value="Tax">💰 Tax</option>
                                    <option value="Donation">💝 Donation</option>
                                    <option value="Transportion">🚗 Transportion</option>
                                    <option value="Paper work">📄 Paper work</option>
                                    <option value="Structure">🏗️ Structure</option>
                                    <option value="General expense">🧾 General expense</option>
                                    <option value="Medicine">💊 Medicine</option>
                                    <option value="Shopping">🛒 Shopping</option>
                                    <option value="Custom">➕ Create New Type</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="globalExpenseItemName">Item Name <span class="required">*</span></label>
                                <input type="text" id="globalExpenseItemName" class="form-control" required placeholder="e.g., CBC Test, Paracetamol" tabindex="4" inputmode="text">
                            </div>

                            <!-- Custom Expense Type Section -->
                            <div id="globalCustomExpenseTypeSection" class="hidden" style="background-color: #f0fdf4; padding: 15px; border-radius: var(--radius); border: 1px solid #bbf7d0; margin-bottom: 15px;">
                                <div class="form-group" style="margin-bottom: 12px;">
                                    <label for="globalCustomExpenseType">Custom Type Name <span class="required">*</span></label>
                                    <input type="text" id="globalCustomExpenseType" class="form-control" placeholder="e.g., Therapy, Consultation Fee">
                                </div>
                                <div class="form-group">
                                    <label style="margin-bottom: 8px;">Choose an Icon</label>
                                    <div id="globalIconSelector" class="icon-selector" style="display: flex; flex-wrap: wrap; gap: 8px;">
                                        <!-- Medical & Healthcare -->
                                        <button type="button" class="icon-option" data-icon="💊" data-label="Medicine">💊</button>
                                        <button type="button" class="icon-option" data-icon="💉" data-label="Injection">💉</button>
                                        <button type="button" class="icon-option" data-icon="🔬" data-label="Lab">🔬</button>
                                        <button type="button" class="icon-option" data-icon="🩺" data-label="Doctor">🩺</button>
                                        <button type="button" class="icon-option" data-icon="🏥" data-label="Hospital">🏥</button>
                                        <button type="button" class="icon-option" data-icon="🏨" data-label="Clinic">🏨</button>
                                        <button type="button" class="icon-option" data-icon="🚑" data-label="Ambulance">🚑</button>
                                        <button type="button" class="icon-option" data-icon="👨‍⚕️" data-label="Male Doctor">👨‍⚕️</button>
                                        <button type="button" class="icon-option" data-icon="👩‍⚕️" data-label="Female Doctor">👩‍⚕️</button>
                                        <button type="button" class="icon-option" data-icon="🧑‍⚕️" data-label="Health Worker">🧑‍⚕️</button>

                                        <!-- Medical Tests & Diagnostics -->
                                        <button type="button" class="icon-option" data-icon="🩻" data-label="X-Ray">🩻</button>
                                        <button type="button" class="icon-option" data-icon="❤️" data-label="Heart/ECG">❤️</button>
                                        <button type="button" class="icon-option" data-icon="📡" data-label="Ultrasound">📡</button>
                                        <button type="button" class="icon-option" data-icon="🧪" data-label="Test">🧪</button>
                                        <button type="button" class="icon-option" data-icon="🧬" data-label="DNA">🧬</button>
                                        <button type="button" class="icon-option" data-icon="🩸" data-label="Blood">🩸</button>
                                        <button type="button" class="icon-option" data-icon="🧫" data-label="Culture">🧫</button>
                                        <button type="button" class="icon-option" data-icon="🔍" data-label="Examination">🔍</button>

                                        <!-- Treatments & Procedures -->
                                        <button type="button" class="icon-option" data-icon="💆" data-label="Massage">💆</button>
                                        <button type="button" class="icon-option" data-icon="🏋️" data-label="Physio">🏋️</button>
                                        <button type="button" class="icon-option" data-icon="🧘" data-label="Therapy">🧘</button>
                                        <button type="button" class="icon-option" data-icon="🩹" data-label="Bandage">🩹</button>
                                        <button type="button" class="icon-option" data-icon="🧴" data-label="Ointment">🧴</button>
                                        <button type="button" class="icon-option" data-icon="💧" data-label="IV/Fluid">💧</button>
                                        <button type="button" class="icon-option" data-icon="🫁" data-label="Lungs">🫁</button>
                                        <button type="button" class="icon-option" data-icon="🦷" data-label="Dental">🦷</button>
                                        <button type="button" class="icon-option" data-icon="👁️" data-label="Eye">👁️</button>

                                        <!-- Administrative & Financial -->
                                        <button type="button" class="icon-option" data-icon="💰" data-label="Cost">💰</button>
                                        <button type="button" class="icon-option" data-icon="💵" data-label="Money">💵</button>
                                        <button type="button" class="icon-option" data-icon="💳" data-label="Card Payment">💳</button>
                                        <button type="button" class="icon-option" data-icon="🧾" data-label="Receipt">🧾</button>
                                        <button type="button" class="icon-option" data-icon="📋" data-label="Form">📋</button>
                                        <button type="button" class="icon-option" data-icon="📝" data-label="Note">📝</button>
                                        <button type="button" class="icon-option" data-icon="📄" data-label="Document">📄</button>
                                        <button type="button" class="icon-option" data-icon="📑" data-label="Reports">📑</button>

                                        <!-- Equipment & Supplies -->
                                        <button type="button" class="icon-option" data-icon="🔧" data-label="Tool">🔧</button>
                                        <button type="button" class="icon-option" data-icon="📦" data-label="Package">📦</button>
                                        <button type="button" class="icon-option" data-icon="🛒" data-label="Purchase">🛒</button>
                                        <button type="button" class="icon-option" data-icon="🖨️" data-label="Printer">🖨️</button>
                                        <button type="button" class="icon-option" data-icon="💻" data-label="Computer">💻</button>
                                        <button type="button" class="icon-option" data-icon="📱" data-label="Phone">📱</button>
                                    </div>
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="globalExpenseAmount">Amount (MMK) <span class="required">*</span></label>
                                <input type="number" id="globalExpenseAmount" class="form-control" required placeholder="e.g., 5000" min="0" tabindex="5" inputmode="numeric">
                            </div>

                            <div class="form-group">
                                <label for="globalExpenseDateTime">Date & Time *</label>
                                <input type="datetime-local" id="globalExpenseDateTime" class="form-control" required tabindex="6">
                            </div>

                            <div class="form-group">
                                <label for="globalExpenseNote">Notes (optional)</label>
                                <textarea id="globalExpenseNote" class="form-control" rows="3" placeholder="Additional notes..." tabindex="7"></textarea>
                            </div>

                            <!-- Lab Tracker Auto-Create Fields (shown only for Lab) -->
                            <div id="globalLabTrackerFields" class="lab-tracker-fields hidden" style="background-color: #eff6ff; padding: 15px; border-radius: var(--radius); border: 1px solid #bfdbfe; margin-bottom: 20px;">
                                <h4 style="margin: 0 0 10px 0; color: #1e40af; font-size: 0.95rem;">🔬 Lab Tracker Entry</h4>
                                <p style="font-size: 0.85rem; color: #6b7280; margin: 0 0 10px 0;">A lab tracker entry will be automatically created</p>

                                <div class="form-group" style="margin-bottom: 10px;">
                                    <label for="globalLabName">Lab Name</label>
                                    <input type="text" id="globalLabName" class="form-control" list="globalLabNameOptions" placeholder="Select or type lab name" autocomplete="off">
                                    <datalist id="globalLabNameOptions">
                                        <option value="TWOK">
                                        <option value="NN">
                                        <option value="YN">
                                        <option value="BH">
                                    </datalist>
                                </div>
                            </div>
                            
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary btn-block">💾 Save Expense</button>
                                <button type="button" class="btn btn-secondary btn-block close-form">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add styles if not already present
        if (!document.getElementById('expense-form-styles')) {
            this.addStyles();
        }
    }

    /**
     * Add modal styles
     */
    addStyles() {
        const styles = document.createElement('style');
        styles.id = 'expense-form-styles';
        styles.textContent = `
            .global-form-modal-backdrop {
                pointer-events: none;
            }

            .icon-option {
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.3rem;
                border: 2px solid var(--border-color);
                border-radius: var(--radius);
                background-color: white;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .icon-option:hover {
                border-color: #10b981;
                background-color: #f0fdf4;
                transform: scale(1.05);
            }

            .icon-option.selected {
                border-color: #10b981;
                background-color: #d1fae5;
                box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
                transform: scale(1.05);
            }

            .lab-tracker-fields {
                transition: all 0.2s ease;
            }

            .lab-tracker-fields.hidden {
                display: none;
            }

            #globalCustomExpenseTypeSection.hidden {
                display: none;
            }

            .spinner-inline {
                display: inline-block;
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-top-color: #fff;
                border-radius: 50%;
                animation: spin-inline 0.6s linear infinite;
                margin-right: 6px;
                vertical-align: middle;
            }

            @keyframes spin-inline {
                to {
                    transform: rotate(360deg);
                }
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close button (X)
        document.querySelector('#expenseFormModal .global-form-modal-close').addEventListener('click', () => {
            this.hide();
        });

        // Close button in form actions (Cancel)
        document.querySelector('#expenseFormModal .close-form').addEventListener('click', () => {
            this.hide();
        });

        // Form submit
        document.getElementById('globalExpenseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Show/hide lab tracker fields and custom section based on expense type
        document.getElementById('globalExpenseType').addEventListener('change', (e) => {
            const labFields = document.getElementById('globalLabTrackerFields');
            const customSection = document.getElementById('globalCustomExpenseTypeSection');

            if (e.target.value === 'Lab' || e.target.value === 'Lab Test') {
                labFields.classList.remove('hidden');
            } else {
                labFields.classList.add('hidden');
            }

            // Show/hide custom expense type section
            if (e.target.value === 'Custom') {
                customSection.classList.remove('hidden');
                // Focus custom type input
                setTimeout(() => document.getElementById('globalCustomExpenseType').focus(), 100);
            } else {
                customSection.classList.add('hidden');
                // Reset custom fields
                document.getElementById('globalCustomExpenseType').value = '';
                document.querySelectorAll('.icon-option').forEach(btn => btn.classList.remove('selected'));
            }
        });

        // Icon selector click handlers
        document.querySelectorAll('.icon-option').forEach(btn => {
            btn.addEventListener('click', () => {
                // Deselect all
                document.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
                // Select clicked
                btn.classList.add('selected');
            });
        });

        // Patient autocomplete
        const expensePatientNameInput = document.getElementById('globalExpensePatientName');
        const expenseAutocomplete = document.getElementById('globalExpensePatientAutocomplete');
        let expensePatientHighlighted = -1;

        expensePatientNameInput.addEventListener('input', (e) => {
            this.showExpensePatientAutocomplete(e.target.value);
            expensePatientHighlighted = -1;
        });

        expensePatientNameInput.addEventListener('focus', (e) => {
            if (e.target.value) this.showExpensePatientAutocomplete(e.target.value);
        });

        expensePatientNameInput.addEventListener('keydown', (e) => {
            const items = expenseAutocomplete.querySelectorAll('.autocomplete-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                expensePatientHighlighted = Math.min(expensePatientHighlighted + 1, items.length - 1);
                items.forEach((item, idx) => {
                    item.classList.toggle('highlighted', idx === expensePatientHighlighted);
                });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                expensePatientHighlighted = Math.max(expensePatientHighlighted - 1, -1);
                items.forEach((item, idx) => {
                    item.classList.toggle('highlighted', idx === expensePatientHighlighted);
                });
            } else if (e.key === 'Enter' && expensePatientHighlighted >= 0) {
                e.preventDefault();
                items[expensePatientHighlighted].click();
                expenseAutocomplete.classList.add('hidden');
            } else if (e.key === 'Escape') {
                expenseAutocomplete.classList.add('hidden');
            }
        });

        // Close autocomplete when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#globalExpensePatientName') && !e.target.closest('#globalExpensePatientAutocomplete')) {
                expenseAutocomplete.classList.add('hidden');
            }
        });

        // Doctor autocomplete
        const expenseDoctorNameInput = document.getElementById('globalExpenseDoctorName');
        const expenseDoctorAutocomplete = document.getElementById('globalExpenseDoctorAutocomplete');
        let expenseDoctorHighlighted = -1;

        expenseDoctorNameInput.addEventListener('input', (e) => {
            this.showExpenseDoctorAutocomplete(e.target.value);
            expenseDoctorHighlighted = -1;
        });

        expenseDoctorNameInput.addEventListener('focus', (e) => {
            if (e.target.value) this.showExpenseDoctorAutocomplete(e.target.value);
        });

        expenseDoctorNameInput.addEventListener('keydown', (e) => {
            const items = expenseDoctorAutocomplete.querySelectorAll('.autocomplete-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                expenseDoctorHighlighted = Math.min(expenseDoctorHighlighted + 1, items.length - 1);
                items.forEach((item, idx) => {
                    item.classList.toggle('highlighted', idx === expenseDoctorHighlighted);
                });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                expenseDoctorHighlighted = Math.max(expenseDoctorHighlighted - 1, -1);
                items.forEach((item, idx) => {
                    item.classList.toggle('highlighted', idx === expenseDoctorHighlighted);
                });
            } else if (e.key === 'Enter' && expenseDoctorHighlighted >= 0) {
                e.preventDefault();
                items[expenseDoctorHighlighted].click();
                expenseDoctorAutocomplete.classList.add('hidden');
            } else if (e.key === 'Escape') {
                expenseDoctorAutocomplete.classList.add('hidden');
            }
        });

        // Close doctor autocomplete when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#globalExpenseDoctorName') && !e.target.closest('#globalExpenseDoctorAutocomplete')) {
                expenseDoctorAutocomplete.classList.add('hidden');
            }
        });

        // Add Enter key navigation for all form fields
        this.setupKeyNavigation('globalExpensePatientName', 'globalExpenseDoctorName');
        this.setupKeyNavigation('globalExpenseDoctorName', 'globalExpenseType', true); // true = open dropdown
        this.setupKeyNavigation('globalExpenseType', 'globalExpenseItemName');
        this.setupKeyNavigation('globalExpenseItemName', 'globalExpenseAmount');
        this.setupKeyNavigation('globalExpenseAmount', 'globalExpenseDateTime');
        this.setupKeyNavigation('globalExpenseDateTime', 'globalExpenseNote');

        // Expense type dropdown - focus item name when changed
        document.getElementById('globalExpenseType').addEventListener('change', () => {
            setTimeout(() => {
                document.getElementById('globalExpenseItemName').focus();
            }, 100);
        });

        // Mobile-friendly auto-advance on input change
        document.getElementById('globalExpensePatientName').addEventListener('blur', () => {
            // On mobile, when patient name is selected and user moves away, focus doctor
            setTimeout(() => {
                if (!document.activeElement.closest('#globalExpensePatientName') && document.getElementById('globalExpensePatientName').value) {
                    document.getElementById('globalExpenseDoctorName').focus();
                }
            }, 200);
        });

        document.getElementById('globalExpenseDoctorName').addEventListener('blur', () => {
            setTimeout(() => {
                if (!document.activeElement.closest('#globalExpenseDoctorName') && document.getElementById('globalExpenseDoctorName').value) {
                    document.getElementById('globalExpenseType').focus();
                }
            }, 200);
        });

        document.getElementById('globalExpenseItemName').addEventListener('blur', () => {
            setTimeout(() => {
                if (!document.activeElement.closest('#globalExpenseItemName') && document.getElementById('globalExpenseItemName').value) {
                    document.getElementById('globalExpenseAmount').focus();
                }
            }, 200);
        });

        document.getElementById('globalExpenseAmount').addEventListener('blur', () => {
            setTimeout(() => {
                if (!document.activeElement.closest('#globalExpenseAmount')) {
                    document.getElementById('globalExpenseDateTime').focus();
                }
            }, 200);
        });

        // Date & Time - always focus Notes on blur (mobile)
        document.getElementById('globalExpenseDateTime').addEventListener('blur', () => {
            setTimeout(() => {
                if (!document.activeElement.closest('#globalExpenseDateTime')) {
                    document.getElementById('globalExpenseNote').focus();
                }
            }, 200);
        });

        // Notes textarea - focus save button on Ctrl+Enter
        document.getElementById('globalExpenseNote').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('globalExpenseForm').dispatchEvent(new Event('submit', { cancelable: true }));
            }
        });
    }

    /**
     * Setup Enter key navigation between form fields
     */
    setupKeyNavigation(fromId, toId, openDropdown = false) {
        const fromElement = document.getElementById(fromId);
        if (!fromElement) return;

        fromElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Don't prevent default for textarea (allow new lines)
                if (fromElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                }
                const toElement = document.getElementById(toId);
                if (toElement) {
                    toElement.focus();
                    // Select text for input fields
                    if (toElement.tagName === 'INPUT' && toElement.type !== 'datetime-local') {
                        toElement.select();
                    } else if (toElement.tagName === 'SELECT' && openDropdown) {
                        // Open dropdown by simulating Alt+ArrowDown or using showPicker
                        if (typeof toElement.showPicker === 'function') {
                            toElement.showPicker();
                        } else {
                            // Fallback: dispatch keydown events to open dropdown
                            const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
                            toElement.dispatchEvent(downEvent);
                            const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
                            toElement.dispatchEvent(spaceEvent);
                        }
                    }
                }
            }
        });
    }

    /**
     * Show form with appointment data or standalone mode
     */
    show(appointment = null) {
        this.currentAppointment = appointment;
        this.isEditing = false;
        this.editingExpenseId = null;

        // Reset form
        document.getElementById('globalExpenseType').value = '';
        document.getElementById('globalExpenseItemName').value = '';
        document.getElementById('globalExpenseAmount').value = '';
        document.getElementById('globalExpenseNote').value = '';
        document.getElementById('globalLabName').value = 'TWOK';
        document.getElementById('globalCustomExpenseType').value = '';

        // Refresh custom expense types in dropdown
        this.populateCustomExpenseTypes();
        this.populateLabNameDatalist();

        // Set default date/time to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('globalExpenseDateTime').value = now.toISOString().slice(0, 16);

        // Hide lab tracker fields
        document.getElementById('globalLabTrackerFields').classList.add('hidden');

        // Hide custom expense type section
        document.getElementById('globalCustomExpenseTypeSection').classList.add('hidden');
        document.querySelectorAll('.icon-option').forEach(btn => btn.classList.remove('selected'));

        // Populate form fields if appointment is provided
        if (appointment) {
            document.getElementById('globalExpenseAppointmentId').value = appointment.id || appointment.appointment_id || '';
            document.getElementById('globalExpensePatientId').value = appointment.patient_id || '';
            document.getElementById('globalExpensePatientIdHidden').value = appointment.patient_id || '';
            document.getElementById('globalExpensePatientName').value = appointment.patient_name || appointment.patientName || '';
            document.getElementById('globalExpenseDoctorIdHidden').value = appointment.doctor_id || '';
            document.getElementById('globalExpenseDoctorName').value = appointment.doctor_name || appointment.doctorName || '';

            // Make patient/doctor fields readonly when linked to appointment
            document.getElementById('globalExpensePatientName').readOnly = true;
            document.getElementById('globalExpensePatientName').placeholder = 'Patient name (from appointment)';
            document.getElementById('globalExpenseDoctorName').readOnly = true;
            document.getElementById('globalExpenseDoctorName').placeholder = 'Doctor name (from appointment)';
        } else {
            // Standalone mode - clear appointment/patient fields and make editable
            document.getElementById('globalExpenseAppointmentId').value = '';
            document.getElementById('globalExpensePatientId').value = '';
            document.getElementById('globalExpensePatientIdHidden').value = '';
            document.getElementById('globalExpensePatientName').value = '';
            document.getElementById('globalExpensePatientName').placeholder = 'Search patient...';
            document.getElementById('globalExpensePatientName').readOnly = false;
            document.getElementById('globalExpenseDoctorIdHidden').value = '';
            document.getElementById('globalExpenseDoctorName').value = '';
            document.getElementById('globalExpenseDoctorName').placeholder = 'Search doctor...';
            document.getElementById('globalExpenseDoctorName').readOnly = false;
        }

        // Refresh custom expense types in dropdown
        this.populateCustomExpenseTypes();
        this.populateLabNameDatalist();

        // Update header
        document.querySelector('#expenseFormModal .global-form-modal-header h3').textContent = '💰 Record Expense';

        // Show modal
        document.getElementById('expenseFormModal').classList.remove('hidden');
        this.isVisible = true;

        // Focus on Patient Name field after a brief delay to allow modal to render
        setTimeout(() => {
            document.getElementById('globalExpensePatientName').focus();
        }, 100);
    }

    /**
     * Edit an existing expense
     */
    async edit(expenseData) {
        this.currentAppointment = null;
        this.isEditing = true;
        this.editingExpenseId = expenseData.id;
        this.originalExpenseData = expenseData; // Store for preserving dateTime
        this.editingLabId = null; // Reset lab ID

        // If this is a Lab expense, find the associated lab tracker entry
        const expenseCategory = expenseData.expense_type || expenseData.category || '';
        if (expenseCategory === 'Lab' || expenseCategory === 'Lab Test') {
            try {
                // First try to find lab by expenseId link (most reliable)
                const labRecords = window.labRecords || (await window.TWOKDB.getAll(window.TWOKDB.STORES.LAB_TRACKER)) || [];
                const matchingLab = labRecords.find(lab =>
                    lab.expenseId === expenseData.id
                );
                
                if (matchingLab) {
                    this.editingLabId = matchingLab.labId || matchingLab.id;
                    console.log('[ExpenseForm] Found existing lab entry by expenseId:', this.editingLabId);
                } else {
                    // Fallback: try to find by patientId + amount + dateTime (legacy matching)
                    const fallbackLab = labRecords.find(lab =>
                        lab.patientId === expenseData.patientId &&
                        lab.amount === expenseData.amount &&
                        lab.dateTime === expenseData.dateTime
                    );
                    if (fallbackLab) {
                        this.editingLabId = fallbackLab.labId || fallbackLab.id;
                        console.log('[ExpenseForm] Found existing lab entry by fallback match:', this.editingLabId);
                    }
                }
            } catch (err) {
                console.warn('[ExpenseForm] Could not find associated lab entry:', err);
            }
        }

        // Populate form with existing expense data
        document.getElementById('globalExpenseAppointmentId').value = expenseData.appointment_id || '';
        document.getElementById('globalExpensePatientId').value = expenseData.patient_id || '';
        document.getElementById('globalExpensePatientIdHidden').value = expenseData.patient_id || '';
        document.getElementById('globalExpensePatientName').value = expenseData.patient_name || expenseData.patientName || '';
        document.getElementById('globalExpenseDoctorIdHidden').value = expenseData.doctor_id || '';
        document.getElementById('globalExpenseDoctorName').value = expenseData.doctor_name || expenseData.doctorName || '';

        // Make patient/doctor fields editable for standalone expenses
        document.getElementById('globalExpensePatientName').readOnly = false;
        document.getElementById('globalExpensePatientName').placeholder = 'Search patient...';
        document.getElementById('globalExpenseDoctorName').readOnly = false;
        document.getElementById('globalExpenseDoctorName').placeholder = 'Search doctor...';

        // Map expense category/type to form fields
        const expenseType = expenseData.expense_type || expenseData.category || '';
        
        // Check if it's a custom type (has icon prefix)
        const customTypeName = expenseData.custom_type_name;
        const customIcon = expenseData.custom_icon;
        
        if (customTypeName && customIcon) {
            // Custom type with icon - show custom section
            document.getElementById('globalExpenseType').value = 'Custom';
            document.getElementById('globalCustomExpenseTypeSection').classList.remove('hidden');
            document.getElementById('globalCustomExpenseType').value = customTypeName;

            // Select matching icon
            const iconBtn = document.querySelector(`.icon-option[data-icon="${customIcon}"]`);
            if (iconBtn) {
                document.querySelectorAll('.icon-option').forEach(btn => btn.classList.remove('selected'));
                iconBtn.classList.add('selected');
            }
        } else {
            // Check if it looks like a custom type (starts with emoji)
            const isCustomFormat = expenseType.includes(' ') && /^[\u{1F300}-\u{1F9FF}]/u.test(expenseType);
            if (isCustomFormat) {
                const parts = expenseType.split(' ');
                const icon = parts[0];
                const typeName = parts.slice(1).join(' ');
                
                document.getElementById('globalExpenseType').value = 'Custom';
                document.getElementById('globalCustomExpenseTypeSection').classList.remove('hidden');
                document.getElementById('globalCustomExpenseType').value = typeName;

                // Select matching icon
                const iconBtn = document.querySelector(`.icon-option[data-icon="${icon}"]`);
                if (iconBtn) {
                    document.querySelectorAll('.icon-option').forEach(btn => btn.classList.remove('selected'));
                    iconBtn.classList.add('selected');
                }
            } else {
                document.getElementById('globalExpenseType').value = expenseType;
            }
        }

        document.getElementById('globalExpenseItemName').value = expenseData.item_name || expenseData.remark || '';
        document.getElementById('globalExpenseAmount').value = expenseData.amount || '';
        document.getElementById('globalExpenseNote').value = expenseData.note || '';
        document.getElementById('globalLabName').value = 'TWOK';

        // Set date/time from existing expense
        if (expenseData.dateTime) {
            const dateTime = new Date(expenseData.dateTime);
            dateTime.setMinutes(dateTime.getMinutes() - dateTime.getTimezoneOffset());
            document.getElementById('globalExpenseDateTime').value = dateTime.toISOString().slice(0, 16);
        }

        // Show lab tracker fields if Lab
        if (expenseType === 'Lab' || expenseType === 'Lab Test') {
            document.getElementById('globalLabTrackerFields').classList.remove('hidden');
        } else {
            document.getElementById('globalLabTrackerFields').classList.add('hidden');
        }

        // Refresh custom expense types in dropdown
        this.populateCustomExpenseTypes();
        this.populateLabNameDatalist();

        // Update header
        document.querySelector('#expenseFormModal .global-form-modal-header h3').textContent = '✏️ Edit Expense';

        // Show modal
        document.getElementById('expenseFormModal').classList.remove('hidden');
        this.isVisible = true;
    }

    /**
     * Hide form
     */
    hide() {
        document.getElementById('expenseFormModal').classList.add('hidden');
        this.isVisible = false;
        this.currentAppointment = null;
        this.isEditing = false;
        this.editingExpenseId = null;
        this.originalExpenseData = null;
        this.editingLabId = null;
        // Reset submitting state when form is hidden
        if (this.isSubmitting) {
            this.isSubmitting = false;
            this.updateSubmitButtonState(false);
        }
    }

    /**
     * Update submit button state (disabled/loading)
     */
    updateSubmitButtonState(isSubmitting) {
        const submitButton = document.querySelector('#globalExpenseForm button[type="submit"]');
        if (!submitButton) return;

        if (isSubmitting) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-inline"></span> Saving...';
            submitButton.style.opacity = '0.7';
            submitButton.style.cursor = 'not-allowed';
        } else {
            submitButton.disabled = false;
            submitButton.innerHTML = '💾 Save Expense';
            submitButton.style.opacity = '1';
            submitButton.style.cursor = 'pointer';
        }
    }

    /**
     * Handle form submission
     */
    async handleSubmit() {
        // Prevent double submissions
        if (this.isSubmitting) {
            console.log('[ExpenseForm] ⚠️ Submission already in progress, ignoring duplicate request');
            return;
        }

        let expenseType = document.getElementById('globalExpenseType').value;
        let customTypeName = '';
        let customIcon = '';

        // Handle custom expense type
        if (expenseType === 'Custom') {
            customTypeName = document.getElementById('globalCustomExpenseType').value.trim();
            const selectedIcon = document.querySelector('.icon-option.selected');

            if (!customTypeName) {
                this.showNotification('Please enter a custom type name', 'error');
                return;
            }

            if (selectedIcon) {
                customIcon = selectedIcon.dataset.icon;
            } else {
                this.showNotification('Please select an icon for the custom type', 'error');
                return;
            }

            // Format as "icon Name" for consistency
            expenseType = `${customIcon} ${customTypeName}`.trim();

            // Save custom type for future use
            if (typeof window.saveCustomExpenseType === 'function') {
                const saved = window.saveCustomExpenseType({ icon: customIcon, name: customTypeName });
                if (saved) {
                    this.showNotification(`Custom type "${customTypeName}" saved for future use! ✓`, 'success');
                    // Refresh dropdown to include the new custom type
                    this.populateCustomExpenseTypes();
                }
            }
        }

        const appointmentId = document.getElementById('globalExpenseAppointmentId').value;
        const patientId = document.getElementById('globalExpensePatientId').value;
        const patientName = document.getElementById('globalExpensePatientName').value;
        const doctorName = document.getElementById('globalExpenseDoctorName').value;
        const itemName = document.getElementById('globalExpenseItemName').value;
        const amountValue = document.getElementById('globalExpenseAmount').value;
        const note = document.getElementById('globalExpenseNote').value;
        const dateTime = document.getElementById('globalExpenseDateTime').value;

        // Validate amount
        const amount = parseFloat(amountValue);

        if (isNaN(amount) || amount <= 0) {
            this.showNotification('Please enter a valid positive amount', 'error');
            return;
        }

        // Validate date/time
        if (!dateTime) {
            this.showNotification('Please select date and time', 'error');
            return;
        }

        // Convert datetime-local value to ISO string
        const dateTimeISO = new Date(dateTime).toISOString();

        // Build expense data in legacy format for compatibility with Expenses tab
        const expenseData = {
            id: this.editingExpenseId || ('EXP' + Date.now()),
            amount: amount,
            category: expenseType,
            remark: itemName || null,
            patientId: patientId || null,
            patientName: patientName || null,
            note: note || null,
            dateTime: dateTimeISO,
            createdTime: this.editingExpenseId ? (this.originalExpenseData?.createdTime || new Date().toISOString()) : new Date().toISOString(),
            appointment_id: appointmentId || null,
            doctor_name: doctorName || null,
            item_name: itemName,
            expense_type: expenseType,
            custom_type_name: customTypeName || null,
            custom_icon: customIcon || null,
            timestamp: new Date().toISOString()
        };

        // Set submitting state and disable button
        this.isSubmitting = true;
        this.updateSubmitButtonState(true);

        try {
            // CRITICAL: Always save to IndexedDB first, regardless of what happens next
            if (this.isEditing && this.editingExpenseId) {
                await this.updateExpenseInIndexedDB(expenseData);
                console.log('[ExpenseForm] ✅ Expense updated in IndexedDB:', expenseData.id);
            } else {
                await this.saveExpenseToIndexedDB(expenseData);
                console.log('[ExpenseForm] ✅ Expense saved to IndexedDB:', expenseData.id);
            }

            // If Lab expense, create or update lab tracker entry
            if (expenseType === 'Lab') {
                console.log('[ExpenseForm] 🧪 Lab expense detected, creating/updating lab tracker entry...');
                try {
                    const labData = this.prepareLabData(expenseData);
                    console.log('[ExpenseForm] Lab data prepared:', JSON.stringify(labData, null, 2));

                    if (this.isEditing && this.editingLabId) {
                        // Update existing lab entry
                        console.log('[ExpenseForm] Updating existing lab entry:', this.editingLabId);
                        await this.updateLabInIndexedDB(labData);
                        console.log('[ExpenseForm] ✅ Lab tracker entry updated:', labData.labId);
                    } else {
                        // Create new lab entry
                        await this.saveLabToIndexedDB(labData);
                        console.log('[ExpenseForm] ✅ Lab tracker entry created:', labData.labId);
                    }

                    // Refresh lab tracker in main UI if available
                    if (typeof window.reloadLabTracker === 'function') {
                        console.log('[ExpenseForm] Calling window.reloadLabTracker()...');
                        await window.reloadLabTracker();
                    } else {
                        console.warn('[ExpenseForm] window.reloadLabTracker not available');
                    }
                } catch (labError) {
                    console.error('[ExpenseForm] Failed to create lab entry:', labError);
                }
            }

            // Success! Add to global expenses array, re-render, and hide form
            if (typeof window.expenses !== 'undefined') {
                if (this.isEditing && this.editingExpenseId) {
                    // Update existing expense in array
                    const idx = window.expenses.findIndex(e => e.id === expenseData.id);
                    if (idx > -1) {
                        window.expenses[idx] = expenseData;
                    }
                } else {
                    // Add new expense to array
                    window.expenses.push(expenseData);
                }
                console.log('[ExpenseForm] Expenses array updated, total count:', window.expenses.length);
            }

            console.log('[ExpenseForm] ✅ Expense saved successfully!');

            // Re-render expenses table if function exists
            console.log('[ExpenseForm] renderExpenses available:', typeof window.renderExpenses === 'function');
            if (typeof window.renderExpenses === 'function') {
                try {
                    console.log('[ExpenseForm] Calling renderExpenses...');
                    window.renderExpenses();
                    console.log('[ExpenseForm] renderExpenses completed successfully');
                } catch (error) {
                    console.error('[ExpenseForm] Error calling renderExpenses:', error);
                }
            }
            if (typeof window.renderCategorySummary === 'function') {
                try {
                    console.log('[ExpenseForm] Calling renderCategorySummary...');
                    window.renderCategorySummary();
                    console.log('[ExpenseForm] renderCategorySummary completed successfully');
                } catch (error) {
                    console.error('[ExpenseForm] Error calling renderCategorySummary:', error);
                }
            }

            // Dispatch custom event
            try {
                window.dispatchEvent(new CustomEvent('expense-saved', {
                    detail: expenseData
                }));
                console.log('[ExpenseForm] expense-saved event dispatched');
            } catch (eventError) {
                console.warn('[ExpenseForm] Failed to dispatch event:', eventError);
            }

            // Show notification
            try {
                this.showNotification('Expense saved successfully! ✓', 'success');
                console.log('[ExpenseForm] Notification shown');
            } catch (notifError) {
                console.warn('[ExpenseForm] Failed to show notification:', notifError);
            }

            // Hide the form after a short delay to ensure notification is visible
            setTimeout(() => {
                try {
                    this.hide();
                    console.log('[ExpenseForm] Form hidden');
                } catch (hideError) {
                    console.error('[ExpenseForm] Failed to hide form:', hideError);
                }
            }, 500);
        } catch (error) {
            // Catch any unexpected errors
            console.error('[ExpenseForm] ❌ Unexpected error during save:', error);
            this.showNotification('❌ An unexpected error occurred. Please try again.', 'error');
        } finally {
            // Always reset submitting state and re-enable button
            this.isSubmitting = false;
            this.updateSubmitButtonState(false);
        }
    }

    /**
     * Prepare lab tracker data
     */
    prepareLabData(expenseData) {
        const dateTime = expenseData.dateTime || new Date().toISOString();
        const labName = document.getElementById('globalLabName')?.value || 'TWOK';
        
        // Use existing lab ID when editing, or generate new one in L0000001 format
        let labId;
        if (this.editingLabId) {
            labId = this.editingLabId;
        } else {
            // Generate sequential ID in L0000001 format
            const labRecords = window.labRecords || [];
            const maxId = labRecords.length > 0 ? labRecords.reduce((max, lab) => {
                const id = lab.labId || lab.id || '';
                const num = parseInt(id.replace('L', ''), 10);
                return num > max ? num : max;
            }, 0) : 0;
            labId = `L${String(maxId + 1).padStart(7, '0')}`;
        }

        return {
            id: labId, // Required for IndexedDB keyPath
            labId: labId,
            expenseId: expenseData.id || null, // Link to the expense that created this
            patientId: expenseData.patientId || '',
            patientName: expenseData.patientName || this.currentAppointment?.patient_name || this.currentAppointment?.patientName || '',
            doctorId: document.getElementById('globalExpenseDoctorIdHidden')?.value || '',
            doctorName: expenseData.doctor_name || this.currentAppointment?.doctor_name || this.currentAppointment?.doctorName || '',
            labName: labName, // Lab location name (e.g., "TWOK", "NN")
            testName: expenseData.itemName || expenseData.remark || 'Blood Test', // Test type (e.g., "Blood Test", "C&S Results")
            amount: expenseData.amount,
            status: 'Sent to Lab',
            dateTime: dateTime,
            pendingTests: null,
            timeline: {
                sentToLab: dateTime,
                partialResult: null,
                completeResult: null,
                informDoctor: null,
                informPatient: null,
                patientReceived: null
            },
            createdTime: expenseData.createdTime || new Date().toISOString()
        };
    }

    /**
     * Create lab tracker entry
     */
    async createLabTrackerEntry(expenseData) {
        const labData = this.prepareLabData(expenseData);

        // Save to IndexedDB
        await this.saveLabToIndexedDB(labData);

        console.log('[ExpenseForm] Lab tracker entry created:', labData);
    }

    /**
     * Save expense to IndexedDB
     */
    async saveExpenseToIndexedDB(data) {
        try {
            if (window.TWOKDB) {
                await window.TWOKDB.put(window.TWOKDB.STORES.EXPENSES, data);
                console.log('[ExpenseForm] Successfully saved to IndexedDB:', data.id);
            } else {
                // Fallback to direct IndexedDB
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open('TWOK_Clinic_DB', 1);

                    request.onsuccess = () => {
                        const db = request.result;
                        const transaction = db.transaction(['expenses'], 'readwrite');
                        const store = transaction.objectStore('expenses');
                        const putRequest = store.put(data);

                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(putRequest.error);
                    };

                    request.onerror = () => reject(request.error);
                });
            }
        } catch (error) {
            console.error('[ExpenseForm] Failed to save to IndexedDB:', error);
            throw error;
        }
    }

    /**
     * Update existing expense in IndexedDB
     */
    async updateExpenseInIndexedDB(data) {
        // For IndexedDB, put() handles both insert and update
        // Just use the same save method
        await this.saveExpenseToIndexedDB(data);
    }

    /**
     * Save lab tracker entry to IndexedDB
     */
    async saveLabToIndexedDB(data) {
        if (window.TWOKDB) {
            await window.TWOKDB.put(window.TWOKDB.STORES.LAB_TRACKER, data);
        } else {
            // Fallback to direct IndexedDB
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('TWOK_Clinic_DB', 1);

                request.onsuccess = () => {
                    const db = request.result;
                    const transaction = db.transaction(['lab_tracker'], 'readwrite');
                    const store = transaction.objectStore('lab_tracker');
                    const putRequest = store.put(data);

                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                };

                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * Update existing lab tracker entry in IndexedDB
     */
    async updateLabInIndexedDB(data) {
        // Update uses the same put() operation since IndexedDB keyPath matches
        await this.saveLabToIndexedDB(data);
    }

    /**
     * Show patient autocomplete dropdown for expense form
     */
    showExpensePatientAutocomplete(searchTerm) {
        const autocomplete = document.getElementById('globalExpensePatientAutocomplete');
        
        if (!searchTerm || searchTerm.length < 1) {
            autocomplete.classList.add('hidden');
            return;
        }

        // Get patients from global patients array
        const patientsList = window.patients || [];
        const term = searchTerm.toLowerCase();
        const matches = patientsList.filter(p => p.name.toLowerCase().includes(term)).slice(0, 10);

        if (matches.length === 0) {
            autocomplete.innerHTML = `
                <div class="autocomplete-item" style="opacity: 0.6; cursor: default;">
                    <div class="autocomplete-item-primary">No patient found</div>
                    <div class="autocomplete-item-secondary">Try a different search term</div>
                </div>
            `;
            autocomplete.classList.remove('hidden');
            return;
        }

        autocomplete.innerHTML = matches.map((p, idx) => `
            <div class="autocomplete-item" data-index="${idx}" data-id="${p.id}">
                <div class="autocomplete-item-primary">${this.escapeHtml(p.name)}</div>
                <div class="autocomplete-item-secondary">${this.escapeHtml(p.age || '-')} — ${this.escapeHtml(p.phone || '-')} — ${this.escapeHtml(p.address || '-')}</div>
            </div>
        `).join('');

        // Position autocomplete
        const input = document.getElementById('globalExpensePatientName');
        const rect = input.getBoundingClientRect();
        autocomplete.style.position = 'fixed';
        autocomplete.style.top = (rect.bottom + 4) + 'px';
        autocomplete.style.left = rect.left + 'px';
        autocomplete.style.width = rect.width + 'px';
        autocomplete.style.zIndex = '1500';
        autocomplete.classList.remove('hidden');

        // Add click handlers
        autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                if (id) {
                    this.selectExpensePatient(id);
                }
            });
        });
    }

    /**
     * Select a patient from autocomplete
     */
    selectExpensePatient(patientId) {
        const patientsList = window.patients || [];
        const patient = patientsList.find(p => p.id === patientId);
        if (!patient) return;

        document.getElementById('globalExpensePatientName').value = patient.name;
        document.getElementById('globalExpensePatientIdHidden').value = patient.id;
        document.getElementById('globalExpensePatientId').value = patient.id;
        document.getElementById('globalExpensePatientAutocomplete').classList.add('hidden');
    }

    /**
     * Show doctor autocomplete dropdown for expense form
     */
    showExpenseDoctorAutocomplete(searchTerm) {
        const autocomplete = document.getElementById('globalExpenseDoctorAutocomplete');
        
        if (!searchTerm || searchTerm.length < 1) {
            autocomplete.classList.add('hidden');
            return;
        }

        // Get doctors from global doctors array
        const doctorsList = window.doctors || [];
        const term = searchTerm.toLowerCase();
        const matches = doctorsList.filter(d => d.name.toLowerCase().includes(term)).slice(0, 10);

        if (matches.length === 0) {
            autocomplete.innerHTML = `
                <div class="autocomplete-item" style="opacity: 0.6; cursor: default;">
                    <div class="autocomplete-item-primary">No doctor found</div>
                    <div class="autocomplete-item-secondary">Try a different search term</div>
                </div>
            `;
            autocomplete.classList.remove('hidden');
            return;
        }

        autocomplete.innerHTML = matches.map((d, idx) => `
            <div class="autocomplete-item" data-index="${idx}" data-id="${d.id}">
                <div class="autocomplete-item-primary">${this.escapeHtml(d.name)}</div>
                <div class="autocomplete-item-secondary">${this.escapeHtml(d.speciality || '-')} — ${this.escapeHtml(d.hospital || '-')} — ${this.escapeHtml(d.phone || '-')}</div>
            </div>
        `).join('');

        // Position autocomplete
        const input = document.getElementById('globalExpenseDoctorName');
        const rect = input.getBoundingClientRect();
        autocomplete.style.position = 'fixed';
        autocomplete.style.top = (rect.bottom + 4) + 'px';
        autocomplete.style.left = rect.left + 'px';
        autocomplete.style.width = rect.width + 'px';
        autocomplete.style.zIndex = '1500';
        autocomplete.classList.remove('hidden');

        // Add click handlers
        autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                if (id) {
                    this.selectExpenseDoctor(id);
                }
            });
        });
    }

    /**
     * Select a doctor from autocomplete
     */
    selectExpenseDoctor(doctorId) {
        const doctorsList = window.doctors || [];
        const doctor = doctorsList.find(d => d.id === doctorId);
        if (!doctor) return;

        document.getElementById('globalExpenseDoctorName').value = doctor.name;
        document.getElementById('globalExpenseDoctorIdHidden').value = doctor.id;
        document.getElementById('globalExpenseDoctorAutocomplete').classList.add('hidden');
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Check if notification element already exists and remove it
        const existing = document.querySelector('.expense-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `expense-notification expense-notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#dc2626' : '#2c7be5'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            max-width: 400px;
            width: fit-content;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;

        document.body.appendChild(notification);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Export singleton instance
window.expenseForm = new ExpenseFormComponent();
