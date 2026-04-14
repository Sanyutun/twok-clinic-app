/**
 * Global Instruction Form Component
 * Reusable form for recording doctor instructions
 */

class InstructionFormComponent {
    constructor() {
        this.currentAppointment = null;
        this.isVisible = false;
        this.init();
    }

    /**
     * Initialize component
     */
    init() {
        this.createModal();
        this.attachEventListeners();
    }

    /**
     * Create modal HTML
     */
    createModal() {
        const modalHTML = `
            <div id="instructionFormModal" class="global-form-modal hidden">
                <div class="global-form-modal-backdrop"></div>
                <div class="global-form-modal-content">
                    <div class="global-form-modal-header">
                        <h3>📝 Doctor Instruction</h3>
                        <button type="button" class="global-form-modal-close">&times;</button>
                    </div>
                    <div class="global-form-modal-body">
                        <form id="globalInstructionForm">
                            <input type="hidden" id="globalInstructAppointmentId">
                            <input type="hidden" id="globalInstructPatientId">

                            <div class="form-group">
                                <label>Patient Name</label>
                                <input type="text" id="globalInstructPatientName" class="form-control" readonly tabindex="-1">
                            </div>

                            <div class="form-group">
                                <label>Doctor Name</label>
                                <input type="text" id="globalInstructDoctorName" class="form-control" readonly tabindex="-1">
                            </div>

                            <div class="form-group">
                                <label>Booking Number</label>
                                <input type="text" id="globalInstructBookingNumber" class="form-control" readonly tabindex="-1">
                            </div>
                            
                            <div class="form-group">
                                <label for="instructionType">Instruction Type <span class="required">*</span></label>
                                <select id="instructionType" class="form-control" required>
                                    <option value="">Select Type</option>
                                    <option value="Medication">💊 Medication</option>
                                    <option value="After Results">📋 After Results</option>
                                    <option value="Follow Up">📅 Follow Up</option>
                                    <option value="Other">📝 Other</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="instructionNote">Instruction Note</label>
                                <textarea id="instructionNote" class="form-control" rows="4" placeholder="Enter instruction details..."></textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="nextVisitDate">Next Visit Date (optional)</label>
                                <input type="date" id="nextVisitDate" class="form-control">
                            </div>
                            
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary btn-block">💾 Save Instruction</button>
                                <button type="button" class="btn btn-secondary btn-block close-form">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add styles if not already present
        if (!document.getElementById('global-form-styles')) {
            this.addStyles();
        }
    }

    /**
     * Add modal styles
     */
    addStyles() {
        const styles = document.createElement('style');
        styles.id = 'global-form-styles';
        styles.textContent = `
            .global-form-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
            }
            
            .global-form-modal.hidden {
                display: none;
            }
            
