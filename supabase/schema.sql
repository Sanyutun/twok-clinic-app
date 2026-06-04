-- TWOK Clinic Database Schema for Supabase
-- Consolidated Schema - Includes all updates and RLS policies
-- Safe to run multiple times without data loss

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. TABLES (Using IF NOT EXISTS)
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

CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
    patient_name VARCHAR(255),
    age INTEGER,
    sex VARCHAR(10),
    phone VARCHAR(50),
    doctor_id VARCHAR(50) REFERENCES doctors(id) ON DELETE CASCADE,
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
    arrival_time TIMESTAMP WITH TIME ZONE,
    booked_time TIMESTAMP WITH TIME ZONE,
    noted_time TIMESTAMP WITH TIME ZONE,
    inconsult_time TIMESTAMP WITH TIME ZONE,
    investigation_time TIMESTAMP WITH TIME ZONE,
    consult_start_time TIMESTAMP WITH TIME ZONE,
    is_next BOOLEAN DEFAULT false,
    penalty_turns INTEGER DEFAULT 0,
    edited_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instructions (
    id VARCHAR(100) PRIMARY KEY,
    appointment_id VARCHAR(50) REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
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
    selected_tests TEXT[],
    linked_lab_ids TEXT[],
    lab_tracker_id VARCHAR(100),
    edited_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(100) PRIMARY KEY,
    amount INTEGER NOT NULL,
    category VARCHAR(255),
    remark TEXT,
    patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
    patient_name VARCHAR(255),
    note TEXT,
    date_time TIMESTAMP WITH TIME ZONE,
    doctor_name VARCHAR(255),
    item_name VARCHAR(255),
    expense_type VARCHAR(50),
    custom_type_name VARCHAR(255),
    custom_icon VARCHAR(255),
    appointment_id VARCHAR(50) REFERENCES appointments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_records (
    id VARCHAR(100) PRIMARY KEY,
    appointment_id VARCHAR(50) REFERENCES appointments(id) ON DELETE CASCADE,
    expense_id VARCHAR(100) REFERENCES expenses(id) ON DELETE CASCADE,
    patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
    patient_name VARCHAR(255),
    doctor_id VARCHAR(50) REFERENCES doctors(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255),
    lab_name VARCHAR(255),
    amount INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    date_time TIMESTAMP WITH TIME ZONE,
    pending_tests TEXT[],
    timeline JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _sync_status VARCHAR(20) DEFAULT 'synced',
    _last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings and lookup tables
CREATE TABLE IF NOT EXISTS expense_categories (id VARCHAR(100) PRIMARY KEY, name VARCHAR(255) NOT NULL, icon VARCHAR(255));
CREATE TABLE IF NOT EXISTS addresses (id VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());
CREATE TABLE IF NOT EXISTS specialities (id VARCHAR(100) PRIMARY KEY, value VARCHAR(255) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());
CREATE TABLE IF NOT EXISTS hospitals (id VARCHAR(100) PRIMARY KEY, value VARCHAR(255) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());
CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());

-- ==========================================
-- 2. ADD MISSING COLUMNS (To ensure updates apply to existing tables)
-- ==========================================
ALTER TABLE instructions ADD COLUMN IF NOT EXISTS linked_lab_ids TEXT[];
ALTER TABLE instructions ADD COLUMN IF NOT EXISTS lab_tracker_id VARCHAR(100);
ALTER TABLE instructions ADD COLUMN IF NOT EXISTS edited_time TIMESTAMP WITH TIME ZONE;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS arrival_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS edited_time TIMESTAMP WITH TIME ZONE;

ALTER TABLE lab_records ADD COLUMN IF NOT EXISTS appointment_id VARCHAR(50) REFERENCES appointments(id) ON DELETE CASCADE;
ALTER TABLE lab_records ADD COLUMN IF NOT EXISTS expense_id VARCHAR(100) REFERENCES expenses(id) ON DELETE CASCADE;

-- ==========================================
-- 3. RLS AND REPLICATION
-- ==========================================
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all access" ON %I', t);
        EXECUTE format('CREATE POLICY "Allow all access" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- ==========================================
-- 4. TRIGGERS
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW._last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables 
             WHERE table_schema = 'public' AND column_name = 'updated_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'update_' || t || '_updated_at', t);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', 'update_' || t || '_updated_at', t);
    END LOOP;
END $$;

-- ==========================================
-- 5. INITIAL DATA
-- ==========================================
INSERT INTO settings (id, value, updated_at)
VALUES ('vipReservedNumbers', '[1, 2, 5, 8, 12, 14, 18]', NOW())
ON CONFLICT (id) DO NOTHING;

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
