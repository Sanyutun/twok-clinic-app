/**
 * TODO View Module
 * Handles filtering and rendering of pending tasks for staff
 */

class TodoView {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        console.log('[TodoView] Initializing...');
        this.initialized = true;
    }

    /**
     * Main render function called when TODO section is shown
     */
    render() {
        console.log('[TodoView] Rendering TODO sections...');
        
        // Ensure data is available
        const appts = window.appointments || [];
        const insts = window.instructions || [];
        const labs = window.labRecords || [];
        const today = new Date().toISOString().split('T')[0];

        this.renderApptsNeedingInstructions(appts, insts);
        this.renderLabsPendingResults(labs);
        this.renderLabsToInform(labs);
        this.renderLabsPendingReceipt(labs);
        this.renderMissingLabTrackers(insts, labs);
    }

    /**
     * Category 1: Appointments Needing Instructions
     * Not cancelled, status is Done/Postpone, but no instruction record
     */
    renderApptsNeedingInstructions(appts, insts) {
        const tbody = document.getElementById('todoBodyAppts');
        const countBadge = document.getElementById('todoCountAppts');
        
        const filtered = appts.filter(a => {
            if (a.status === 'Cancelled') return false;
            
            // Exclude patients whose appointment doctor has needInstruction set to false
            const doctor = (window.doctors || []).find(d => d.id === a.doctorId);
            if (doctor && doctor.needInstruction === false) return false;
            
            // Check if ANY instruction exists for this appointment
            const hasInstruction = insts.some(i => i.appointmentId === a.id);
            return !hasInstruction;
        });

        countBadge.textContent = filtered.length;
        
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="todo-empty">All caught up!</td></tr>';
            return;
        }

        const sorted = [...filtered].sort((a, b) => {
            const aTime = a.appointmentTime ? new Date(a.appointmentTime).getTime() : 0;
            const bTime = b.appointmentTime ? new Date(b.appointmentTime).getTime() : 0;
            return bTime - aTime;
        });

        tbody.innerHTML = sorted.map(a => `
            <tr>
                <td><strong>${this.escapeHtml(a.patientName)}</strong></td>
                <td>${this.escapeHtml(a.doctorName)}</td>
                <td>${new Date(a.appointmentTime).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary btn-sm todo-action-btn" onclick="switchSection('instruction'); openInstructionForm('${a.id}')">
                        + Add Instruction
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Category 2: Pending Lab Records
     * Status is 'Sent to Lab'
     */
    renderLabsPendingResults(labs) {
        const tbody = document.getElementById('todoBodyLabsPending');
        const countBadge = document.getElementById('todoCountLabsPending');
        
        const filtered = labs.filter(l => l.status === 'Sent to Lab');
        countBadge.textContent = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="todo-empty">No pending results</td></tr>';
            return;
        }

        const sorted = [...filtered].sort((a, b) => {
            const aTime = a.dateTime ? new Date(a.dateTime).getTime() : 0;
            const bTime = b.dateTime ? new Date(b.dateTime).getTime() : 0;
            return bTime - aTime;
        });

        tbody.innerHTML = sorted.map(l => `
            <tr>
                <td><strong>${this.escapeHtml(l.patientName)}</strong></td>
                <td>${this.escapeHtml(l.labName)}</td>
                <td>${new Date(l.dateTime).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-secondary btn-sm todo-action-btn" onclick="switchSection('lab'); editLabRecord('${l.labId}')">
                        Update
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Category 3: Results to Inform
     * Results are out but not yet informed to doctor/patient
     */
    renderLabsToInform(labs) {
        const tbody = document.getElementById('todoBodyLabsToInform');
        const countBadge = document.getElementById('todoCountLabsToInform');
        
        const filtered = labs.filter(l => l.status === 'Partial Result Out' || l.status === 'Complete Result Out');
        countBadge.textContent = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="todo-empty">No results to inform</td></tr>';
            return;
        }

        const sorted = [...filtered].sort((a, b) => {
            const aTime = a.dateTime ? new Date(a.dateTime).getTime() : 0;
            const bTime = b.dateTime ? new Date(b.dateTime).getTime() : 0;
            return bTime - aTime;
        });

        tbody.innerHTML = sorted.map(l => `
            <tr>
                <td><strong>${this.escapeHtml(l.patientName)}</strong></td>
                <td><span class="todo-status-tag urgent">${l.status}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm todo-action-btn" onclick="switchSection('lab'); editLabRecord('${l.labId}')">
                        Inform
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Category 4: Results Informed (Pending Receipt)
     * Informed but patient hasn't received
     */
    renderLabsPendingReceipt(labs) {
        const tbody = document.getElementById('todoBodyLabsPendingReceipt');
        const countBadge = document.getElementById('todoCountLabsPendingReceipt');
        
        const filtered = labs.filter(l => l.status === 'Inform to Doctor' || l.status === 'Inform to Patient');
        countBadge.textContent = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="todo-empty">No pending receipts</td></tr>';
            return;
        }

        const sorted = [...filtered].sort((a, b) => {
            const aTime = a.dateTime ? new Date(a.dateTime).getTime() : 0;
            const bTime = b.dateTime ? new Date(b.dateTime).getTime() : 0;
            return bTime - aTime;
        });

        tbody.innerHTML = sorted.map(l => `
            <tr>
                <td><strong>${this.escapeHtml(l.patientName)}</strong></td>
                <td><span class="todo-status-tag inform">${l.status}</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm todo-action-btn" onclick="switchSection('lab'); editLabRecord('${l.labId}')">
                        Mark Received
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Category 5: Missing Lab Trackers
     * "After Results" instructions with no corresponding lab record
     */
    renderMissingLabTrackers(insts, labs) {
        const tbody = document.getElementById('todoBodyMissingLabs');
        const countBadge = document.getElementById('todoCountMissingLabs');
        
        // Find instructions with "After Results"
        const afterResultsInsts = insts.filter(i => i.otherInstruction === 'After Results');
        
        // Filter for those missing lab records
        const missing = afterResultsInsts.filter(inst => {
            // If it already has linked lab IDs, it's not missing a tracker
            if (inst.linkedLabIds && inst.linkedLabIds.length > 0) return false;

            // Check if ANY lab record exists for this patient that was created 
            // after the instruction's appointment date
            const apptDate = inst.appointmentDate ? new Date(inst.appointmentDate) : new Date(0);
            
            const hasLab = labs.some(l => {
                const isSamePatient = l.patientId === inst.patientId || 
                                     (l.patientName && l.patientName.toLowerCase() === (inst.patientName || '').toLowerCase());
                const isAfterAppt = !l.dateTime || new Date(l.dateTime) >= apptDate;
                return isSamePatient && isAfterAppt;
            });
            
            return !hasLab;
        });

        countBadge.textContent = missing.length;

        if (missing.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="todo-empty">No missing trackers</td></tr>';
            return;
        }

        const sorted = [...missing].sort((a, b) => {
            const aTime = a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0;
            const bTime = b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0;
            return bTime - aTime;
        });

        tbody.innerHTML = sorted.map(i => `
            <tr>
                <td><strong>${this.escapeHtml(i.patientName)}</strong></td>
                <td>${this.escapeHtml(i.followUpDoctor || i.doctorName)}</td>
                <td>${i.appointmentDate ? new Date(i.appointmentDate).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn btn-warning btn-sm todo-action-btn" onclick="todoView.openLabTrackerFromTodo('${i.appointmentId}', '${i.patientId}', '${i.patientName.replace(/'/g, "\\'")}', '${(i.followUpDoctor || i.doctorName).replace(/'/g, "\\'")}')">
                        + Lab Tracker
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Helper to open calendar and show event from TODO
     */
    openLabTrackerFromTodo(appointmentId, patientId, patientName, doctorName) {
        // "After Results" (Missing Lab Tracker) events are always placed on today's date
        const dateString = new Date().toISOString().split('T')[0];
        const finalDoctorName = doctorName;

        if (typeof window.jumpToCalendarDate === 'function') {
            window.jumpToCalendarDate(dateString, finalDoctorName, patientId);
        } else {
            console.error('[TodoView] jumpToCalendarDate not found');
            // Fallback for safety
            if (typeof switchSection === 'function') switchSection('calendar');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create singleton instance
window.todoView = new TodoView();

// Expose prefill helper globally
window.todoView.openLabTrackerFromTodo = window.todoView.openLabTrackerFromTodo.bind(window.todoView);
