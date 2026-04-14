# TWOK Clinic - TV Queue Display Guide

## Overview

The TV Queue Display is a separate read-only page designed for large TV screens in the waiting area. It shows real-time queue information for patients waiting for their consultation.

## Access

### From Main Application
- Click the **"TV Display"** button in the top-right corner of the main application header
- Opens in a new tab/window

### Direct Access
- Open `tv-view.html` in any modern web browser
- URL: `http://localhost/tv-view.html` (or your server URL)

## Features

### 1. Doctor Title Header
```
DR SOE CHAN MYAE
Today Appointment Queue
Current Date & Time
```

### 2. Queue Progress Bar
- Shows completion progress
- Displays: `X / Y patients completed`
- Visual progress bar with percentage

### 3. Currently Consulting
- Large green card showing current patient
- Displays:
  - Booking Number (very large)
  - Patient Name
  - Age
- Shows "No patient currently consulting" when idle

### 4. Next Patient
- Large orange card showing next patient
- Automatically determines next patient based on:
  - Arrived patients first
  - Then booked patients
  - Respects booking number order
  - Applies penalty turns for late arrivals

### 5. Arrived / Waiting List
- Blue cards showing all waiting patients
- Displays:
  - Booking Number
  - Patient Name
  - Age
  - Arrival Time
- Penalty indicator (⚠️) for late arrivals

### 6. Not Arrived Yet
- Grey cards showing booking numbers only
- For patients with "Booked" status
- Helps staff call patients

## Data Filtering

The TV view automatically filters appointments:

- **Doctor**: Dr. Soe Chan Myae (configurable in code)
- **Date**: Today's date only
- **Excluded Status**: Cancelled, Postpone

## Status Display Logic

| Status | Display Section |
|--------|----------------|
| In Consult | Currently Consulting |
| Arrived | Arrived / Waiting |
| Investigation | Arrived / Waiting |
| Booked | Not Arrived Yet |
| Done | Removed from view |
| Cancelled | Hidden |
| Postpone | Hidden |

## Auto-Refresh

- **Refresh Interval**: 10 seconds
- **Clock Update**: Every minute
- **Last Updated**: Shown in bottom-right corner

## Fullscreen Mode

### Enable Fullscreen
1. Click the fullscreen button (⛶) in top-right corner
2. Or press F11 in most browsers

### Exit Fullscreen
- Click the minimize button
- Or press F11 / Esc

## Setup Instructions

### 1. Display Hardware
- Any TV with HDMI input
- Connect a computer / Raspberry Pi / Android TV box
- Ensure stable network connection

### 2. Browser Setup
```
Recommended Browsers:
- Google Chrome (recommended)
- Microsoft Edge
- Firefox
- Safari (iOS/macOS)
```

### 3. Auto-Start on Boot (Optional)

**Windows:**
1. Create a shortcut to `tv-view.html`
2. Place in Startup folder
3. Set browser to open in fullscreen (F11)

**Raspberry Pi:**
```bash
# Add to ~/.config/lxsession/LXDE-pi/autostart
@chromium-browser --kiosk --incognito http://your-server/tv-view.html
```

**Android TV:**
- Use Fully Kiosk Browser app
- Set URL to tv-view.html
- Enable auto-start

### 4. Display Settings
- **Resolution**: 1920x1080 (Full HD) recommended
- **Orientation**: Landscape
- **Brightness**: Adjust for room lighting
- **Sleep**: Disable screen sleep/timeout

## Customization

### Change Target Doctor

Edit `tv-view.html`, find line ~600:

```javascript
targetDoctor: 'Dr. Soe Chan Myae'  // Change this
```

### Adjust Refresh Rate

Edit `tv-view.html`, find line ~730:

```javascript
this.refreshInterval = setInterval(() => {
    this.loadAppointments();
}, 10000);  // Change from 10000 (10 seconds)
```

### Modify Colors

Edit the CSS in `tv-view.html`:

```css
/* Currently Consulting - Green */
.consulting-card {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

/* Next Patient - Orange */
.next-patient-card {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

/* Arrived - Blue */
.waiting-item {
    background: rgba(59, 130, 246, 0.3);
    border-left: 5px solid #3b82f6;
}
```

## Troubleshooting

### Page Not Loading
- Check network connection
- Verify server is running
- Check browser console for errors

### Data Not Updating
- Wait for next auto-refresh (10 seconds)
- Refresh browser (F5 or Ctrl+R)
- Clear browser cache if needed

### Display Issues
- Press F11 for fullscreen
- Adjust browser zoom (Ctrl+Plus/Minus)
- Check TV resolution settings

### Blank Sections
- No appointments for today = Empty state shown
- All patients completed = Shows completion message
- Check if appointments exist in main app

## Queue Priority System

The TV display uses this priority order:

1. **Status Priority**:
   - In Consult (highest)
   - Investigation
   - Arrived
   - Booked
   - Noted (lowest)

2. **Within Same Status**:
   - Booking Number (ascending)
   - Penalty patients last

3. **Penalty System**:
   - Late arrivals get 3-turn penalty
   - Shown with ⚠️ indicator
   - Queued after normal patients

## Integration with Main App

The TV view reads data directly from the same IndexedDB database as the main application. Changes made in the main app appear on the TV display within 10 seconds.

### Workflow Example

1. Staff marks patient as **Arrived** → TV shows in Arrived section
2. Staff clicks **Consult** → TV shows in Currently Consulting
3. Staff clicks **Done** → Patient removed from TV
4. Next patient automatically moves to Next Patient card

## Security Notes

- **Read-only**: TV view cannot modify data
- **No authentication**: Anyone with URL can view
- **Local network only**: Recommended for clinic LAN
- **No data export**: Cannot download patient data

## Performance

- **Load Time**: < 2 seconds
- **Memory Usage**: ~50MB
- **CPU Usage**: Minimal (idle between refreshes)
- **Network**: Only loads once, then polls IndexedDB

## Best Practices

1. **Dedicated Device**: Use a dedicated computer/TV box
2. **Stable Power**: Use UPS for uninterrupted display
3. **Network**: Wired connection preferred over WiFi
4. **Testing**: Test before going live
5. **Backup**: Keep a backup display device

## Support

For issues or questions:
1. Check browser console (F12)
2. Verify IndexedDB has data
3. Test on different browser
4. Check network connectivity

---

**Version**: 1.0.0  
**Last Updated**: 2026-03-24  
**File**: tv-view.html
