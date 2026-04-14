/**
 * Calendar Filter Component
 * Handles filtering of calendar events
 */

class CalendarFilterComponent {
    constructor() {
        this.filterDoctor = null;
        this.filterType = null;
        this.clearFiltersBtn = null;
        this.onFilterChange = null;

        this.init();
    }

    /**
     * Initialize filter component
     */
    init() {
        this.filterDoctor = document.getElementById('filterDoctor');
        this.filterType = document.getElementById('filterType');
        this.clearFiltersBtn = document.getElementById('clearFiltersBtn');

        if (!this.filterDoctor || !this.filterType) {
            console.error('[CalendarFilter] Filter elements not found');
            return;
        }

        this.attachEventListeners();
        this.populateDoctorFilter();
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Doctor filter
        this.filterDoctor.addEventListener('change', () => {
            this.onFilterChange && this.onFilterChange(this.getFilters());
        });

        // Type filter
        this.filterType.addEventListener('change', () => {
            this.onFilterChange && this.onFilterChange(this.getFilters());
        });

        // Clear filters button
        if (this.clearFiltersBtn) {
            this.clearFiltersBtn.addEventListener('click', () => {
                this.clearFilters();
            });
        }
    }

    /**
     * Populate doctor filter dropdown
     */
    async populateDoctorFilter() {
        try {
            const doctors = window.instructionService.getUniqueDoctors();
            
            // Keep the "All Doctors" option
            this.filterDoctor.innerHTML = '<option value="">All Doctors</option>';
            
            doctors.forEach(doctor => {
                const option = document.createElement('option');
                option.value = doctor;
                option.textContent = doctor;
                this.filterDoctor.appendChild(option);
            });
            
            console.log(`[CalendarFilter] Populated ${doctors.length} doctors in filter`);
        } catch (error) {
            console.error('[CalendarFilter] Failed to populate doctor filter:', error);
        }
    }

    /**
     * Get current filter values
     * @returns {Object}
     */
    getFilters() {
        return {
            doctor: this.filterDoctor.value,
            type: this.filterType.value
        };
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filterDoctor.value = '';
        this.filterType.value = '';

        console.log('[CalendarFilter] All filters cleared');
        this.onFilterChange && this.onFilterChange(this.getFilters());
    }

    /**
     * Set filter change callback
     * @param {Function} callback
     */
    setOnFilterChange(callback) {
        this.onFilterChange = callback;
    }

    /**
     * Apply filters programmatically
     * @param {Object} filters
     */
    applyFilters(filters) {
        if (filters.doctor !== undefined) {
            this.filterDoctor.value = filters.doctor || '';
        }
        if (filters.type !== undefined) {
            this.filterType.value = filters.type || '';
        }

        this.onFilterChange && this.onFilterChange(this.getFilters());
    }
}

// Export singleton instance
window.calendarFilter = new CalendarFilterComponent();
