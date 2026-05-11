-- Fix foreign key constraints to support cascading deletes
-- This prevents "violates foreign key constraint" errors during sync

-- 1. APPOINTMENTS
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_id_fkey 
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;

-- 2. INSTRUCTIONS
ALTER TABLE instructions DROP CONSTRAINT IF EXISTS instructions_appointment_id_fkey;
ALTER TABLE instructions ADD CONSTRAINT instructions_appointment_id_fkey 
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

ALTER TABLE instructions DROP CONSTRAINT IF EXISTS instructions_patient_id_fkey;
ALTER TABLE instructions ADD CONSTRAINT instructions_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

-- 3. EXPENSES
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_patient_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_appointment_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_appointment_id_fkey 
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

-- 4. LAB RECORDS
ALTER TABLE lab_records DROP CONSTRAINT IF EXISTS lab_records_patient_id_fkey;
ALTER TABLE lab_records ADD CONSTRAINT lab_records_patient_id_fkey 
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE lab_records DROP CONSTRAINT IF EXISTS lab_records_expense_id_fkey;
ALTER TABLE lab_records ADD CONSTRAINT lab_records_expense_id_fkey 
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE;

ALTER TABLE lab_records DROP CONSTRAINT IF EXISTS lab_records_doctor_id_fkey;
ALTER TABLE lab_records ADD CONSTRAINT lab_records_doctor_id_fkey 
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
