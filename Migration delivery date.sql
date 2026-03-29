-- ================================================================
--  SS Milk – Migration: Add delivery_date & delivered_at columns
--  Run: mysql -u root -p ssmilk_db < migration_delivery_date.sql
-- ================================================================

USE ssmilk_db;

-- Add estimated delivery date (set by admin when confirming order)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE NULL
    COMMENT 'Delivery date set by admin after confirming order'
  AFTER schedule_slot;

-- Add actual delivered timestamp (set when admin verifies OTP)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL
    COMMENT 'Actual delivery timestamp after OTP verification'
  AFTER estimated_delivery_date;

-- Add flag to track if delivery OTP was verified
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS otp_verified TINYINT(1) DEFAULT 0
    COMMENT '1 = delivery OTP was verified by admin'
  AFTER delivered_at;

-- Verify the changes
DESCRIBE orders;