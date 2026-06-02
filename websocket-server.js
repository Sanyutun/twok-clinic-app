/**
 * TWOK Clinic Unified Server
 * Handles both Static Files, REST API, and WebSocket updates
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// SUPABASE CLIENT
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://yinwoxljrfpqoibycqii.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpbndveGxqcmZwcW9pYnljcWlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI0NDU4OSwiZXhwIjoyMDkxODIwNTg5fQ.5ZzszEM3ymglPSzhnKtc-Nxyy7oHk9IbsPL0WsW1s7Q';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    // We don't exit here to allow static file serving even if DB is down
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from current directory
app.use(express.static(__dirname));

// Root route for the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// HTTP SERVER + WEBSOCKET
// ==========================================
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocketServer({ server });
console.log(`📡 WebSocket server sharing port ${PORT}`);

// WebSocket client tracking
const wsClients = new Set();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`📡 WebSocket client connected. Total: ${wsClients.size}`);
    
    ws.send(JSON.stringify({
        type: 'connection_ack',
        timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // Handle heartbeat
            if (data.type === 'heartbeat') {
                ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
                return;
            }

            // Broadcast to all clients
            broadcast(data.type, data.data || data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`📡 WebSocket client disconnected. Total: ${wsClients.size}`);
    });
});

// Broadcast helper
function broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    wsClients.forEach(client => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

// ==========================================
// REST API ROUTES
// ==========================================

// Health check
app.get('/health', async (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        supabase: supabase ? 'initialized' : 'missing'
    });
});

// Batch sync endpoint
app.post('/api/sync', async (req, res) => {
    try {
        const { operations } = req.body;
        if (!operations || !Array.isArray(operations)) {
            return res.status(400).json({ error: 'Invalid operations format' });
        }

        console.log(`[Sync] 📥 Processing ${operations.length} operations`);
        const results = [];

        for (const op of operations) {
            const { table, operation, data, id } = op;
            let result;

            try {
                switch (operation) {
                    case 'upsert':
                        const upsertData = { ...data };
                        if (id) upsertData.id = id;
                        result = await supabase.from(table).upsert(upsertData).select();
                        break;
                    case 'delete':
                        result = await supabase.from(table).delete().eq('id', id);
                        break;
                    default:
                        console.warn(`[Sync] Unknown operation: ${operation}`);
                }

                if (result && result.error) throw result.error;
                results.push({ success: true, table, id });
            } catch (err) {
                console.error(`[Sync] ❌ Failed op on ${table}:`, err.message);
                results.push({ success: false, table, id, error: err.message });
            }
        }

        broadcast('sync_completed', { count: operations.length });
        res.json({ success: true, results });
    } catch (error) {
        console.error('[Sync] Global error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`✅ Unified Server running on port ${PORT}`);
});
