/**
 * Calendar Event Component
 * Handles rendering and interaction of calendar events
 */

class CalendarEventComponent {
    constructor() {
        this.dialog = null;
        this.dialogContent = null;
        this.currentDoctor = null;
        this.currentDate = null;
        this.init();
    }

    /**
     * Initialize event dialog
     */
    init() {
        this.dialog = document.getElementById('eventDetailDialog');
        this.dialogContent = document.getElementById('eventDialogContent');
        
        if (!this.dialog || !this.dialogContent) {
            console.error('[CalendarEvent] Dialog elements not found');
            return;
        }
        
        this.attachEventListeners();
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close button
        const closeBtn = document.getElementById('closeEventDialog');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDialog());
        }
        
        const closeFooterBtn = document.getElementById('eventDialogCloseBtn');
        if (closeFooterBtn) {
            closeFooterBtn.addEventListener('click', () => this.closeDialog());
        }
        
        // Backdrop click
        const backdrop = this.dialog.querySelector('.event-dialog-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => this.closeDialog());
        }
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.dialog.classList.contains('hidden')) {
                this.closeDialog();
            }
        });
    }

    /**
     * Show all events for a specific date
     * @param {string} date - Date string YYYY-MM-DD
     */
    showDayDetail(date) {
        if (!this.dialog || !this.dialogContent) {
            console.error('[CalendarEvent] Dialog not initialized');
            return;
        }

        const events = window.calendarService.getEventsForDate(date);
        if (!events || events.length === 0) return;

        // Store date for use in appointment buttons
        this.currentDate = date;

        const formattedDate = this.formatDate(date);
        document.getElementById('eventDialogTitle').textContent = `All Events for ${formattedDate}`;

        let html = '<div class="day-detail-container">';
        
        // Sort events by doctor name
        const sortedEvents = [...events].sort((a, b) => a.doctor.localeCompare(b.doctor));
        
        sortedEvents.forEach(doctorEvent => {
            html += `
                <div class="doctor-events-group" style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <div class="doctor-header" style="display: flex; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
                        <span style="font-size: 1.1rem; font-weight: bold; color: #1e40af;">${this.escapeHtml(doctorEvent.doctor)}</span>
                        <span style="margin-left: auto; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                            ${doctorEvent.patients.length} Patient${doctorEvent.patients.length > 1 ? 's' : ''}
                        </span>
                    </div>
                    ${this.renderPatientList(doctorEvent.patients, doctorEvent.doctor, date)}
                </div>
            `;
        });
        
        html += '</div>';
        
        this.dialogContent.innerHTML = html;
        this.dialog.classList.remove('hidden');
    }

    /**
     * Show event detail dialog for a specific doctor
     * @param {Object} doctorEvent - Doctor event data
     * @param {string} date - Date string
     */
    showEventDetail(doctorEvent, date) {
        if (!this.dialog || !this.dialogContent) {
            console.error('[CalendarEvent] Dialog not initialized');
            return;
        }

        // Store doctor and date for use in appointment button
        this.currentDoctor = doctorEvent.doctor;
        this.currentDate = date;

        const formattedDate = this.formatDate(date);
        document.getElementById('eventDialogTitle').textContent = `Events for ${formattedDate}`;
        
        let html = `
            <div class="event-detail-section">
                <div class="event-detail-label">Doctor</div>
                <div class="event-detail-value doctor" style="font-size: 1.1rem; font-weight: bold; color: #1e40af; margin-bottom: 12px;">
                    ${this.escapeHtml(doctorEvent.doctor)}
                </div>
            </div>
            <div class="event-detail-section">
                <div class="event-detail-label">Patients (${doctorEvent.patients.length})</div>
                ${this.renderPatientList(doctorEvent.patients, doctorEvent.doctor, date)}
            </div>
        `;
        
        this.dialogContent.innerHTML = html;
        this.dialog.classList.remove('hidden');
    }

    /**
     * Render patient list HTML
     * @param {Array} patients 
     * @param {string} doctorName 
     * @param {string} date 
     * @returns {string}
     */
    renderPatientList(patients, doctorName, date) {
        let html = '<div class="patient-list">';
        
        patients.forEach(patient => {
            const instruction = patient.instruction || {};
            const typeClass = patient.type || 'follow-up';
            const patientId = instruction.patientId || patient.patientId || '';
            
            html += `
                <div class="event-patient-item ${typeClass}" style="margin-bottom: 12px; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; background: white;">
                    <div class="event-patient-name" style="font-weight: 600; color: #111827;">${this.escapeHtml(patient.displayText)}</div>
            `;

            // Add "Create Appointment" button
            html += `
                <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                    <button onclick="window.createAppointmentFromCalendar('${this.escapeHtml(patient.displayText).replace(/'/g, "\\'")}', '${patientId}', '${this.escapeHtml(doctorName).replace(/'/g, "\\'")}', '${date}')" 
                        style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                        📅 Appointment
                    </button>
                </div>
            `;

            // Show tests if present
            if (patient.tests && patient.tests.length > 0) {
                html += `
                    <div class="event-patient-tests" style="margin-top: 8px; font-size: 0.85rem; color: #4b5563;">
                        <strong>→ Tests:</strong> ${patient.tests.map(t => this.escapeHtml(t)).join(', ')}
                    </div>
                `;
            }

            // Show combined pending tests (both blood and imaging) or After Results status
            if (patient.type === 'pending') {
                html += `<div class="event-patient-tests" style="margin-top: 8px; font-size: 0.85rem; color: #4b5563;">`;
                
                if (patient.pendingTests && patient.pendingTests.all && patient.pendingTests.all.length > 0) {
                    html += `<strong style="color: #f59e0b;">⏳ Pending Tests:</strong>`;

                    // Blood tests with status
                    if (patient.pendingTests.blood && patient.pendingTests.blood.length > 0) {
                        patient.pendingTests.blood.forEach(test => {
                            const status = patient.bloodTestStatus?.[test] || 'Not Started';
                            html += `<div style="margin-top: 3px; color: #f97316; padding-left: 8px;">• ${this.escapeHtml(test)} <span style="color: #6b7280; font-size: 0.75rem;">(${this.escapeHtml(status)})</span></div>`;
                        });
                    }

                    // Imaging tests
                    if (patient.pendingTests.imaging && patient.pendingTests.imaging.length > 0) {
                        patient.pendingTests.imaging.forEach(test => {
                            html += `<div style="margin-top: 3px; color: #8b5cf6; padding-left: 8px;">• ${this.escapeHtml(test)}</div>`;
                        });
                    }
                } else {
                    html += `<strong style="color: #10b981;">📋 After Results Consultation</strong>`;
                    html += `<div style="margin-top: 3px; color: #6b7280; font-size: 0.85rem;">Waiting for patient to return with results.</div>`;
                }

                // Show Lab IDs if present
                if (patient.labRecords && patient.labRecords.length > 0) {
                    const labIds = [...new Set(patient.labRecords.map(lab => lab.id || lab.labId))].filter(Boolean);
                    if (labIds.length > 0) {
                        html += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb;">
                            <strong style="color: #3b82f6;">🔬 Lab Tracker ID:</strong> 
                            <span style="background: #eff6ff; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: bold;">${labIds.join(', ')}</span>
                        </div>`;
                    }
                }

                html += `</div>`;
            }

            // Show instruction note if present
            if (instruction.generalInstruction) {
                html += `
                    <div class="event-patient-tests" style="margin-top: 8px; font-style: italic; color: #6b7280; font-size: 0.85rem;">
                        "${this.escapeHtml(instruction.generalInstruction)}"
                    </div>
                `;
            }
            
            // Show next appointment date
            if (instruction.nextAppointmentDate) {
                html += `
                    <div class="event-patient-tests" style="margin-top: 4px; font-size: 0.85rem;">
                        <strong>Next Visit:</strong> ${this.formatDate(instruction.nextAppointmentDate)}
                    </div>
                `;
            }
            
            // Show return duration
            if (instruction.returnDuration) {
                const unit = instruction.returnUnit || 'Days';
                html += `
                    <div class="event-patient-tests" style="margin-top: 4px; font-size: 0.85rem;">
                        <strong>Return after:</strong> ${instruction.returnDuration} ${unit.toLowerCase()}
                    </div>
                `;
            }
            
            html += `</div>`;
        });
        
        html += '</div>';
        return html;
    }

    /**
     * Close dialog
     */
    closeDialog() {
        if (this.dialog) {
            this.dialog.classList.add('hidden');
        }
    }

    /**
     * Format date for display
     * @param {string} dateStr - YYYY-MM-DD
     * @returns {string}
     */
    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for button clicks
window.recordInstructionFromCalendar = function(patientDataJson) {
    try {
        const patientData = JSON.parse(patientDataJson);
        TWOK_LOGGER.debug('[Calendar] Recording instruction for:', patientData.displayText);
        
        // Close the detail dialog
        if (window.calendarEvent) {
            window.calendarEvent.closeDialog();
        }
        
        // Prepare appointment-like object for the form
        const appointment = {
            id: patientData.instruction?.appointmentId || '',
            appointment_id: patientData.instruction?.appointmentId || '',
            patient_id: patientData.instruction?.patientId || patientData.patientId || '',
            patientId: patientData.instruction?.patientId || patientData.patientId || '',
            patient_name: patientData.instruction?.patientName || patientData.patientName || '',
            patientName: patientData.instruction?.patientName || patientData.patientName || '',
            doctor_name: patientData.instruction?.doctorName || patientData.doctorName || '',
            doctorName: patientData.instruction?.doctorName || patientData.doctorName || '',
            booking_number: patientData.instruction?.bookingNumber || '',
            bookingNumber: patientData.instruction?.bookingNumber || '',
            age: patientData.instruction?.age || '',
            phone: patientData.instruction?.phone || ''
        };
        
        // Extract lab IDs
        let labIds = [];
        if (patientData.labRecords && patientData.labRecords.length > 0) {
            labIds = [...new Set(patientData.labRecords.map(lab => lab.id || lab.labId))].filter(Boolean);
        }
        
        // Show instruction form
        if (window.instructionForm) {
            window.instructionForm.show(appointment, labIds);
        } else {
            console.error('[Calendar] Instruction form not found');
            alert('Instruction form component is not loaded.');
        }
        
    } catch (error) {
        console.error('[Calendar] Failed to record instruction:', error);
    }
};

// Export singleton instance
window.calendarEvent = new CalendarEventComponent();
