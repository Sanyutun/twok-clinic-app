# 💊 Pharmacist Corner - Documentation

## Overview

The **Pharmacist Corner** is a dedicated workspace integrated into the main TWOK Clinic App for pharmacy staff to manage post-consultation workflow. It combines Doctor Instructions and Expense entry into a streamlined, card-based interface optimized for fast data entry.

**Key Integration:** The Pharmacist Corner is now a fully integrated tab within the main application, sharing the same local IndexedDB database with all other modules (Patients, Doctors, Appointments, Instructions, Expenses, Lab Tracker).

## Features

### ✨ Key Features

- **Integrated Tab** - Accessible from the main navigation bar alongside Patients, Doctors, Appointments, etc.
- **Card-based UI** - Clean, minimal design showing today's completed consultations
- **Offline-First** - Works without internet, syncs when connection restored
- **Real-time Updates** - Automatic refresh when appointments status changes to "Done"
- **Smart Completion Tracking** - Visual indicators for completed/pending patients
- **Lab Tracker Integration** - Automatic lab entry creation for lab test expenses
- **Global Reusable Forms** - Instruction and Expense forms available across the app
- **Shared Database** - All data stored in the same IndexedDB, accessible from all tabs

## Architecture

### Folder Structure

```
TWOK-Clinic-App/
├── index.html                        # Main app with Pharmacist Corner tab
├── script.js                         # Main app logic including pharmacist corner
├── style.css                         # Styles including pharmacist corner styles
├── indexeddb.js                      # IndexedDB wrapper for shared database
├── components/
│   ├── instruction-form.js           # Global instruction form component
│   └── expense-form.js               # Global expense form component
├── services/
│   ├── googleSheetsApi.js            # Google Sheets API wrapper
│   └── syncQueue.js                  # Offline queue management
└── PHARMACIST_CORNER.md              # This documentation
```

### Database Integration

The Pharmacist Corner shares the same IndexedDB database with all other modules:

```
┌─────────────────────────────────────────────────────────────┐
│                    IndexedDB (TWOK_Clinic_DB)                │
├─────────────────────────────────────────────────────────────┤
│  Stores:                                                     │
│  • patients         • doctors          • appointments       │
│  • instructions     • expenses         • lab_tracker        │
│  • addresses        • specialities     • hospitals          │
│  • expense_categories                                        │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────┐
│  Patients     │   │  Pharmacist       │   │  Lab Tracker  │
│  Tab          │   │  Corner Tab       │   │  Tab          │
└───────────────┘   └───────────────────┘   └───────────────┘
```

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  IndexedDB      │────▶│  Pharmacist      │────▶│  Google Sheets  │
│  (Primary Store)│     │  Corner (Tab)    │     │  (Backup/Sync)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Offline Queue   │
                        │  (Sync Manager)  │
                        └──────────────────┘
```

## Usage Guide

### 1. Accessing Pharmacist Corner

1. Open the main TWOK Clinic App (`index.html`)
2. Click on the **💊 Pharmacist** tab in the bottom navigation bar or sidebar
3. The Pharmacist Corner section loads within the same page

### 2. Understanding the Interface

#### Header Statistics

| Stat | Description |
|------|-------------|
| **Total Patients** | Total completed consultations today |
| **Pending** | Patients awaiting instruction/expense entry |
| **Completed** | Patients with both instruction and expense recorded |
| **Queued for Sync** | Changes waiting to sync to Google Sheets |

#### Patient Cards

Each card displays:
- **Booking Number** - Queue position
- **Patient Name** - Full name
- **Age** - Patient age
- **Doctor Name** - Consulting doctor
- **Status Badge** - Pending or Completed
- **Action Buttons** - Instructions and Expenses

#### Status Indicators

- **⏳ Pending** - Yellow badge, full opacity card
- **✓ Completed** - Green badge, slightly greyed card

### 3. Recording Instructions

1. Click **📝 Instructions** button on patient card
2. Select **Instruction Type**:
   - 💊 Medication
   - 📋 After Results
   - 📅 Follow Up
   - 📝 Other
3. Enter **Instruction Note** (details about medication, dosage, etc.)
4. Optionally set **Next Visit Date**
5. Click **💾 Save Instruction**

### 4. Recording Expenses

1. Click **💰 Expenses** button on patient card
2. Select **Expense Type**:
   - 💊 Medicine
   - 💉 Injection
   - 🔬 Lab Test
   - 🏥 Procedure
   - 📝 Other
3. Enter **Item Name** (e.g., "Paracetamol 500mg", "CBC Test")
4. Enter **Amount** in MMK
5. Optionally add **Notes**
6. Click **💾 Save Expense**

#### Lab Test Auto-Creation

When **Expense Type = Lab Test**:
- Lab Tracker fields appear automatically
- Select **Lab Name** (TWOK, NN, YN, BH)
- Lab tracker entry is created automatically with:
  - Patient Name
  - Doctor Name
  - Lab Name
  - Status: "Sent to lab"
  - Current date

### 5. Filtering and Search

#### Search Bar
- Search by **patient name** (partial match supported)
- Search by **booking number**

#### Filter Buttons
- **All** - Show all patients
- **Pending** - Show only pending patients
- **Completed** - Show only completed patients

### 6. Offline Workflow

The Pharmacist Corner works fully offline:

1. **Recording Data Offline**
   - Instructions saved to IndexedDB immediately
   - Expenses saved to IndexedDB immediately
   - Lab entries created in IndexedDB
   - All changes queued for sync

2. **When Connection Restored**
   - Automatic sync to Google Sheets begins
   - Queue count updates in real-time
   - Success/error notifications shown

## Data Model

### Instruction Record

```javascript
{
  instruction_id: "inst_1234567890_abc123",
  appointment_id: "appt_123",
  patient_id: "patient_456",
  doctor_name: "Dr. Soe Chan Myae",
  instruction_type: "Medication",
  instruction_note: "Take Paracetamol 500mg twice daily after food",
  next_visit_date: "2026-04-05",
  timestamp: "2026-03-29T10:30:00.000Z"
}
```

### Expense Record

```javascript
{
  expense_id: "exp_1234567890_xyz789",
  appointment_id: "appt_123",
  patient_id: "patient_456",
  expense_type: "Medicine",
  item_name: "Paracetamol 500mg",
  amount: 5000,
  note: "2 tablets x 2 days",
  timestamp: "2026-03-29T10:35:00.000Z"
}
```

### Lab Tracker Record (Auto-Created)

```javascript
{
  lab_id: "lab_1234567890_lab456",
  appointment_id: "appt_123",
  patient_id: "patient_456",
  patient_name: "Mg Mg",
  doctor_name: "Dr. Soe Chan Myae",
  lab_name: "TWOK",
  test_name: "CBC Test",
  amount: 15000,
  status: "Sent to lab",
  sent_date: "2026-03-29",
  timestamp: "2026-03-29T10:35:00.000Z"
}
```

## API Reference

### Google Sheets API Service

```javascript
// Add instruction
await window.googleSheetsApi.addInstruction(instructionData);

