# WebSocket Setup for TWOK Clinic Queue Display

This document explains how to set up and use the WebSocket server for real-time queue updates on the TV display.

## Overview

The TV view page (`tv-view.html`) uses WebSocket to receive real-time updates when appointment data changes. The main app (`script.js`) automatically broadcasts events when patient status changes, providing instant updates on the TV display.

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  Main App       │ ◄────────────────► │  WebSocket       │
│  (script.js)    │  (auto-broadcast)  │  Server          │
└─────────────────┘                    │  (port 3000)     │
                                       └──────────────────┘
                                              │
                                              │ WebSocket
                                              ▼
                                       ┌──────────────────┐
                                       │  TV View         │
                                       │  (tv-view.html)  │
                                       └──────────────────┘
```

## Installation

1. **Install Node.js dependencies:**

   ```bash
   npm install
   ```

2. **Start the server (HTTP + WebSocket):**

   ```bash
   npm start
   ```

   Or directly:
   ```bash
   node websocket-server.js
   ```

3. **Open the application in your browser:**

   - **Main App:** Open `http://localhost:9000/` in your browser
   - **TV View:** Open `http://localhost:9000/tv-view.html` on the TV display

   **Important:** Do NOT open HTML files directly with `file://` protocol. Always use `http://localhost:9000/` to avoid security origin errors.

## Automatic Broadcasting (Already Implemented)

The main app (`script.js`) automatically broadcasts WebSocket events at these key points:

| Action | Event Type | Function |
|--------|------------|----------|
| Appointment marked as Booked | `appointment_status_changed` | `markAppointmentBooked()` |
| Patient marked as Arrived | `patient_arrived` | `markAppointmentArrived()` |
| Consultation started | `consultation_started` | `startConsultation()` |
| Consultation finished (No investigation) | `consultation_finished` | `handleInvestigationNo()` |
| Investigation completed | `queue_update` | `completeInvestigation()` |

No manual integration is needed - events are broadcast automatically when these actions occur.

## HTTP Broadcast Endpoint

The server also provides an HTTP endpoint for triggering broadcasts:

**POST** `http://localhost:3001/broadcast`

```json
{
  "type": "queue_update",
  "data": {
    "reason": "appointment_created"
  }
}
```

## Connection Status Indicator

The TV view shows a connection status indicator in the bottom-left corner:

- 🟢 **Green (Connected)**: WebSocket is connected and receiving updates
- 🟡 **Yellow (Connecting)**: Attempting to connect
- 🔴 **Red (Disconnected)**: Connection failed or lost

The TV view automatically reconnects every 3 seconds if the connection is lost.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | 3000 | WebSocket server port |

### TV View Configuration

In `tv-view.html`, you can modify these constants:

```javascript
const WS_URL = 'ws://localhost:9000';  // WebSocket server URL
const RECONNECT_DELAY = 3000;  // Reconnect delay in milliseconds
```

## Troubleshooting

### TV View Not Receiving Updates

1. **Check if server is running:**
   - Open http://localhost:9000/ in your browser
   - You should see the main TWOK Clinic app
   - If not, run `npm start` to start the server

2. **Check WebSocket connection:**
   - Open http://localhost:9000/test-websocket.html
   - Status should show "✓ Connected" (green)
   - Click "Send Patient Arrived" to test
   - Check if TV view receives the update

3. **Check connection status on TV view:**
   - Look at bottom-left corner of TV view
   - 🟢 Green = Connected
   - 🟡 Yellow = Connecting
   - 🔴 Red = Disconnected

4. **Check browser console (F12):**
   - Open http://localhost:9000/tv-view.html
   - Press F12 to open Developer Tools
   - Check Console tab for errors
   - Look for "Loaded appointments: X" message
   - Look for "Today appointments count: X" message

### No Patients Showing on TV View

1. **Verify appointments exist:**
   - Open http://localhost:9000/test-websocket.html
   - Click "Check Appointments"
   - Verify appointments are listed

2. **Check appointment date:**
   - TV view only shows **today's** appointments
   - Appointments must have `appointmentTime` set to today's date

3. **Check doctor name:**
   - TV view only shows appointments for **"Dr. Soe Chan Myae"**
   - Doctor name must match exactly (case-sensitive)

4. **Check appointment status:**
   - Excluded statuses: `Cancelled`, `Postpone`, `Done`
   - Valid statuses: `Noted`, `Booked`, `Arrived`, `In Consult`, `Investigation`

### Server Won't Start

1. **Check if port 9000 is already in use:**
   ```bash
   netstat -ano | findstr :9000
   ```

2. **Kill the process using port 9000:**
   ```bash
   taskkill /F /PID <PID from above command>
   ```

3. **Reinstall dependencies:**
   ```bash
   npm install
   ```

### Security Origin Errors (file:// protocol)

**Problem:** "Unsafe attempt to load URL file:///..."

**Solution:** Always use HTTP, never open HTML files directly:
- ❌ Don't: `file:///C:/Users/.../tv-view.html`
- ✅ Do: `http://localhost:9000/tv-view.html`

## Testing

You can test the WebSocket connection using the test page:

1. Open http://localhost:9000/test-websocket.html
2. Verify connection status shows "✓ Connected"
3. Click test event buttons to send events
4. Check TV view receives the updates

Or using browser console on TV view:

```javascript
// Check connection
window.isWebSocketConnected();

// Send test event
window.sendQueueEvent('queue_update', { test: true });
```

Or using a WebSocket client like [wscat](https://github.com/websockets/wscat):

```bash
wscat -c ws://localhost:9000
> {"type": "queue_update", "data": {"test": true}}
```
