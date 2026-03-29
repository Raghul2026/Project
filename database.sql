-- ================================================================
--  SS Milk – Full MySQL Database Schema (UPDATED)
--  Run: mysql -u root -p < database_update.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS ssmilk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ssmilk_db;

-- ────────────────────────────────────────────────────────────────
-- 1. USERS TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(180)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  phone         VARCHAR(20),
  role          ENUM('customer','admin') DEFAULT 'customer',
  is_verified   TINYINT(1)    DEFAULT 0,
  is_active     TINYINT(1)    DEFAULT 1,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────────
-- 2. EMAIL OTP TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_otps (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(180) NOT NULL,
  otp        VARCHAR(10)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  used       TINYINT(1)   DEFAULT 0,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email)
);

-- ────────────────────────────────────────────────────────────────
-- 3. PRODUCTS TABLE  (added requires_approval for special orders)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(150)    NOT NULL,
  category          VARCHAR(80)     NOT NULL,
  price             DECIMAL(10,2)   NOT NULL,
  unit              VARCHAR(50)     NOT NULL,
  description       TEXT,
  image_path        VARCHAR(500),
  stock_qty         INT             DEFAULT 100,
  stock_max         INT             DEFAULT 200,
  is_active         TINYINT(1)      DEFAULT 1,
  requires_approval TINYINT(1)      DEFAULT 0,
  payment_methods   JSON            NULL,
  created_at        DATETIME        DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Migration: add requires_approval if table already exists
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_approval TINYINT(1) DEFAULT 0 AFTER is_active;

-- Seed default products
INSERT INTO products (name, category, price, unit, description, image_path, stock_qty, stock_max) VALUES
('Full Cream Milk',    'Milk',   36.00, '500ml', 'Rich, creamy full-fat milk from fresh cow farms.',      'images/full_cream_milk.png',   180, 200),
('Pot Curd',           'Curd',   45.00, '250g',  'Set curd in traditional clay pot — thick and tangy.',  'images/pot_curd.png',          90,  150),
('Paneer Cubes',       'Paneer', 50.00, '200g',  'Soft, fresh paneer made from whole cow milk.',          'images/paneer_cubes.png',      70,  100)
ON DUPLICATE KEY UPDATE name=name;

-- ────────────────────────────────────────────────────────────────
-- 4. USER ADDRESSES TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_addresses (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  label       VARCHAR(50)  DEFAULT 'Home',
  full_address TEXT        NOT NULL,
  city        VARCHAR(100),
  pincode     VARCHAR(20),
  latitude    DECIMAL(10,7),
  longitude   DECIMAL(10,7),
  is_default  TINYINT(1)   DEFAULT 0,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────
-- 5. CART TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  product_id  INT NOT NULL,
  qty         INT NOT NULL DEFAULT 1,
  added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_product (user_id, product_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────
-- 6. ORDERS TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                        VARCHAR(30)   PRIMARY KEY,
  user_id                   INT           NOT NULL,
  address_id                INT,
  delivery_address          TEXT          NOT NULL,
  delivery_lat              DECIMAL(10,7),
  delivery_lng              DECIMAL(10,7),
  distance_km               DECIMAL(6,2),
  subtotal                  DECIMAL(10,2) NOT NULL,
  delivery_fee              DECIMAL(10,2) DEFAULT 0,
  discount                  DECIMAL(10,2) DEFAULT 0,
  total_amount              DECIMAL(10,2) NOT NULL,
  payment_method            VARCHAR(50),
  payment_status            ENUM('pending','paid','failed') DEFAULT 'pending',
  status                    ENUM('pending','confirmed','out_for_delivery','delivered','cancelled') DEFAULT 'pending',
  delivery_otp              VARCHAR(10),
  delivery_otp_generated_at DATETIME,
  otp_verified              TINYINT(1)    DEFAULT 0,
  delivered_at              DATETIME,
  delivery_person_name      VARCHAR(120),
  delivery_person_phone     VARCHAR(20),
  estimated_delivery_date   DATE,
  schedule_date             DATE,
  schedule_slot             VARCHAR(50),
  notes                     TEXT,
  created_at                DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Migration: add estimated_delivery_date if missing
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE AFTER delivery_person_phone;

-- ────────────────────────────────────────────────────────────────
-- 7. ORDER ITEMS TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    VARCHAR(30)   NOT NULL,
  product_id  INT,
  name        VARCHAR(150)  NOT NULL,
  unit        VARCHAR(50),
  price       DECIMAL(10,2) NOT NULL,
  qty         INT           NOT NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────────
-- 8. OFFER CODES TABLE  (updated: promo_type separates discount vs coupon)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offer_codes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  promo_type     ENUM('discount','coupon') DEFAULT 'coupon',
  code           VARCHAR(30)   NULL UNIQUE,
  discount_type  ENUM('fixed','percentage') DEFAULT 'fixed',
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_amt   DECIMAL(10,2) DEFAULT 0,
  min_order      DECIMAL(10,2) DEFAULT 0,
  is_active      TINYINT(1)    DEFAULT 1,
  expires_at     DATE,
  created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- Migration: add promo_type if table exists
-- ALTER TABLE offer_codes ADD COLUMN IF NOT EXISTS promo_type ENUM('discount','coupon') DEFAULT 'coupon' AFTER id;
-- ALTER TABLE offer_codes MODIFY COLUMN code VARCHAR(30) NULL;

INSERT INTO offer_codes (promo_type, code, discount_type, discount_value, discount_amt, min_order) VALUES
('coupon',   'FEST10',   'fixed',      20.00, 20.00, 50.00),
('coupon',   'WELCOME',  'fixed',      30.00, 30.00, 100.00),
('discount', NULL,       'percentage', 10.00, 0,     200.00)
ON DUPLICATE KEY UPDATE code=code;

-- ────────────────────────────────────────────────────────────────
-- 9. SPECIAL ORDER REQUESTS  (new table for approval-based products)
-- ────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────
-- 10. CONTACT MESSAGES  (new table for contact form)
-- ────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────
-- 11. ACTIVITY LOG TABLE
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  action      VARCHAR(255) NOT NULL,
  performed_by VARCHAR(120),
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_status_user ON orders(status, user_id);
CREATE INDEX IF NOT EXISTS idx_offer_codes_active ON offer_codes(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_special_orders_status ON special_order_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_read ON contact_messages(is_read);