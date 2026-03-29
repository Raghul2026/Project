// routes/admin.js
'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

async function hasColumn(table, column) {
  try {
    const dbName = process.env.DB_NAME || 'ssmilk_db';
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [dbName, table, column]);
    return rows[0]?.cnt > 0;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════════════
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [[{ totalOrders }]]   = await pool.query('SELECT COUNT(*) as totalOrders FROM orders');
    const [[{ totalRevenue }]]  = await pool.query("SELECT IFNULL(SUM(total_amount),0) as totalRevenue FROM orders WHERE status != 'cancelled'");
    const hasActive = await hasColumn('users', 'is_active');
    const uSql = hasActive
      ? "SELECT COUNT(*) as totalUsers FROM users WHERE role='customer' AND is_active=1"
      : "SELECT COUNT(*) as totalUsers FROM users WHERE role='customer'";
    const [[{ totalUsers }]]    = await pool.query(uSql);
    const [[{ pendingOrders }]] = await pool.query("SELECT COUNT(*) as pendingOrders FROM orders WHERE status='pending'");
    const [[{ delivered }]]     = await pool.query("SELECT COUNT(*) as delivered FROM orders WHERE status='delivered'");
    const [[{ cancelled }]]     = await pool.query("SELECT COUNT(*) as cancelled FROM orders WHERE status='cancelled'");
    const [weeklyRevenue]       = await pool.query(
      `SELECT DATE(created_at) as day, IFNULL(SUM(total_amount),0) as revenue
       FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status != 'cancelled'
       GROUP BY DATE(created_at) ORDER BY day ASC`);
    // Count pending special requests
    let pendingSpecial = 0;
    try {
      const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM special_order_requests WHERE status='pending'");
      pendingSpecial = cnt;
    } catch(_) {}
    res.json({ totalOrders, totalRevenue, totalUsers, pendingOrders, delivered, cancelled, weeklyRevenue, pendingSpecial });
  } catch (err) {
    console.error('admin stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ACTIVITY
// ═══════════════════════════════════════════════════════════════════
router.get('/activity', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 30');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch activity' }); }
});

