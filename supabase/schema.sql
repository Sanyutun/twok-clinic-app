-- TWOK Clinic Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PATIENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    age INTEGER,
    sex VARCHAR(10),
    address TEXT,
    phone VARCHAR(50),
    note TEXT,
    is_foc BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. DOCTORS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    speciality VARCHAR(255),
    hospital VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. APPOINTMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(id),
    patient_name VARCHAR(255),
    age INTEGER,
    sex VARCHAR(10),
    phone VARCHAR(50),
    doctor_id VARCHAR(50) REFERENCES doctors(id),
    doctor_name VARCHAR(255),
    appointment_time TIMESTAMP WITH TIME ZONE,
    booking_type VARCHAR(50),
    booking_number INTEGER,
    status VARCHAR(50) DEFAULT 'Waiting',
    notes TEXT,
    waiting_time TIMESTAMP WITH TIME ZONE,
    consultation_time TIMESTAMP WITH TIME ZONE,
    done_time TIMESTAMP WITH TIME ZONE,
    postpone_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX idx_appointments_appointment_time ON appointments(appointment_time);

-- ==========================================
-- 4. INSTRUCTIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS instructions (
    id VARCHAR(100) PRIMARY KEY,
    appointment_id VARCHAR(50) REFERENCES appointments(id),
    patient_id VARCHAR(50) REFERENCES patients(id),
    patient_name VARCHAR(255),
    age INTEGER,
    phone VARCHAR(50),
    doctor_name VARCHAR(255),
    appointment_date VARCHAR(50),
    booking_number INTEGER,
    general_instruction TEXT,
    return_duration INTEGER,
    return_unit VARCHAR(50),
    next_appointment_date VARCHAR(50),
    follow_up_doctor VARCHAR(255),
    other_instruction VARCHAR(255),
    transfer_hospital VARCHAR(255),
    selected_tests TEXT[], -- PostgreSQL array
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_instructions_appointment_id ON instructions(appointment_id);
CREATE INDEX idx_instructions_patient_id ON instructions(patient_id);
CREATE INDEX idx_instructions_follow_up_doctor ON instructions(follow_up_doctor);

-- ==========================================
-- 5. EXPENSES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(100) PRIMARY KEY,
    amount INTEGER NOT NULL,
    category VARCHAR(255),
    remark TEXT,
    patient_id VARCHAR(50) REFERENCES patients(id),
    patient_name VARCHAR(255),
    note TEXT,
    date_time TIMESTAMP WITH TIME ZONE,
    doctor_name VARCHAR(255),
    item_name VARCHAR(255),
    expense_type VARCHAR(50),
    custom_type_name VARCHAR(255),
    custom_icon VARCHAR(255),
    appointment_id VARCHAR(50) REFERENCES appointments(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date_time ON expenses(date_time);
CREATE INDEX idx_expenses_patient_id ON expenses(patient_id);

-- ==========================================
-- 6. EXPENSE CATEGORIES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 7. LAB RECORDS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS lab_records (
    id VARCHAR(100) PRIMARY KEY, -- Frontend generated ID (e.g. L0000001)
    expense_id VARCHAR(100) REFERENCES expenses(id), -- Link to expense
    patient_id VARCHAR(50) REFERENCES patients(id),
    patient_name VARCHAR(255),
    doctor_id VARCHAR(50) REFERENCES doctors(id),
    doctor_name VARCHAR(255),
    lab_name VARCHAR(255),
    amount INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    date_time TIMESTAMP WITH TIME ZONE,
    pending_tests TEXT[], -- PostgreSQL array
    timeline JSONB, -- {sentToLab, partialResult, completeResult, ...}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lab_records_status ON lab_records(status);
CREATE INDEX idx_lab_records_patient_id ON lab_records(patient_id);
CREATE INDEX idx_lab_records_date_time ON lab_records(date_time);

-- ==========================================
-- 8. ADDRESSES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS addresses (
    id VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 9. SPECIALITIES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS specialities (
    id VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 10. HOSPITALS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS hospitals (
    id VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ENABLE REALTIME FOR ALL TABLES
-- ==========================================
ALTER TABLE patients REPLICA IDENTITY FULL;
ALTER TABLE doctors REPLICA IDENTITY FULL;
ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE instructions REPLICA IDENTITY FULL;
ALTER TABLE expenses REPLICA IDENTITY FULL;
ALTER TABLE expense_categories REPLICA IDENTITY FULL;
ALTER TABLE lab_records REPLICA IDENTITY FULL;
ALTER TABLE addresses REPLICA IDENTITY FULL;
ALTER TABLE specialities REPLICA IDENTITY FULL;
ALTER TABLE hospitals REPLICA IDENTITY FULL;

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================
-- Enable RLS on all tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialities ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (allow all operations for now)
-- In production, you'd want stricter policies based on user authentication
CREATE POLICY "Allow all access" ON patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON doctors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON instructions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON expense_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON lab_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON specialities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON hospitals FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- UPDATED_AT TRIGGER FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW._last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to main tables
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_instructions_updated_at BEFORE UPDATE ON instructions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_records_updated_at BEFORE UPDATE ON lab_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- INSERT INITIAL DATA (Optional)
-- ==========================================
-- Insert default expense categories
INSERT INTO expense_categories (id, name, icon) VALUES
    ('cat_maintenance', 'Maintenance', '🔧'),
    ('cat_utilities', 'Utilities', '💡'),
    ('cat_supplies', 'Medical Supplies', '💊'),
    ('cat_equipment', 'Equipment', '🏥'),
    ('cat_staff', 'Staff Payments', '👤'),
    ('cat_rent', 'Rent', '🏠'),
    ('cat_transport', 'Transport', '🚗'),
    ('cat_misc', 'Miscellaneous', '📦')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 11. SETTINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY, -- id will be the SettingKey
    value TEXT NOT NULL, -- JSON string of the value
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE settings REPLICA IDENTITY FULL;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY \"Allow all access\" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