// Add expense
await window.googleSheetsApi.addExpense(expenseData);

// Add lab entry
await window.googleSheetsApi.addLabEntry(labData);

// Check online status
const isOnline = window.googleSheetsApi.isOnlineStatus();

// Get queued count
const queuedCount = window.googleSheetsApi.getQueuedCount();
```

### Sync Queue Service

```javascript
// Enqueue item for sync
await window.syncQueue.enqueue({
  type: 'add_instruction',
  data: instructionData
});

// Process queue
await window.syncQueue.processQueue(processorFn);

// Get stats
const stats = await window.syncQueue.getStats();
// Returns: { total, pending, completed }

// Clear completed
await window.syncQueue.clearCompleted();
```

### Global Forms

```javascript
// Show instruction form
window.instructionForm.show(appointment);

// Hide instruction form
window.instructionForm.hide();

// Show expense form
window.expenseForm.show(appointment);

// Hide expense form
window.expenseForm.hide();
```

## Events

### Custom Events

The Pharmacist Corner dispatches and listens to custom events:

```javascript
// Instruction saved
window.addEventListener('instruction-saved', (e) => {
  console.log('Instruction saved:', e.detail);
});

// Expense saved
window.addEventListener('expense-saved', (e) => {
  console.log('Expense saved:', e.detail);
});

// Queue synced
window.addEventListener('queue-synced', (e) => {
  console.log('Sync complete:', e.detail);
});
```

## WebSocket Integration

Real-time updates via WebSocket:

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:9000');

// Listen for appointment status changes
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'appointment_status_changed') {
    // Reload patient cards
    pharmacistCorner.loadData().then(() => pharmacistCorner.render());
  }
};
```

## Troubleshooting

### Issue: Patient cards not appearing

**Solution:**
1. Verify appointment status is "Done"
2. Check appointment date is today
3. Refresh the page
4. Check browser console for errors

### Issue: Sync not working

**Solution:**
1. Check internet connection
2. Verify Google Sheets API credentials
3. Check sync queue count
4. Review browser console for sync errors

### Issue: Forms not opening

**Solution:**
1. Ensure components are loaded (check script tags)
2. Verify appointment data is valid
3. Check browser console for JavaScript errors

### Issue: Lab tracker not auto-creating

**Solution:**
1. Verify Expense Type is "Lab Test"
2. Check lab tracker fields are visible
3. Ensure IndexedDB is accessible
4. Review browser console for errors

## Best Practices

### Data Entry

1. **Complete both instruction and expense** for each patient
2. **Use specific item names** for expenses (e.g., "Paracetamol 500mg" not just "Medicine")
3. **Add detailed notes** for complex instructions
4. **Set next visit dates** for follow-up patients

### Offline Mode

1. **Check sync queue** before closing browser
2. **Wait for sync completion** when connection restored
3. **Don't clear browser data** while queue has pending items

### Performance

1. **Archive old data** regularly to keep IndexedDB small
2. **Clear completed sync queue** items periodically
3. **Close unused tabs** to reduce memory usage

## Future Enhancements

### Planned Features

- [ ] Bulk instruction/expense entry
- [ ] Printable prescription slips
- [ ] Medicine inventory tracking
- [ ] Expense analytics dashboard
- [ ] SMS notifications for lab results
- [ ] Barcode scanning for medicines
- [ ] Drug interaction warnings
- [ ] Prescription history per patient

## Support

For issues or questions:
1. Check browser console for errors
2. Review this documentation
3. Contact the development team

---

**Version:** 1.0.0  
**Last Updated:** 2026-03-29  
**Author:** TWOK Clinic Development Team