// ═══════════════════════════════════════════════════════════════════
//  MEMBERS
// ═══════════════════════════════════════════════════════════════════
router.get('/members', authMiddleware, adminOnly, async (req, res) => {
  try {
    const inclActive = await hasColumn('users', 'is_active');
    const fields = ['id', 'name', 'email', 'phone', 'role', 'is_verified', 'created_at'];
    if (inclActive) fields.splice(6, 0, 'is_active');
    const [rows] = await pool.query(`SELECT ${fields.join(', ')} FROM users ORDER BY created_at DESC`);
    res.json(rows || []);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch members' }); }
});

router.patch('/members/:id/role', authMiddleware, adminOnly, async (req, res) => {
  const { role } = req.body;
  if (!['customer','admin'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }
  try {
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Changed role for user ${req.params.id} to ${role}`, req.user.email]);
    res.json({ message: 'Role updated' });
  } catch (err) { res.status(500).json({ error: 'Failed to update role' }); }
});

router.patch('/members/:id/deactivate', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT name, role FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'User not found' }); return; }
    if (rows[0].role === 'admin') { res.status(400).json({ error: 'Cannot deactivate admin' }); return; }
    await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Deactivated: ${rows[0].name}`, req.user.email]);
    res.json({ message: 'Member deactivated' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.patch('/members/:id/activate', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_active = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Member re-activated' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/members/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Member deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════════════════════
//  OFFERS  (now handles both discounts and coupons)
// ═══════════════════════════════════════════════════════════════════
router.get('/offers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const hasPromoType = await hasColumn('offer_codes', 'promo_type');
    const [rows] = await pool.query(
      `SELECT id, ${hasPromoType ? 'promo_type,' : ''} code, discount_type, discount_value, min_order, is_active, expires_at, created_at
       FROM offer_codes ORDER BY created_at DESC`);
    const offers = rows.map(o => ({
      ...o,
      promo_type: o.promo_type || 'coupon',
      discount_type: o.discount_type || 'fixed'
    }));
    res.json(offers);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch offers' }); }
});

// GET active coupons for public display (only coupons with codes)
router.get('/offers/active', async (req, res) => {
  try {
    const hasPromoType = await hasColumn('offer_codes', 'promo_type');
    const promoFilter = hasPromoType ? "AND promo_type = 'coupon'" : "";
    const [rows] = await pool.query(
      `SELECT code, discount_type, discount_value, min_order FROM offer_codes
       WHERE is_active = 1 AND discount_value > 0 AND code IS NOT NULL
       ${promoFilter}
       AND (expires_at IS NULL OR expires_at >= CURDATE())
       ORDER BY discount_value DESC`);
    const offers = rows.map(o => ({
      code: o.code,
      discount_type: o.discount_type || 'fixed',
      discount_value: o.discount_value,
      display_value: o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `₹${o.discount_value} OFF`,
      min_order: o.min_order
    }));
    res.json(offers);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /api/admin/offers  — create discount or coupon
router.post('/offers', authMiddleware, adminOnly, async (req, res) => {
  const { promo_type, code, discount_type, discount_value, min_order, expires_at } = req.body;
  if (!discount_value) { res.status(400).json({ error: 'discount_value required' }); return; }
  const type = promo_type || 'coupon';
  // Coupons need a code, discounts don't
  if (type === 'coupon' && !code) { res.status(400).json({ error: 'Coupon code is required' }); return; }
  try {
    const hasPromoType = await hasColumn('offer_codes', 'promo_type');
    if (hasPromoType) {
      await pool.query(
        'INSERT INTO offer_codes (promo_type, code, discount_type, discount_value, min_order, expires_at) VALUES (?,?,?,?,?,?)',
        [type, type === 'coupon' ? code.toUpperCase() : null, discount_type || 'fixed', discount_value, min_order || 0, expires_at || null]);
    } else {
      await pool.query(
        'INSERT INTO offer_codes (code, discount_type, discount_value, min_order, expires_at) VALUES (?,?,?,?,?)',
        [code ? code.toUpperCase() : null, discount_type || 'fixed', discount_value, min_order || 0, expires_at || null]);
    }
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Created ${type}: ${code || 'auto-discount'} (${discount_value})`, req.user.email]);
    res.status(201).json({ message: `${type} created` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') { res.status(409).json({ error: 'Code already exists' }); return; }
    res.status(500).json({ error: 'Failed to create' });
  }
});

router.delete('/offers/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM offer_codes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /api/admin/validate-offer  — validate a coupon code
router.post('/validate-offer', async (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) { res.status(400).json({ error: 'code required' }); return; }
  try {
    const [rows] = await pool.query(
      `SELECT * FROM offer_codes WHERE code = ? AND is_active = 1 AND discount_value > 0
       AND (expires_at IS NULL OR expires_at >= CURDATE())`,
      [code.toUpperCase()]);
    if (!rows.length) { res.status(404).json({ error: 'Invalid or expired code' }); return; }
    const offer = rows[0];
    let discount_amt = 0;
    const st = subtotal || 0;
    if (st >= offer.min_order) {
      discount_amt = offer.discount_type === 'percentage'
        ? Math.round((st * offer.discount_value) / 100 * 100) / 100
        : parseFloat(offer.discount_value);
    }
    res.json({
      valid: true, discount_amt, discount_type: offer.discount_type || 'fixed',
      discount_value: offer.discount_value, min_order: offer.min_order,
      message: `${offer.discount_type === 'percentage' ? offer.discount_value + '%' : '₹' + offer.discount_value} discount applied`
    });
  } catch (err) { res.status(500).json({ error: 'Failed to validate' }); }
});

// ═══════════════════════════════════════════════════════════════════
//  SPECIAL ORDER REQUESTS  (admin side)
// ═══════════════════════════════════════════════════════════════════
router.get('/special-requests', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sr.*, p.name as product_name, p.price, p.image_path,
              u.name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM special_order_requests sr
       JOIN products p ON sr.product_id = p.id
       JOIN users u ON sr.user_id = u.id
       ORDER BY sr.created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch requests' }); }
});

router.patch('/special-requests/:id', authMiddleware, adminOnly, async (req, res) => {
  const { status, admin_notes } = req.body;
  if (!['approved','rejected'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
  try {
    await pool.query('UPDATE special_order_requests SET status = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?',
      [status, admin_notes || '', req.params.id]);
    // If approved, add product to user's cart
    if (status === 'approved') {
      const [sr] = await pool.query('SELECT user_id, product_id, qty FROM special_order_requests WHERE id = ?', [req.params.id]);
      if (sr.length) {
        await pool.query(
          'INSERT INTO cart_items (user_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)',
          [sr[0].user_id, sr[0].product_id, sr[0].qty]);
      }
    }
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Special request ${req.params.id} ${status}`, req.user.email]);
    res.json({ message: `Request ${status}` });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════════════════════
//  CONTACT MESSAGES  (admin side)
// ═══════════════════════════════════════════════════════════════════
router.get('/contact-messages', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// ═══════════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════════
router.get('/settings', authMiddleware, adminOnly, async (req, res) => {
  res.json({
    store_name:       process.env.MERCHANT_NAME  || 'SS Milk',
    upi_id:           process.env.UPI_ID         || 'ssmilk@upi',
    store_lat:        process.env.STORE_LAT      || '11.0168',
    store_lng:        process.env.STORE_LNG      || '76.9558',
    store_address:    process.env.STORE_ADDRESS   || '123 Dairy Road, Coimbatore',
    store_phone:      process.env.STORE_PHONE     || '+91-1234567890',
    free_delivery_km: process.env.FREE_KM         || '5',
    paid_delivery_km: process.env.PAID_KM         || '20',
    delivery_fee:     process.env.DELIVERY_FEE    || '30',
  });
});

router.put('/settings', authMiddleware, adminOnly, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { store_name, upi_id, store_lat, store_lng, store_address, store_phone,
          free_delivery_km, paid_delivery_km, delivery_fee } = req.body;
  try {
    const map = {
      MERCHANT_NAME: store_name, UPI_ID: upi_id,
      STORE_LAT: store_lat, STORE_LNG: store_lng,
      STORE_ADDRESS: store_address, STORE_PHONE: store_phone,
      FREE_KM: free_delivery_km, PAID_KM: paid_delivery_km, DELIVERY_FEE: delivery_fee
    };

    // Update process.env in memory
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined && v !== null && v !== '') process.env[k] = String(v);
    }

    // Try writing .env file
    try {
      const envPath = path.join(__dirname, '..', '.env');
      let env = '';
      try { env = fs.readFileSync(envPath, 'utf8'); } catch(_) {}
      function setVar(c, k, v) {
        if (v === undefined || v === null || v === '') return c;
        const re = new RegExp(`^${k}=.*$`, 'm');
        return re.test(c) ? c.replace(re, `${k}=${v}`) : c + (c.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`;
      }
      for (const [k, v] of Object.entries(map)) { env = setVar(env, k, v); }
      fs.writeFileSync(envPath, env, 'utf8');
    } catch(_) {}

    // Log activity (don't fail if table missing)
    try { await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)', ['Settings updated', req.user.email]); } catch(_) {}

    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    console.error('save settings:', err.message);
    res.status(500).json({ error: 'Failed to save: ' + err.message });
  }
});

module.exports = router;