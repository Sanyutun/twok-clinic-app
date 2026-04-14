/**
 * WebSocket Client Module
 * 
 * Handles real-time communication with the WebSocket server.
 * Automatically reconnects on connection loss.
 */

import { CONFIG } from './config.js';

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.reconnectTimer = null;
        this.listeners = {};
        this.isConnected = false;
        this.url = CONFIG.WEBSOCKET_URL;
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('[WebSocket] Already connected');
            return;
        }

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                console.log('[WebSocket] Connected');
                this.isConnected = true;
                this.notifyListeners('connect');
                
                // Clear any pending reconnect timer
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[WebSocket] Message received:', data.type);
                    this.notifyListeners(data.type, data);
                } catch (error) {
                    console.error('[WebSocket] Error parsing message:', error);
                }
            };

            this.socket.onclose = (event) => {
                console.log('[WebSocket] Disconnected:', event.code, event.reason);
                this.isConnected = false;
                this.notifyListeners('disconnect', { code: event.code, reason: event.reason });
                
                // Attempt to reconnect
                this.scheduleReconnect();
            };

            this.socket.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
                this.notifyListeners('error', error);
            };

        } catch (error) {
            console.error('[WebSocket] Failed to connect:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }

        console.log(`[WebSocket] Reconnecting in ${CONFIG.WEBSOCKET_RECONNECT_INTERVAL}ms...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, CONFIG.WEBSOCKET_RECONNECT_INTERVAL);
    }

    /**
     * Disconnect from WebSocket server
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.isConnected = false;
    }

    /**
     * Send message to WebSocket server
     */
    send(type, data = {}) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocket] Cannot send - not connected');
            return false;
        }

        const message = JSON.stringify({ type, ...data });
        this.socket.send(message);
        return true;
    }

    /**
     * Broadcast queue update
     */
    broadcastQueueUpdate(queueData) {
        return this.send('queue_update', { queue: queueData });
    }

    /**
     * Broadcast patient update
     */
    broadcastPatientUpdate(patientData) {
        return this.send('patient_update', { patient: patientData });
    }

    /**
     * Broadcast appointment update
     */
    broadcastAppointmentUpdate(appointmentData) {
        return this.send('appointment_update', { appointment: appointmentData });
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Notify all listeners for an event
     */
    notifyListeners(event, data) {
        const callbacks = this.listeners[event] || [];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('[WebSocket] Listener error:', error);
            }
        });

        // Also notify 'all' listeners
        const allCallbacks = this.listeners['all'] || [];
        allCallbacks.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('[WebSocket] Listener error:', error);
            }
        });
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            readyState: this.socket?.readyState ?? WebSocket.CLOSED,
            url: this.url
        };
    }
}

// WebSocket ready states
WebSocketClient.CONNECTING = WebSocket.CONNECTING;
WebSocketClient.OPEN = WebSocket.OPEN;
WebSocketClient.CLOSING = WebSocket.CLOSING;
WebSocketClient.CLOSED = WebSocket.CLOSED;

// Export singleton instance
export const websocketClient = new WebSocketClient();
export default websocketClient;
