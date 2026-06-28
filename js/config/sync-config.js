/**
 * Sync Configuration
 * Environment-specific settings for Supabase and sync
 */

window.TWOK_CONFIG = {
    // Supabase Configuration
    // Replace these with your actual Supabase project credentials
    SUPABASE: {
        URL: 'https://yinwoxljrfpqoibycqii.supabase.co',
        ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpbndveGxqcmZwcW9pYnljcWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDQ1ODksImV4cCI6MjA5MTgyMDU4OX0.twlkGYRNJ30e8SgvDgfXUuVhkS4-pGNQ610tl6HdGck',
        SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpbndveGxqcmZwcW9pYnljcWlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI0NDU4OSwiZXhwIjoyMDkxODIwNTg5fQ.5ZzszEM3ymglPSzhnKtc-Nxyy7oHk9IbsPL0WsW1s7Q' // Only for backend
    },

    // API URL (backend server)
    // For local development: http://localhost:3000
    // For production: https://your-app.onrender.com
    API_URL: window.location.origin,

    // Sync Settings
    SYNC: {
        // Auto-sync interval in milliseconds (2 minutes)
        INTERVAL: 120000,
        
        // Enable realtime subscriptions
        REALTIME: true,
        
        // Enable offline queue
        OFFLINE_QUEUE: true,
        
        // Max retry attempts for failed syncs
        MAX_RETRIES: 10
    },

    // Feature Flags
    FEATURES: {
        // Enable cloud sync
        CLOUD_SYNC: true,
        
        // Enable realtime updates
        REALTIME_UPDATES: true,
        
        // Enable offline mode
        OFFLINE_MODE: true,
        
        // Enable optimistic UI updates
        OPTIMISTIC_UI: true
    },

    // Debug Settings
    DEBUG: {
        // Enable verbose logging (Global toggle)
        ENABLED: false,
        
        // Log levels
        LEVELS: {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        },
        
        // Current log level
        CURRENT_LEVEL: 2, // WARN
        
        // Log sync operations specifically
        LOG_SYNC: false,
        
        // Log realtime events specifically
        LOG_REALTIME: false
    }
};

// Simple Logger Utility
window.TWOK_LOGGER = {
    debug: function(...args) {
        if (window.TWOK_CONFIG.DEBUG.ENABLED && window.TWOK_CONFIG.DEBUG.CURRENT_LEVEL <= 0) {
            console.log(...args);
        }
    },
    info: function(...args) {
        if (window.TWOK_CONFIG.DEBUG.ENABLED && window.TWOK_CONFIG.DEBUG.CURRENT_LEVEL <= 1) {
            console.log(...args);
        }
    },
    log: function(...args) {
        this.info(...args);
    },
    warn: function(...args) {
        if (window.TWOK_CONFIG.DEBUG.CURRENT_LEVEL <= 2) {
            console.warn(...args);
        }
    },
    error: function(...args) {
        if (window.TWOK_CONFIG.DEBUG.CURRENT_LEVEL <= 3) {
            console.error(...args);
        }
    },
    // Special helpers for sync and realtime
    sync: function(...args) {
        if (window.TWOK_CONFIG.DEBUG.LOG_SYNC) {
            console.log('%c[Sync]', 'color: #2563eb; font-weight: bold;', ...args);
        }
    },
    realtime: function(...args) {
        if (window.TWOK_CONFIG.DEBUG.LOG_REALTIME) {
            console.log('%c[Realtime]', 'color: #10b981; font-weight: bold;', ...args);
        }
    }
};