            .global-form-modal-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
            }
            
            .global-form-modal-content {
                position: relative;
                background-color: var(--background-color);
                border-radius: var(--radius-lg);
                width: 90%;
                max-width: 500px;
                box-shadow: var(--shadow-lg);
                animation: modalSlideIn 0.3s ease-out;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            @keyframes modalSlideIn {
                from {
                    transform: translateY(-20px);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            
            .global-form-modal-header {
                padding: 20px;
                border-bottom: 1px solid var(--border-color);
                background-color: #f9fafb;
                border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .global-form-modal-header h3 {
                margin: 0;
                font-size: 1.2rem;
                color: var(--text-primary);
            }
            
            .global-form-modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: var(--text-secondary);
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .global-form-modal-close:hover {
                color: var(--text-primary);
            }
            
            .global-form-modal-body {
                padding: 25px;
            }
            
            .global-form-modal .form-group {
                margin-bottom: 20px;
            }
            
            .global-form-modal .form-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                color: var(--text-primary);
            }
            
            .global-form-modal .form-control {
                width: 100%;
                padding: 10px 15px;
                border: 1px solid var(--border-color);
                border-radius: var(--radius);
                font-size: 1rem;
                transition: border-color 0.2s;
            }
            
            .global-form-modal .form-control:focus {
                outline: none;
                border-color: var(--primary-color);
            }
            
            .global-form-modal .form-control[readonly] {
                background-color: #f9fafb;
                color: var(--text-secondary);
            }
            
            .global-form-modal .required {
                color: #dc2626;
            }
            
            .global-form-modal .form-actions {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-top: 25px;
            }
            
            .global-form-modal .btn-block {
                width: 100%;
                padding: 12px 20px;
                font-size: 1rem;
                font-weight: 600;
                border: none;
                border-radius: var(--radius);
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .global-form-modal .btn-primary {
                background-color: #2c7be5;
                color: white;
            }
            
            .global-form-modal .btn-primary:hover {
                background-color: #1a68d1;
            }
            
            .global-form-modal .btn-secondary {
                background-color: #6b7280;
                color: white;
            }
            
            .global-form-modal .btn-secondary:hover {
                background-color: #4b5563;
            }
        `;
        document.head.appendChild(styles);
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close button
        document.querySelector('.global-form-modal-close').addEventListener('click', () => {
            this.hide();
        });

        // Backdrop click
        document.querySelector('.global-form-modal-backdrop').addEventListener('click', () => {
            this.hide();
        });

        // Close button in form actions
        document.querySelectorAll('.close-form').forEach(btn => {
            btn.addEventListener('click', () => {
                this.hide();
            });
        });

        // Form submit
        document.getElementById('globalInstructionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    /**
     * Show form with appointment data
     */
    show(appointment) {
        this.currentAppointment = appointment;
        
        // Populate form fields
        document.getElementById('globalInstructAppointmentId').value = appointment.id || appointment.appointment_id || '';
        document.getElementById('globalInstructPatientId').value = appointment.patient_id || '';
        document.getElementById('globalInstructPatientName').value = appointment.patient_name || appointment.patientName || '';
        document.getElementById('globalInstructDoctorName').value = appointment.doctor_name || appointment.doctorName || '';
        document.getElementById('globalInstructBookingNumber').value = appointment.booking_number || appointment.bookingNumber || '-';
        
        // Reset form
        document.getElementById('instructionType').value = '';
        document.getElementById('instructionNote').value = '';
        document.getElementById('nextVisitDate').value = '';
        
        // Show modal
        document.getElementById('instructionFormModal').classList.remove('hidden');
        this.isVisible = true;
    }

    /**
     * Hide form
     */
    hide() {
        document.getElementById('instructionFormModal').classList.add('hidden');
        this.isVisible = false;
        this.currentAppointment = null;
    }

    /**
     * Handle form submission
     */
    async handleSubmit() {
        const instructionData = {
            instruction_id: 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            appointment_id: document.getElementById('globalInstructAppointmentId').value,
            patient_id: document.getElementById('globalInstructPatientId').value,
            doctor_name: document.getElementById('globalInstructDoctorName').value,
            instruction_type: document.getElementById('instructionType').value,
            instruction_note: document.getElementById('instructionNote').value,
            next_visit_date: document.getElementById('nextVisitDate').value,
            timestamp: new Date().toISOString()
        };

        try {
            // Save to IndexedDB (primary storage)
            await this.saveToIndexedDB(instructionData);

            // Show success notification
            this.showNotification('Instruction saved successfully', 'success');
            
            // Hide form
            this.hide();
            
            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('instruction-saved', {
                detail: instructionData
            }));
            
        } catch (error) {
            console.error('[InstructionForm] Failed to save instruction:', error);
            this.showNotification('Failed to save instruction', 'error');
        }
    }

    /**
     * Save to IndexedDB
     */
    async saveToIndexedDB(data) {
        if (window.TWOKDB) {
            await window.TWOKDB.put(window.TWOKDB.STORES.INSTRUCTIONS, data);
        } else {
            // Fallback to direct IndexedDB
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('TWOK_Clinic_DB', 1);

                request.onsuccess = () => {
                    const db = request.result;
                    const transaction = db.transaction(['instructions'], 'readwrite');
                    const store = transaction.objectStore('instructions');
                    const putRequest = store.put(data);

                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                };

                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#dc2626' : '#2c7be5'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 3000;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Export singleton instance
window.instructionForm = new InstructionFormComponent();
