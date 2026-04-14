/**
 * WebSocket Server for TWOK Clinic Queue Display
 * Broadcasts real-time updates to connected TV displays
 * Also serves static files (index.html, tv-view.html, etc.)
 *
 * Usage: node websocket-server.js
 * Requires: npm install ws
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000; // Render provides PORT environment variable
const BROADCAST_DELAY = 100; // ms delay before broadcasting to batch updates

// MIME types for serving static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Create HTTP server for serving static files
const httpServer = http.createServer((req, res) => {
    // Parse URL - remove query strings
    let url = req.url.split('?')[0];
    
    // Default to index.html
    if (url === '/') {
        url = '/index.html';
    }
    
    // Build file path
    const filePath = path.join(__dirname, url);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Read and serve file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found: ' + url);
            } else {
                res.writeHead(500);
                res.end('Server error: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server: httpServer });

// Connected clients
const clients = new Set();

// Debounce timer for batching updates
let broadcastTimer = null;

/**
 * Broadcast message to all connected clients
 * @param {Object} message - Message to broadcast
 */
function broadcast(message) {
    const data = JSON.stringify(message);
    console.log(`Broadcasting: ${message.type}`);
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

/**
 * Queue a broadcast with debouncing
 * @param {Object} message - Message to broadcast
 */
function queueBroadcast(message) {
    if (broadcastTimer) {
        clearTimeout(broadcastTimer);
    }
    
    broadcastTimer = setTimeout(() => {
        broadcast(message);
        broadcastTimer = null;
    }, BROADCAST_DELAY);
}

/**
 * Handle new client connection
 */
wss.on('connection', (ws) => {
    console.log(`Client connected. Total clients: ${clients.size + 1}`);
    clients.add(ws);
    
    // Send connection acknowledgment
    ws.send(JSON.stringify({
        type: 'connection_ack',
        timestamp: new Date().toISOString(),
        clientId: clients.size
    }));
    
    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received from client:', data);
            
            // Handle heartbeat
            if (data.type === 'heartbeat') {
                // Respond with acknowledgment
                ws.send(JSON.stringify({
                    type: 'heartbeat_ack',
                    timestamp: new Date().toISOString()
                }));
            }
            
            // Handle queue update requests from main app
            if (data.type === 'queue_update' ||
                data.type === 'appointment_status_changed' ||
                data.type === 'patient_arrived' ||
                data.type === 'consultation_started' ||
                data.type === 'consultation_finished' ||
                data.type === 'appointment_deleted' ||
                data.type === 'appointment_created' ||
                data.type === 'appointment_updated') {
                // Broadcast to all connected TV displays with both client and server timestamps
                queueBroadcast({
                    type: data.type,
                    data: data.data,
                    clientTimestamp: data.timestamp,
                    serverTimestamp: new Date().toISOString()
                });
            }
            
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    // Handle client disconnect
    ws.on('close', () => {
        clients.delete(ws);
        console.log(`Client disconnected. Total clients: ${clients.size}`);
    });
    
    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

/**
 * Server error handling
 */
wss.on('error', (error) => {
    console.error('Server error:', error);
});

// Start the combined HTTP + WebSocket server
httpServer.listen(PORT, () => {
    console.log(`TWOK Clinic Server started:`);
    console.log(`  - Main App: http://localhost:${PORT}/`);
    console.log(`  - TV View:  http://localhost:${PORT}/tv-view.html`);
    console.log(`  - WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`Waiting for connections...`);
});

// Note: The separate broadcast server has been removed for cloud deployment.
// Use the WebSocket connection to send updates directly.
