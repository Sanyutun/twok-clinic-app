/**
 * TWOK Clinic Backend API Server
 * Express + Supabase integration for Render deployment
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 9010;

// ==========================================
// SUPABASE CLIENT
// ==========================================
const supabaseUrl = 'https://yinwoxljrfpqoibycqii.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpbndveGxqcmZwcW9pYnljcWlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI0NDU4OSwiZXhwIjoyMDkxODIwNTg5fQ.5ZzszEM3ymglPSzhnKtc-Nxyy7oHk9IbsPL0WsW1s7Q'; // Use service role for backend

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// HELPERS
// ==========================================
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalizePhone(phone) {
    return phone.replace(/[\s\-\(\)\+]/g, '');
}

function getPhoneVariants(phone) {
    const digits = phone.replace(/\D/g, '');
    const variants = [phone, digits];
    if (digits.startsWith('95') && digits.length > 9) variants.push('0' + digits.slice(2));
    if (digits.startsWith('09')) variants.push('+959' + digits.slice(2), '959' + digits.slice(2));
    if (digits.length > 8) variants.push(digits.slice(-8));
    if (digits.length > 9) variants.push(digits.slice(-9));
    return [...new Set(variants)].filter(Boolean);
}

async function searchPatientsByPhone(supabase, phone) {
    const variants = getPhoneVariants(phone);
    const seen = new Set();
    const results = [];
    for (const v of variants) {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .ilike('phone', `%${v}%`)
            .order('name', { ascending: true });
        if (error) throw error;
        if (data) {
            for (const p of data) {
                if (!seen.has(p.id)) {
                    seen.add(p.id);
                    results.push(p);
                }
            }
        }
    }
    return results;
}

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from the project root
const rootDir = path.join(__dirname, '..');
app.use(express.static(rootDir));

// Root route for the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'index.html'));
});

// ==========================================
// HTTP SERVER + WEBSOCKET
// ==========================================
const server = http.createServer(app);

// Initialize WebSocket Server (sharing the same port as HTTP)
const wss = new WebSocketServer({ server });
console.log(`📡 WebSocket server sharing port ${PORT}`);

// WebSocket client tracking
const wsClients = new Map(); // Use Map to store client info
let nextClientId = 1;

wss.on('connection', (ws) => {
    const clientId = nextClientId++;
    wsClients.set(ws, { id: clientId });
    console.log(`📡 WebSocket client ${clientId} connected. Total: ${wsClients.size}`);
    
    // Send connection acknowledgment with clientId
    ws.send(JSON.stringify({
        type: 'connection_ack',
        clientId: clientId,
        timestamp: new Date().toISOString()
    }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            // console.log(`Received message type: ${data.type} from client ${clientId}`);
            
            // Handle heartbeat
            if (data.type === 'heartbeat') {
                ws.send(JSON.stringify({
                    type: 'heartbeat_ack',
                    timestamp: new Date().toISOString()
                }));
                return;
            }

            // Broadcast to all clients (including TV view specific events)
            wsClients.forEach((info, client) => {
                if (client.readyState === 1) {
                    // Relay the message as-is
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`📡 WebSocket client ${clientId} disconnected. Total: ${wsClients.size}`);
    });
});

// Broadcast helper
function broadcast(event, data) {
    const message = JSON.stringify({ type: event, data }); // Use 'type' instead of 'event' for frontend compatibility
    wsClients.forEach((info, client) => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/health', async (req, res) => {
    let supabaseStatus = 'unknown';
    try {
        const { data, error } = await supabase.from('patients').select('count', { count: 'exact', head: true });
        if (error) throw error;
        supabaseStatus = 'connected';
    } catch (err) {
        console.error('[Health] Supabase connection check failed:', err.message);
        supabaseStatus = `error: ${err.message}`;
    }

    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        clients: wsClients.size,
        supabase: supabaseStatus,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version
    });
});

// ==========================================
// REST API ROUTES
// ==========================================

// Helper: Generic fetch all from table
async function fetchAll(table, orderBy = 'created_at', orderDir = 'asc') {
    const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending: orderDir === 'asc' });
    
    if (error) throw error;
    return data;
}

// --- PATIENTS ---
app.get('/api/patients', async (req, res) => {
    try {
        const patients = await fetchAll('patients');
        res.json(patients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/patients', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('patients')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        // broadcast('patient_created', data); // Relying on Supabase Realtime
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/patients/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('patients')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        // broadcast('patient_updated', data); // Relying on Supabase Realtime
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/patients/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('patients')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        // broadcast('patient_deleted', { id: req.params.id }); // Relying on Supabase Realtime
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PATIENT SEARCH (for incoming call integration) ---
app.get('/api/patients/search', async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone) {
            return res.status(400).json({ error: 'Phone query parameter is required', success: false });
        }
        const cleanPhone = normalizePhone(phone.trim());
        const patients = await searchPatientsByPhone(supabase, cleanPhone);
        res.json({ success: true, count: patients.length, patients });
    } catch (error) {
        console.error('[Patient Search] Error:', error.message);
        res.status(500).json({ error: error.message, success: false });
    }
});

// --- INCOMING CALL PAGE (for Android Automate integration) ---
app.get('/incoming-call', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
        const { phone } = req.query;
        if (!phone) {
            return res.send(`<html><body style="font-family:sans-serif;padding:20px;text-align:center;background:#f3f4f6;"><h2>❌ Missing phone number</h2><p>Usage: /incoming-call?phone=09123456789</p></body></html>`);
        }
        const cleanPhone = normalizePhone(phone.trim());
        const patients = await searchPatientsByPhone(supabase, cleanPhone);

        const count = patients.length;
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const encodedPhone = encodeURIComponent(cleanPhone);
        const safePhone = escapeHtml(cleanPhone);

        let patientCards = '';
        if (count === 0) {
            patientCards = `<div style="text-align:center;padding:40px 20px;color:#6b7280;"><p style="font-size:1.2rem;">😕 No patients found with phone <strong>${safePhone}</strong></p></div>`;
        } else {
            patients.forEach(p => {
                const phoneDisplay = p.phone || '-';
                const ageDisplay = p.age || '-';
                const sexDisplay = p.sex || '-';
                const encPatientId = encodeURIComponent(p.id);
                const encPatientName = encodeURIComponent(p.name);
                patientCards += `
                    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
                        <div style="display:flex;justify-content:space-between;align-items:start;">
                            <div>
                                <h3 style="margin:0 0 4px;font-size:1.1rem;color:#111827;">${escapeHtml(p.name)}</h3>
                                <p style="margin:2px 0;color:#6b7280;font-size:0.9rem;">🆔 ${escapeHtml(p.id)}</p>
                            </div>
                            <a href="${baseUrl}/?patientId=${encPatientId}&phone=${encodedPhone}" style="background:#2563eb;color:white;text-decoration:none;padding:8px 16px;border-radius:8px;font-size:0.85rem;white-space:nowrap;">👤 Open Patient</a>
                        </div>
                        <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
                            <span style="font-size:0.85rem;color:#374151;">📞 ${escapeHtml(phoneDisplay)}</span>
                            <span style="font-size:0.85rem;color:#374151;">🎂 ${escapeHtml(ageDisplay)}</span>
                            <span style="font-size:0.85rem;color:#374151;">⚤ ${escapeHtml(sexDisplay)}</span>
                            <span style="font-size:0.85rem;color:#374151;">📍 ${escapeHtml(p.address || '-')}</span>
                        </div>
                        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                            <a href="${baseUrl}/?patientId=${encPatientId}&patientName=${encPatientName}&phone=${encodedPhone}&action=createAppointment" class="card-action-btn" style="background:#059669;">📅 Create Appointment</a>
                            <a href="${baseUrl}/?patientName=${encPatientName}&phone=${encodedPhone}&action=openLabTracker" class="card-action-btn" style="background:#7c3aed;">🔬 Lab Tracker</a>
                        </div>
                    </div>`;
            });
        }

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Incoming Call - Patient Search</title>
    <script src="/indexeddb.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 16px; color: #111827; }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 12px; margin-bottom: 16px; text-align: center; }
        .header h1 { font-size: 1.3rem; margin-bottom: 4px; }
        .header p { font-size: 0.9rem; opacity: 0.9; }
        .count-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; margin-bottom: 12px; }
        .footer { text-align: center; margin-top: 20px; padding: 16px; color: #9ca3af; font-size: 0.8rem; }

        .action-toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; justify-content: center; }
        .action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border: none; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: opacity 0.2s; }
        .action-btn:hover { opacity: 0.85; }
        .action-btn.primary { background: #059669; color: white; }
        .action-btn.secondary { background: #4b5563; color: white; }
        .action-btn.info { background: #7c3aed; color: white; }
        a.card-action-btn { display: inline-flex; align-items: center; gap: 4px; color: white; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 500; white-space: nowrap; }

        .add-phone-section { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); display: none; }
        .add-phone-section.visible { display: block; }
        .add-phone-section h3 { font-size: 1rem; margin-bottom: 8px; color: #374151; }
        .add-phone-search-wrap { display: flex; gap: 8px; }
        .add-phone-search-wrap input { flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; outline: none; }
        .add-phone-search-wrap input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.2); }
        .add-phone-results { margin-top: 8px; max-height: 300px; overflow-y: auto; }
        .patient-result-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 6px; background: #f9fafb; }
        .patient-result-item .info { flex: 1; }
        .patient-result-item .name { font-weight: 600; color: #111827; }
        .patient-result-item .detail { font-size: 0.8rem; color: #6b7280; }
        .patient-result-item .add-btn { background: #2563eb; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 500; white-space: nowrap; }
        .patient-result-item .add-btn:disabled { background: #9ca3af; cursor: not-allowed; }
        .patient-result-item .added-badge { background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 500; }

        .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1f2937; color: white; padding: 12px 24px; border-radius: 10px; font-size: 0.9rem; z-index: 9999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
        .toast.show { opacity: 1; }

        .loading-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #e5e7eb; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.6s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .no-results-sm { padding: 20px; text-align: center; color: #9ca3af; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div id="toast" class="toast"></div>

    <div class="header">
        <h1>📞 Incoming Call</h1>
        <p>Phone: <strong>${safePhone}</strong></p>
    </div>

    <div class="action-toolbar">
        <button class="action-btn primary" onclick="createNewPatient()">➕ Create New Patient</button>
        <button class="action-btn secondary" onclick="toggleAddPhoneSearch()">📞 Add Phone to Existing</button>
        <a href="${baseUrl}/" class="action-btn secondary" style="background:#2563eb;">🏥 Open Clinic App</a>
    </div>

    <div id="addPhoneSection" class="add-phone-section">
        <h3>📞 Add Phone to Existing Patient</h3>
        <p style="font-size:0.85rem;color:#6b7280;margin-bottom:10px;">Search for a patient by name to add <strong>${safePhone}</strong> as an additional phone number.</p>
        <div class="add-phone-search-wrap">
            <input type="text" id="patientNameSearch" placeholder="Type patient name to search..." oninput="searchPatientsByName(this.value)" autocomplete="off">
            <button onclick="document.getElementById('patientNameSearch').value='';document.getElementById('patientNameResults').innerHTML='';" style="padding:8px 14px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;font-size:1.1rem;">✕</button>
        </div>
        <div id="patientNameResults" class="add-phone-results"></div>
        <div id="addPhoneLoading" style="display:none;text-align:center;padding:16px;"><span class="loading-spinner"></span> Loading patients...</div>
    </div>

    <div style="text-align:center;">
        <span class="count-badge">${count} patient${count !== 1 ? 's' : ''} found</span>
    </div>
    ${patientCards}
    <div class="footer">
        <a href="${baseUrl}/?phone=${encodedPhone}&action=incomingCall" style="color:#2563eb;text-decoration:none;">← Open in Clinic App</a>
    </div>

    <script>
        var CALLER_PHONE = '${safePhone}';
        var CALLER_PHONE_ENC = '${encodedPhone}';
        var BASE_URL = '${baseUrl}';
        var dbPatients = [];
        var dbLoaded = false;

        function showToast(msg) {
            var t = document.getElementById('toast');
            t.textContent = msg;
            t.classList.add('show');
            clearTimeout(t._hide);
            t._hide = setTimeout(function() { t.classList.remove('show'); }, 2500);
        }

        function copyToClipboard(text) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(function() {
                    showToast('📋 Copied: ' + text);
                });
            } else {
                var ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('📋 Copied: ' + text);
            }
        }

        function createNewPatient() {
            copyToClipboard(CALLER_PHONE);
            window.open(BASE_URL + '/?phone=' + CALLER_PHONE_ENC + '&action=newPatient', '_blank');
        }

        function toggleAddPhoneSearch() {
            var section = document.getElementById('addPhoneSection');
            var isVisible = section.classList.toggle('visible');
            if (isVisible && !dbLoaded) {
                loadPatientDatabase();
            }
            if (isVisible) {
                setTimeout(function() {
                    document.getElementById('patientNameSearch').focus();
                }, 200);
            }
        }

        async function loadPatientDatabase() {
            var loadingEl = document.getElementById('addPhoneLoading');
            loadingEl.style.display = 'block';
            try {
                if (typeof TWOKDB !== 'undefined' && TWOKDB.getAll) {
                    dbPatients = await TWOKDB.getAll(TWOKDB.STORES.PATIENTS);
                    if (!Array.isArray(dbPatients)) dbPatients = [];
                    dbLoaded = true;
                    console.log('[IncomingCall] Loaded', dbPatients.length, 'patients from IndexedDB');
                } else {
                    console.warn('[IncomingCall] TWOKDB not available');
                }
            } catch (e) {
                console.error('[IncomingCall] Failed to load patients:', e);
            }
            loadingEl.style.display = 'none';
        }

        function searchPatientsByName(query) {
            var resultsEl = document.getElementById('patientNameResults');
            var term = (query || '').toLowerCase().trim();

            if (!term || !dbLoaded || dbPatients.length === 0) {
                if (!dbLoaded && term) {
                    resultsEl.innerHTML = '<div class="no-results-sm">Loading patients from database...</div>';
                } else if (!term) {
                    resultsEl.innerHTML = '';
                } else {
                    resultsEl.innerHTML = '<div class="no-results-sm">No patients found matching "' + escapeHtml_(term) + '"</div>';
                }
                return;
            }

            var matches = dbPatients.filter(function(p) {
                return (p.name || '').toLowerCase().includes(term);
            }).slice(0, 15);

            if (matches.length === 0) {
                resultsEl.innerHTML = '<div class="no-results-sm">No patients found matching "' + escapeHtml_(term) + '"</div>';
                return;
            }

            resultsEl.innerHTML = matches.map(function(p) {
                var existingPhones = (p.phone || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
                var phoneAlreadyAdded = existingPhones.some(function(ph) {
                    return normalizePhone_(ph) === normalizePhone_(CALLER_PHONE);
                });
                var statusHtml = phoneAlreadyAdded
                    ? '<span class="added-badge">✓ Already Added</span>'
                    : '<button class="add-btn" onclick="addPhoneToPatient(\\'' + p.id.replace(/'/g, "\\\\'") + '\\', this)">+ Add Phone</button>';
                return '<div class="patient-result-item">' +
                    '<div class="info">' +
                        '<div class="name">' + escapeHtml_(p.name) + '</div>' +
                        '<div class="detail">🆔 ' + escapeHtml_(p.id) + ' &middot; 📞 ' + escapeHtml_(p.phone || '-') + '</div>' +
                    '</div>' +
                    statusHtml +
                '</div>';
            }).join('');
        }

        async function addPhoneToPatient(patientId, btn) {
            btn.disabled = true;
            btn.textContent = '...';

            try {
                var patient = dbPatients.find(function(p) { return p.id === patientId; });
                if (!patient) {
                    showToast('Patient not found');
                    return;
                }

                var existingPhones = (patient.phone || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
                if (existingPhones.some(function(ph) { return normalizePhone_(ph) === normalizePhone_(CALLER_PHONE); })) {
                    showToast('Phone number already exists for ' + patient.name);
                    btn.outerHTML = '<span class="added-badge">✓ Already Added</span>';
                    return;
                }

                existingPhones.push(CALLER_PHONE);
                patient.phone = existingPhones.join(', ');

                await TWOKDB.put(TWOKDB.STORES.PATIENTS, patient);

                var idx = dbPatients.findIndex(function(p) { return p.id === patientId; });
                if (idx >= 0) dbPatients[idx] = patient;

                showToast('✅ Phone added to ' + patient.name);
                btn.outerHTML = '<span class="added-badge">✓ Added</span>';
            } catch (e) {
                console.error('[IncomingCall] Error adding phone:', e);
                showToast('❌ Error adding phone: ' + e.message);
                btn.disabled = false;
                btn.textContent = '+ Add Phone';
            }
        }

        function normalizePhone_(ph) {
            return String(ph).replace(/[\\s\\-\\(\\)\\+]/g, '');
        }

        function escapeHtml_(text) {
            if (!text) return '';
            return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
    </script>
</body>
</html>`);
    } catch (error) {
        console.error('[Incoming Call] Error:', error.message);
        res.status(500).send(`<html><body style="font-family:sans-serif;padding:20px;text-align:center;background:#f3f4f6;"><h2>❌ Server Error</h2><p>${escapeHtml(error.message)}</p></body></html>`);
    }
});

// --- DOCTORS ---
app.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await fetchAll('doctors');
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/doctors', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('doctors')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('doctor_created', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/doctors/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('doctors')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('doctor_updated', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/doctors/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('doctors')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        broadcast('doctor_deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- APPOINTMENTS ---
app.get('/api/appointments', async (req, res) => {
    try {
        const appointments = await fetchAll('appointments', 'appointment_time');
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/appointments', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        // broadcast('appointment_created', data); // Relying on Supabase Realtime
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/appointments/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        // broadcast('appointment_updated', data); // Relying on Supabase Realtime
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/appointments/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('appointments')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        // broadcast('appointment_deleted', { id: req.params.id }); // Relying on Supabase Realtime
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- INSTRUCTIONS ---
app.get('/api/instructions', async (req, res) => {
    try {
        const instructions = await fetchAll('instructions', 'created_at', 'desc');
        res.json(instructions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/instructions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('instructions')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('instruction_created', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/instructions/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('instructions')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('instruction_updated', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/instructions/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('instructions')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        broadcast('instruction_deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- EXPENSES ---
app.get('/api/expenses', async (req, res) => {
    try {
        const expenses = await fetchAll('expenses', 'date_time', 'desc');
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('expense_created', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/expenses/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('expense_updated', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/expenses/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('expenses')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        broadcast('expense_deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- EXPENSE CATEGORIES ---
app.get('/api/expense-categories', async (req, res) => {
    try {
        const categories = await fetchAll('expense_categories');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/expense-categories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('expense_categories')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/expense-categories/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('expense_categories')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/expense-categories/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('expense_categories')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- LAB RECORDS ---
app.get('/api/lab-records', async (req, res) => {
    try {
        const labs = await fetchAll('lab_records', 'date_time', 'desc');
        res.json(labs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/lab-records', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lab_records')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('lab_created', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/lab-records/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lab_records')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();
        
        if (error) throw error;
        broadcast('lab_updated', data);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/lab-records/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('lab_records')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        broadcast('lab_deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ADDRESSES ---
app.get('/api/addresses', async (req, res) => {
    try {
        const addresses = await fetchAll('addresses');
        res.json(addresses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/addresses', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('addresses')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/addresses/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('addresses')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SPECIALITIES ---
app.get('/api/specialities', async (req, res) => {
    try {
        const specialities = await fetchAll('specialities');
        res.json(specialities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/specialities', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('specialities')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/specialities/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('specialities')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- HOSPITALS ---
app.get('/api/hospitals', async (req, res) => {
    try {
        const hospitals = await fetchAll('hospitals');
        res.json(hospitals);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/hospitals', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hospitals')
            .insert(req.body)
            .select()
            .single();
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/hospitals/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('hospitals')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// BATCH SYNC ENDPOINT
// ==========================================
app.post('/api/sync', async (req, res) => {
    try {
        const { operations, senderId } = req.body;
        if (!operations || !Array.isArray(operations)) {
            return res.status(400).json({ error: 'Invalid operations format', success: false });
        }

        const results = [];

        // Group operations by table and type to allow batching
        const upsertsByTable = {};
        const deletesByTable = {};

        for (const op of operations) {
            const { table, operation, data, id } = op;
            if (operation === 'delete') {
                if (!deletesByTable[table]) deletesByTable[table] = [];
                deletesByTable[table].push(id);
            } else {
                if (!upsertsByTable[table]) upsertsByTable[table] = [];
                const upsertData = { ...data };
                if (id && !upsertData.id) upsertData.id = id;
                upsertsByTable[table].push(upsertData);
            }
        }

        // 1. Process Upserts (Batched)
        for (const [table, records] of Object.entries(upsertsByTable)) {
            const { data, error } = await supabase.from(table).upsert(records).select();
            if (error) throw error;
            results.push({ success: true, table, operation: 'upsert', count: records.length });
        }

        // 2. Process Deletes (Batched where possible, or individual)
        for (const [table, ids] of Object.entries(deletesByTable)) {
            const { error } = await supabase.from(table).delete().in('id', ids);
            if (error) throw error;
            results.push({ success: true, table, operation: 'delete', count: ids.length });
        }

        // Broadcast the specific operations to other clients via WebSocket for instant syncing
        broadcast('sync_operations', { operations, senderId });
        
        // Also broadcast sync completed event
        broadcast('sync_completed', { operations: operations.length, senderId });
        
        res.json({ success: true, results });
    } catch (error) {
        console.error('[Sync] Global error:', error);
        res.status(500).json({ 
            error: error.message, 
            success: false 
        });
    }
});

// ==========================================
// REALTIME SUBSCRIPTION (Server-side)
// ==========================================
async function setupRealtimeSubscriptions() {
    const tables = [
        'patients', 'doctors', 'appointments', 'instructions',
        'expenses', 'expense_categories', 'lab_records', 'settings',
        'addresses', 'specialities', 'hospitals'
    ];

    for (const table of tables) {
        supabase
            .channel(`${table}-changes`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                (payload) => {
                    // console.log(`📡 ${table} change:`, payload.eventType);
                    broadcast(`${table}_${payload.eventType.toLowerCase()}`, payload.new);
                }
            )
            .subscribe();
    }
}

// ==========================================
// START SERVER
// ==========================================
async function start() {
    try {
        // Setup realtime subscriptions - DISABLED: Clients listen to Supabase Realtime directly
        // await setupRealtimeSubscriptions();

        server.listen(PORT, () => {
            console.log('✅ TWOK Clinic Backend running');
            console.log(`🌐 http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 Supabase: ${supabaseUrl}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

start();
