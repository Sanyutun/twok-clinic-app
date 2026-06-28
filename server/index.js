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
