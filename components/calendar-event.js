/**
 * Calendar Event Component
 * Handles rendering and interaction of calendar events
 */

class CalendarEventComponent {
    constructor() {
        this.dialog = null;
        this.dialogContent = null;
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
     * Show event detail dialog
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
                <div class="event-detail-value doctor">${this.escapeHtml(doctorEvent.doctor)}</div>
            </div>
        `;
        
        if (doctorEvent.patients && doctorEvent.patients.length > 0) {
            html += `
                <div class="event-detail-section">
                    <div class="event-detail-label">Patients (${doctorEvent.patients.length})</div>
                    <div class="event-detail-value patient-list">
            `;
            
            doctorEvent.patients.forEach(patient => {
                const instruction = patient.instruction;
                const typeClass = patient.type;
                
                html += `
                    <div class="event-patient-item ${typeClass}">
                        <div class="event-patient-name">${this.escapeHtml(patient.displayText)}</div>
                `;

                // Add "Create Appointment" button
                const patientId = instruction?.patientId || '';
                const doctorName = this.currentDoctor || '';
                const calendarDate = this.currentDate || '';
                html += `<button onclick="window.createAppointmentFromCalendar('${this.escapeHtml(patient.displayText)}', '${patientId}', '${this.escapeHtml(doctorName)}', '${calendarDate}')" 
                    style="margin-top: 6px; padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                    📅 Create Appointment
                </button>`;

                // Show tests if present
                if (patient.tests && patient.tests.length > 0) {
                    html += `
                        <div class="event-patient-tests">
                            <strong>→ Tests before visit:</strong> ${patient.tests.map(t => this.escapeHtml(t)).join(', ')}
                        </div>
                    `;
                }

                // Show combined pending tests (both blood and imaging)
                if (patient.type === 'pending' && patient.pendingTests) {
                    html += `<div class="event-patient-tests">`;
                    html += `<strong style="color: #f59e0b;">⏳ Pending Tests:</strong>`;

                    // Blood tests with status
                    if (patient.pendingTests.blood && patient.pendingTests.blood.length > 0) {
                        patient.pendingTests.blood.forEach(test => {
                            const status = patient.bloodTestStatus?.[test] || 'Not Started';
                            html += `<div style="margin-top: 3px; color: #f97316;">• ${this.escapeHtml(test)} <span style="color: #6b7280; font-size: 0.75rem;">(${this.escapeHtml(status)})</span></div>`;
                        });
                    }

                    // Imaging tests
                    if (patient.pendingTests.imaging && patient.pendingTests.imaging.length > 0) {
                        patient.pendingTests.imaging.forEach(test => {
                            html += `<div style="margin-top: 3px; color: #8b5cf6;">• ${this.escapeHtml(test)}</div>`;
                        });
                    }

                    html += `</div>`;
                }

                // Show instruction note if present
                if (instruction.generalInstruction) {
                    html += `
                        <div class="event-patient-tests" style="margin-top: 6px; font-style: italic; color: #6b7280;">
                            "${this.escapeHtml(instruction.generalInstruction)}"
                        </div>
                    `;
                }
                
                // Show next appointment date
                if (instruction.nextAppointmentDate) {
                    html += `
                        <div class="event-patient-tests">
                            <strong>Next Visit:</strong> ${this.formatDate(instruction.nextAppointmentDate)}
                        </div>
                    `;
                }
                
                // Show return duration
                if (instruction.returnDuration) {
                    const unit = instruction.returnUnit || 'Days';
                    html += `
                        <div class="event-patient-tests">
                            <strong>Return after:</strong> ${instruction.returnDuration} ${unit.toLowerCase()}
                        </div>
                    `;
                }
                
                html += `</div>`;
            });
            
            html += `</div></div>`;
        }
        
        this.dialogContent.innerHTML = html;
        this.dialog.classList.remove('hidden');
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

// Export singleton instance
window.calendarEvent = new CalendarEventComponent();
