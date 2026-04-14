/**
 * TWOK Clinic Application Configuration
 * 
 * Configure your Google Sheets and API settings here.
 */

export const CONFIG = {
    // Google Sheets Configuration
    // Get this from your Google Cloud Console and Spreadsheet URL
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE', // Replace with your spreadsheet ID
    
    // API Configuration
    // Use 'proxy' for production (recommended) or 'direct' for testing
    API_MODE: 'proxy', // 'proxy' | 'direct'
    
    // Proxy Server URL (when using API_MODE: 'proxy')
    PROXY_SERVER_URL: 'http://localhost:3000/api',
    
    // Direct API Configuration (when using API_MODE: 'direct')
    // WARNING: Only use for testing. Service account credentials should not be exposed in frontend.
    DIRECT_API: {
        API_KEY: 'YOUR_API_KEY_HERE',
        SERVICE_ACCOUNT_EMAIL: 'your-service-account@project-id.iam.gserviceaccount.com'
    },
    
    // Sheet Names (must match your Google Sheets)
    SHEETS: {
        PATIENTS: 'Patients',
        DOCTORS: 'Doctors',
        APPOINTMENTS: 'Appointments',
        INSTRUCTIONS: 'Instructions',
        EXPENSES: 'Expenses',
        LAB_TRACKING: 'LabTracking',
        SETTINGS: 'Settings'
    },
    
    // Sync Configuration
    SYNC_INTERVAL: 30000, // Auto-sync every 30 seconds when online
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 5000,
    
    // Cache Configuration
    CACHE_VERSION: 'v1',
    CACHE_NAME: 'twok-clinic-cache-v1',
    
    // WebSocket Configuration
    WEBSOCKET_URL: 'ws://localhost:8080',
    WEBSOCKET_RECONNECT_INTERVAL: 5000
};

// Helper to get full API URL
export function getApiUrl(endpoint) {
    if (CONFIG.API_MODE === 'proxy') {
        return `${CONFIG.PROXY_SERVER_URL}/${endpoint}`;
    }
    // Direct API mode - construct Google Sheets API URL
    return `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${endpoint}`;
}

// Helper to check if online
export function isOnline() {
    return navigator.onLine;
}
