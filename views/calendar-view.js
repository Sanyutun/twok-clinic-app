/**
 * Calendar View Main Application
 * Initializes and coordinates all calendar components
 */

class CalendarViewApp {
    constructor() {
        this.isInitialized = false;
        this.connectionStatus = 'online';
        this.init();
    }

    /**
     * Initialize the calendar view application
     */
    async init() {
        try {
            console.log('[CalendarView] Initializing...');
            
            // Show loading
            this.showLoading(true);
            
            // Initialize IndexedDB
            if (window.TWOKDB) {
                await window.TWOKDB.initDB();
                console.log('[CalendarView] IndexedDB initialized');
            }
            
            // Initialize services
            await window.calendarService.initialize();
            console.log('[CalendarView] Services initialized');
            
            // Setup filter change handler
            window.calendarFilter.setOnFilterChange((filters) => {
                this.applyFilters(filters);
            });
            
            // Generate initial calendar events
            const events = window.calendarService.generateCalendarEvents();
            window.calendarGrid.updateEvents(events);
            
            // Setup WebSocket for real-time updates
            this.setupWebSocket();
            
            // Update connection status
            this.updateConnectionStatus();
            
            // Setup connection status listeners
            window.addEventListener('online', () => this.updateConnectionStatus());
            window.addEventListener('offline', () => this.updateConnectionStatus());
            
            // Hide loading
            this.showLoading(false);
            
            this.isInitialized = true;
            console.log('[CalendarView] Initialization complete');
            
        } catch (error) {
            console.error('[CalendarView] Initialization failed:', error);
            this.showLoading(false);
            this.showError('Failed to load calendar data. Please refresh.');
        }
    }

    /**
     * Apply filters and refresh calendar
     * @param {Object} filters
     */
    async applyFilters(filters) {
        try {
            this.showLoading(true);
            
            const events = window.calendarService.generateCalendarEvents(filters);
            window.calendarGrid.updateEvents(events);
            
            this.showLoading(false);
        } catch (error) {
            console.error('[CalendarView] Failed to apply filters:', error);
            this.showLoading(false);
        }
    }

    /**
     * Setup WebSocket for real-time updates
     */
    setupWebSocket() {
        // Listen for instruction saved events
        window.addEventListener('instruction-saved', (event) => {
            console.log('[CalendarView] Instruction saved, refreshing...');
            this.refreshCalendar();
        });
        
        // Listen for lab result updates (custom event)
        window.addEventListener('lab-result-updated', (event) => {
            console.log('[CalendarView] Lab result updated, refreshing...');
            this.refreshCalendar();
        });
        
        // Listen for WebSocket messages if available
        if (window.ws) {
            const originalOnMessage = window.ws.onmessage;
            window.ws.onmessage = (event) => {
                // Call original handler if exists
                if (originalOnMessage) {
                    originalOnMessage.call(window.ws, event);
                }
                
                // Parse message and refresh if needed
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'instruction_added' || data.type === 'lab_updated') {
                        console.log('[CalendarView] Real-time update received, refreshing...');
                        this.refreshCalendar();
                    }
                } catch (error) {
                    console.error('[CalendarView] Failed to parse WebSocket message:', error);
                }
            };
        }
    }

    /**
     * Refresh calendar data
     */
    async refreshCalendar() {
        try {
            const filters = window.calendarFilter.getFilters();
            const events = await window.calendarService.refresh(filters);
            window.calendarGrid.updateEvents(events);
            
            // Repopulate doctor filter
            await window.calendarFilter.populateDoctorFilter();
            
            console.log('[CalendarView] Calendar refreshed');
        } catch (error) {
            console.error('[CalendarView] Failed to refresh calendar:', error);
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus() {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;
        
        if (navigator.onLine) {
            this.connectionStatus = 'online';
            statusEl.className = 'status-indicator online';
            statusEl.title = 'Online';
        } else {
            this.connectionStatus = 'offline';
            statusEl.className = 'status-indicator offline';
            statusEl.title = 'Offline - Using cached data';
        }
    }

    /**
     * Show/hide loading indicator
     * @param {boolean} show
     */
    showLoading(show) {
        const loadingEl = document.getElementById('calendarLoading');
        if (loadingEl) {
            loadingEl.classList.toggle('hidden', !show);
        }
    }

    /**
     * Show error message
     * @param {string} message
     */
    showError(message) {
        // Could implement a toast or alert system here
        console.error('[CalendarView]', message);
        alert(message);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.calendarViewApp = new CalendarViewApp();
});

// Back to main app button
document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('backToMainBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
    }
});
