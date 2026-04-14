/**
 * Calendar Grid Component
 * Renders the calendar grid layout (month, week, day views)
 */

class CalendarGridComponent {
    constructor() {
        this.currentDate = new Date();
        this.currentView = 'month';
        this.calendarEvents = {};
        this.maxEventsPerDay = 3;
        
        this.elements = {
            monthView: document.getElementById('monthView'),
            weekView: document.getElementById('weekView'),
            dayView: document.getElementById('dayView'),
            calendarDaysGrid: document.getElementById('calendarDaysGrid'),
            currentMonthYear: document.getElementById('currentMonthYear'),
            prevMonthBtn: document.getElementById('prevMonthBtn'),
            nextMonthBtn: document.getElementById('nextMonthBtn'),
            todayBtn: document.getElementById('todayBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            viewButtons: document.querySelectorAll('.view-btn'),
            calendarEmptyState: document.getElementById('calendarEmptyState')
        };
        
        this.init();
    }

    /**
     * Initialize calendar grid
     */
    init() {
        this.attachEventListeners();
        this.renderMonthView();
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Navigation buttons
        if (this.elements.prevMonthBtn) {
            this.elements.prevMonthBtn.addEventListener('click', () => this.navigate(-1));
        }
        
        if (this.elements.nextMonthBtn) {
            this.elements.nextMonthBtn.addEventListener('click', () => this.navigate(1));
        }
        
        if (this.elements.todayBtn) {
            this.elements.todayBtn.addEventListener('click', () => this.goToToday());
        }
        
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => this.refresh());
        }
        
        // View switcher
        this.elements.viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });
    }

    /**
     * Navigate to previous/next period
     * @param {number} direction - -1 or 1
     */
    navigate(direction) {
        if (this.currentView === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
            this.renderMonthView();
        } else if (this.currentView === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
            this.renderWeekView();
        } else if (this.currentView === 'day') {
            this.currentDate.setDate(this.currentDate.getDate() + direction);
            this.renderDayView();
        }
    }

    /**
     * Go to today's date
     */
    goToToday() {
        this.currentDate = new Date();
        this.refresh();
    }

    /**
     * Switch calendar view
     * @param {string} view - 'month', 'week', or 'day'
     */
    switchView(view) {
        this.currentView = view;
        
        // Update active button
        this.elements.viewButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        // Show/hide views
        this.elements.monthView.classList.toggle('active', view === 'month');
        this.elements.monthView.classList.toggle('hidden', view !== 'month');
        
        this.elements.weekView.classList.toggle('active', view === 'week');
        this.elements.weekView.classList.toggle('hidden', view !== 'week');
        
        this.elements.dayView.classList.toggle('active', view === 'day');
        this.elements.dayView.classList.toggle('hidden', view !== 'day');
        
        // Render appropriate view
        if (view === 'month') {
            this.renderMonthView();
        } else if (view === 'week') {
            this.renderWeekView();
        } else if (view === 'day') {
            this.renderDayView();
        }
    }

    /**
     * Render month view
     */
    renderMonthView() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // Update header
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        this.elements.currentMonthYear.textContent = `${monthNames[month]} ${year}`;
        
        // Clear grid
        this.elements.calendarDaysGrid.innerHTML = '';
        
        // Calculate first day of month and total days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        
        const today = new Date();
        const todayStr = this.toDateString(today);
        
        // Generate calendar cells
        const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
        
        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell';
            
            let dayNumber;
            let isOtherMonth = false;
            let dateStr;
            
            if (i < firstDay) {
                // Previous month
                dayNumber = daysInPrevMonth - firstDay + i + 1;
                const prevMonth = month === 0 ? 11 : month - 1;
                const prevYear = month === 0 ? year - 1 : year;
                dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
                isOtherMonth = true;
            } else if (i >= firstDay + daysInMonth) {
                // Next month
                dayNumber = i - firstDay - daysInMonth + 1;
                const nextMonth = month === 11 ? 0 : month + 1;
                const nextYear = month === 11 ? year + 1 : year;
                dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
                isOtherMonth = true;
            } else {
                // Current month
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
            dayNumberEl.className = 'day-number';
            dayNumberEl.textContent = dayNumber;
            cell.appendChild(dayNumberEl);
            
            // Events container
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'day-events';
            
            // Render events for this date
            if (this.calendarEvents[dateStr]) {
                const events = Object.values(this.calendarEvents[dateStr]);
                const displayedEvents = events.slice(0, this.maxEventsPerDay);
                const remainingCount = events.length - this.maxEventsPerDay;
                
                displayedEvents.forEach(event => {
                    const eventEl = this.createEventElement(event, dateStr);
                    eventsContainer.appendChild(eventEl);
                });
                
                if (remainingCount > 0) {
                    const moreEl = document.createElement('div');
                    moreEl.className = 'more-events';
                    moreEl.textContent = `+${remainingCount} more`;
                    eventsContainer.appendChild(moreEl);
                }
            }
            
            cell.appendChild(eventsContainer);
            this.elements.calendarDaysGrid.appendChild(cell);
        }
        
        this.updateEmptyState();
    }

    /**
     * Render week view (placeholder for future implementation)
     */
    renderWeekView() {
        const weekGrid = document.getElementById('calendarWeekGrid');
        if (!weekGrid) return;
        
        weekGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: #6b7280;">Week view coming soon</div>';
    }

    /**
     * Render day view (placeholder for future implementation)
     */
    renderDayView() {
        const dayGrid = document.getElementById('calendarDayGrid');
        if (!dayGrid) return;
        
        dayGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: #6b7280;">Day view coming soon</div>';
    }

    /**
     * Create event element for day cell
     * @param {Object} event - Event data
     * @param {string} date - Date string
     * @returns {HTMLElement}
     */
    createEventElement(event, date) {
        const eventEl = document.createElement('div');
        eventEl.className = 'day-event';
        
        // Determine primary type for styling
        const types = Array.from(event.types);
        const primaryType = types[0];
        eventEl.classList.add(primaryType);
        
        // Doctor name
        const doctorEl = document.createElement('span');
        doctorEl.className = 'day-event-doctor';
        doctorEl.textContent = event.doctor;
        eventEl.appendChild(doctorEl);
        
        // Patient count
        if (event.patients.length > 0) {
            const patientEl = document.createElement('span');
            patientEl.className = 'day-event-patient';
            patientEl.textContent = `${event.patients.length} patient${event.patients.length > 1 ? 's' : ''}`;
            eventEl.appendChild(patientEl);
        }
        
        // Click handler
        eventEl.addEventListener('click', () => {
            window.calendarEvent.showEventDetail(event, date);
        });
        
        return eventEl;
    }

    /**
     * Update calendar events
     * @param {Object} events
     */
    updateEvents(events) {
        this.calendarEvents = events;
        this.refresh();
    }

    /**
     * Refresh current view
     */
    refresh() {
        if (this.currentView === 'month') {
            this.renderMonthView();
        } else if (this.currentView === 'week') {
            this.renderWeekView();
        } else if (this.currentView === 'day') {
            this.renderDayView();
        }
    }

    /**
     * Update empty state visibility
     */
    updateEmptyState() {
        const hasAnyEvents = Object.keys(this.calendarEvents).length > 0;
        
        if (this.elements.calendarEmptyState) {
            this.elements.calendarEmptyState.classList.toggle('hidden', hasAnyEvents);
        }
    }

    /**
     * Convert date to string format YYYY-MM-DD
     * @param {Date} date
     * @returns {string}
     */
    toDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// Export singleton instance
window.calendarGrid = new CalendarGridComponent();
