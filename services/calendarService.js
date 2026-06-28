/**
 * Calendar Service
 * Processes instructions and lab data to generate calendar events
 */

class CalendarService {
    constructor() {
        this.calendarEvents = {};
        this.instructions = [];
        this.labRecords = [];
    }

    /**
     * Initialize and load data
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Load instructions
            await window.instructionService.loadInstructions();
            this.instructions = window.instructionService.getValidInstructions();
            
            // Load lab records
            await window.labService.loadLabRecords();
            this.labRecords = window.labService.labRecords;
            
            console.log(`[CalendarService] Initialized with ${this.instructions.length} instructions and ${this.labRecords.length} lab records`);
        } catch (error) {
            console.error('[CalendarService] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Generate calendar events from instructions and lab data
     * @param {Object} filters - Optional filters
     * @returns {Object} Calendar events grouped by date
     */
    generateCalendarEvents(filters = {}) {
        this.calendarEvents = {};

        // Define test type categories
        const bloodTests = ['Blood Test', 'C&S Results'];
        const imagingTests = ['USG', 'Echo', 'ECG', 'Xray', 'CT', 'MRI', 'Other'];

        // Robust exclusion check
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
                   /\bprn\b/.test(s);
        };

        let filteredInstructions = this.instructions.filter(inst => {
            const other = (inst.otherInstruction || '').trim();
            const general = (inst.generalInstruction || '').trim();
            return !isExcluded(other) && !isExcluded(general);
        });

        // Apply filters
        if (filters.doctor) {
            filteredInstructions = filteredInstructions.filter(inst => {
                const doctor = inst.followUpDoctor || inst.doctorName;
                return doctor === filters.doctor;
            });
        }

        if (filters.type) {
            if (filters.type === 'follow-up') {
                filteredInstructions = filteredInstructions.filter(inst =>
                    inst.otherInstruction !== 'After Results' && inst.nextAppointmentDate
                );
            } else if (filters.type === 'tests-before') {
                filteredInstructions = filteredInstructions.filter(inst =>
                    inst.selectedTests && inst.selectedTests.length > 0
                );
            } else if (filters.type === 'pending') {
                // Pending events are generated dynamically, filter will be applied after generation
                // No need to filter instructions here
            } else if (filters.type === 'todo') {
                // TODO events are generated dynamically, filter will be applied after generation
                // No need to filter instructions here
            }

            if (filters.doctor) {
                filteredInstructions = filteredInstructions.filter(inst => {
                    const doctor = inst.followUpDoctor || inst.doctorName;
                    return doctor === filters.doctor;
                });
            }
        }

        // Generate follow-up events (exclude After Results)
        this.generateFollowUpEvents(filteredInstructions, bloodTests);

        // Generate combined pending events for After Results
        this.generatePendingTestEvents(filteredInstructions, bloodTests, imagingTests);

        // Generate TODO events for items without specific dates (appear on today's date)
        this.generateTODOEvents(filteredInstructions, bloodTests, imagingTests);

