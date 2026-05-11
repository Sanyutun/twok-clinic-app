-- Update instructions table to support all required fields
ALTER TABLE instructions 
    ADD COLUMN IF NOT EXISTS edited_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS linked_lab_ids TEXT[];
