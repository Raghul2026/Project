-- ================================================================
--  SS Milk – Migration Script for Existing Database
--  Run this if your database already has the old schema
--  Command: mysql -u root -p ssmilk_db < migration_v2.sql
-- ================================================================

USE ssmilk_db;

-- 1. Add requires_approval to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_approval TINYINT(1) DEFAULT 0 AFTER is_active;

-- 2. Add estimated_delivery_date to orders if missing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE AFTER delivery_person_phone;

-- 3. Add promo_type to offer_codes
ALTER TABLE offer_codes ADD COLUMN IF NOT EXISTS promo_type ENUM('discount','coupon') DEFAULT 'coupon' AFTER id;

-- 4. Allow NULL code for discounts (no code needed)
ALTER TABLE offer_codes MODIFY COLUMN code VARCHAR(30) NULL;

-- 5. Create special_order_requests table
CREATE TABLE IF NOT EXISTS special_order_requests (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  product_id  INT          NOT NULL,
  qty         INT          DEFAULT 1,
  notes       TEXT,
  status      ENUM('pending','approved','rejected') DEFAULT 'pending',
  admin_notes TEXT,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 6. Create contact_messages table
CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120)  NOT NULL,
  email      VARCHAR(180)  NOT NULL,
  phone      VARCHAR(20),
  subject    VARCHAR(200),
  message    TEXT          NOT NULL,
  is_read    TINYINT(1)    DEFAULT 0,
  created_at DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- 7. Update existing offers to be coupons
UPDATE offer_codes SET promo_type = 'coupon' WHERE promo_type IS NULL AND code IS NOT NULL;

SELECT 'Migration complete!' AS status;