        console.log(`[CalendarService] Generated events for ${Object.keys(this.calendarEvents).length} dates`);
        return this.calendarEvents;
    }

    /**
     * Parse date string safely (handles YYYY-MM-DD and YYYY-MM-DD HH:MM formats)
     * @param {string} dateStr 
     * @returns {Date|null}
     */
    parseDateSafely(dateStr) {
        if (!dateStr) return null;
        
        // Remove time if present (e.g., "2024-05-09 10:30 AM" -> "2024-05-09" OR "2024-05-09T08:00:00" -> "2024-05-09")
        let onlyDate = dateStr;
        if (dateStr.includes(' ')) {
            onlyDate = dateStr.split(' ')[0];
        } else if (dateStr.includes('T')) {
            onlyDate = dateStr.split('T')[0];
        }
        
        const parts = onlyDate.split('-');
        if (parts.length === 3) {
            // Create date using year, month (0-indexed), and day
            // This avoids timezone shifting that happens with new Date(string)
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const day = parseInt(parts[2]);
            return new Date(year, month, day);
        }
        
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    }

    /**
     * Generate follow-up visit events
     * @param {Array} instructions
     * @param {Array} bloodTests
     */
    generateFollowUpEvents(instructions, bloodTests) {
        const followUpInstructions = instructions.filter(inst => inst.otherInstruction !== 'After Results');

        followUpInstructions.forEach(inst => {
            // Calculate follow-up date using priority
            let date = null;
            if (inst.nextAppointmentDate && inst.nextAppointmentDate.trim() !== '') {
                date = inst.nextAppointmentDate;
            } else if (inst.returnDuration && inst.returnUnit && (inst.appointmentDate || inst.createdTime)) {
                const apptDate = this.parseDateSafely(inst.appointmentDate || inst.createdTime);
                if (apptDate) {
                    switch (inst.returnUnit) {
                        case 'Days': apptDate.setDate(apptDate.getDate() + inst.returnDuration); break;
                        case 'Weeks': apptDate.setDate(apptDate.getDate() + (inst.returnDuration * 7)); break;
                        case 'Months': apptDate.setMonth(apptDate.getMonth() + inst.returnDuration); break;
                        default: apptDate.setDate(apptDate.getDate() + inst.returnDuration);
                    }
                    date = `${apptDate.getFullYear()}-${String(apptDate.getMonth() + 1).padStart(2, '0')}-${String(apptDate.getDate()).padStart(2, '0')}`;
                }
            }

            // Skip if no explicit date/duration - TODO events will handle this
            if (!date) return;

            const doctorName = window.instructionService.getDoctorName(inst);

            if (!this.calendarEvents[date]) {
                this.calendarEvents[date] = {};
            }

            if (!this.calendarEvents[date][doctorName]) {
                this.calendarEvents[date][doctorName] = {
                    doctor: doctorName,
                    patients: [],
                    types: new Set()
                };
            }

            this.calendarEvents[date][doctorName].patients.push({
                type: 'follow-up',
                instruction: inst,
                displayText: window.instructionService.getPatientDisplayString(inst)
            });

            this.calendarEvents[date][doctorName].types.add('follow-up');

            // Add tests before visit annotation (only blood tests) - Unless it's "Do Tests Before"
            if (inst.selectedTests && inst.selectedTests.length > 0) {
                const isDoTestsBefore = (inst.otherInstruction || '').trim().toLowerCase() === 'do tests before';
                const hasBloodTests = inst.selectedTests.some(t => bloodTests.includes(t));
                
                if (isDoTestsBefore || hasBloodTests) {
                    this.calendarEvents[date][doctorName].types.add('tests-before');
                    const lastPatient = this.calendarEvents[date][doctorName].patients[this.calendarEvents[date][doctorName].patients.length - 1];
                    
                    if (isDoTestsBefore) {
                        // For "Do Tests Before", show all selected tests
                        lastPatient.tests = inst.selectedTests;
                    } else {
                        // For other types, still only show blood tests as follow-up annotations
                        lastPatient.tests = inst.selectedTests.filter(t => bloodTests.includes(t));
                    }
                }
            }
        });
    }

    /**
     * Generate test-before-visit events
     * @param {Array} instructions
     */
    generateTestBeforeVisitEvents(instructions) {
        // These are already included in follow-up events with tests annotation
        // No separate event generation needed
    }

    /**
     * Generate combined PENDING events for After Results (both blood and imaging tests pending)
     * @param {Array} instructions
     * @param {Array} bloodTests
     * @param {Array} imagingTests
     */
    generatePendingTestEvents(instructions, bloodTests, imagingTests) {
        const today = new Date().toISOString().split('T')[0];
        const afterResultsInstructions = instructions.filter(inst => inst.otherInstruction === 'After Results');

        afterResultsInstructions.forEach(inst => {
            const requiredTests = inst.selectedTests || [];

            // Match lab records
            let patientLabs = [];
            
            // 1. Try to match by specific linkedLabIds if stored in instruction
            if (inst.linkedLabIds && inst.linkedLabIds.length > 0) {
                patientLabs = window.labService.labRecords.filter(lab => 
                    inst.linkedLabIds.includes(lab.labId) || inst.linkedLabIds.includes(lab.id)
                );
            }
            
            // 2. Fallback: match by patientId only if no specific lab linked
            if (patientLabs.length === 0) {
                patientLabs = window.labService.getLabsByPatientId(inst.patientId);
            }

            const completedLabs = patientLabs.filter(lab =>
                lab.status === 'Partial Result Out' || lab.status === 'Complete Result Out'
            );
            const completedTestNames = completedLabs.map(lab => lab.labName);

            // Get pending tests (both blood and imaging)
            const pendingBlood = requiredTests.filter(t => bloodTests.includes(t) && !completedTestNames.includes(t));
            const pendingImaging = requiredTests.filter(t => imagingTests.includes(t) && !completedTestNames.includes(t));

            // Get lab status from the patient's lab tracker entries
            let patientLabStatus = 'Not Started';
            if (patientLabs.length > 0) {
                // Get the most recent lab record status
                const sortedLabs = [...patientLabs].sort((a, b) =>
                    new Date(b.dateTime) - new Date(a.dateTime)
                );
                patientLabStatus = sortedLabs[0].status;
            }

            // Apply the lab tracker status to all pending blood tests
            const bloodTestStatus = {};
            pendingBlood.forEach(test => {
                bloodTestStatus[test] = patientLabStatus;
            });

            // "After Results" instructions should always appear on "today" until they are completed or handled
            const date = today;
            const doctorName = window.instructionService.getDoctorName(inst);

            if (!this.calendarEvents[date]) {
                this.calendarEvents[date] = {};
            }

            if (!this.calendarEvents[date][doctorName]) {
                this.calendarEvents[date][doctorName] = {
                    doctor: doctorName,
                    patients: [],
                    types: new Set()
                };
            }

            // Check if patient already has a pending entry
            const exists = this.calendarEvents[date][doctorName].patients.some(p =>
                p.type === 'pending' && p.instruction.id === inst.id
            );

            if (!exists) {
                const appointmentDate = inst.appointmentDate || inst.createdTime?.split('T')[0] || 'N/A';
                const allPendingTests = [...pendingBlood, ...pendingImaging];
                const displayText = `${inst.patientName}, ${inst.age || '-'}${inst.phone ? ', ' + inst.phone : ''} | ${doctorName} | Appt: ${appointmentDate}`;

                this.calendarEvents[date][doctorName].patients.push({
                    type: 'pending',
                    instruction: inst,
                    displayText: displayText,
                    pendingTests: {
                        blood: pendingBlood,
                        imaging: pendingImaging,
                        all: allPendingTests
                    },
                    bloodTestStatus: bloodTestStatus,
                    appointmentDate: appointmentDate,
                    doctorName: doctorName,
                    labRecords: patientLabs, // Include lab records for linking
                    linkedLabIds: inst.linkedLabIds || [],
                    hasPendingTests: allPendingTests.length > 0
                    });
                this.calendarEvents[date][doctorName].types.add('pending');
            }
        });
    }

    /**
     * Generate TODO events for items without specific dates
     * These appear on today's date and persist day by day
     * Only for follow-ups with no date specified (After Results now uses "Pending" events)
     * @param {Array} instructions
     * @param {Array} bloodTests
     * @param {Array} imagingTests
     */
    generateTODOEvents(instructions, bloodTests, imagingTests) {
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

            if (!this.calendarEvents[today]) {
                this.calendarEvents[today] = {};
            }

            const doctorName = window.instructionService.getDoctorName(inst);
            if (!this.calendarEvents[today][doctorName]) {
                this.calendarEvents[today][doctorName] = {
                    doctor: doctorName,
                    patients: [],
                    types: new Set()
                };
            }

            // Check if patient already has a TODO entry for today
            const exists = this.calendarEvents[today][doctorName].patients.some(p =>
                p.type === 'todo' && p.instruction.patientId === inst.patientId
            );

            if (!exists) {
                const patientDisplay = window.instructionService.getPatientDisplayString(inst);
                const testsToCheck = inst.selectedTests || [];

                this.calendarEvents[today][doctorName].patients.push({
                    type: 'todo',
                    todoReasons: reasons,
                    instruction: inst,
                    displayText: patientDisplay,
                    tests: testsToCheck,
                    appointmentDate: inst.appointmentDate || null,
                    isAfterResults: false,
                    hasResults: false
                });

                this.calendarEvents[today][doctorName].types.add('todo');
            }
        });
    }

    /**
     * Get events for a specific date
     * @param {string} date - YYYY-MM-DD
     * @returns {Array}
     */
    getEventsForDate(date) {
        if (!this.calendarEvents[date]) {
            return [];
        }
        
        const events = [];
        Object.values(this.calendarEvents[date]).forEach(doctorEvent => {
            events.push(doctorEvent);
        });
        
        return events;
    }

    /**
     * Get all events sorted by date
     * @returns {Array}
     */
    getAllEventsSorted() {
        const events = [];
        
        Object.keys(this.calendarEvents)
            .sort()
            .forEach(date => {
                Object.values(this.calendarEvents[date]).forEach(doctorEvent => {
                    events.push({
                        date,
                        ...doctorEvent
                    });
                });
            });
        
        return events;
    }

    /**
     * Refresh data and regenerate events
     * @param {Object} filters
     * @returns {Promise<Object>}
     */
    async refresh(filters = {}) {
        await this.initialize();
        return this.generateCalendarEvents(filters);
    }

    /**
     * Get unique dates with events
     * @returns {Array<string>}
     */
    getEventDates() {
        return Object.keys(this.calendarEvents).sort();
    }

    /**
     * Check if a date has events
     * @param {string} date
     * @returns {boolean}
     */
    hasEvents(date) {
        return !!this.calendarEvents[date] && Object.keys(this.calendarEvents[date]).length > 0;
    }

    /**
     * Get event count for a date
     * @param {string} date
     * @returns {number}
     */
    getEventCount(date) {
        if (!this.calendarEvents[date]) return 0;
        return Object.values(this.calendarEvents[date])
            .reduce((sum, doctorEvent) => sum + doctorEvent.patients.length, 0);
    }
}

// Export singleton instance
window.calendarService = new CalendarService();
