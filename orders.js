// routes/orders.js
'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendOrderConfirmation, sendNewOrderAlertToAdmins, sendDeliveryDateEmail, sendDeliveryOTP } = require('../mailer');
require('dotenv').config();

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function deliveryInfo(km) {
  const freeKm = parseFloat(process.env.FREE_KM || '5');
  const maxKm  = parseFloat(process.env.PAID_KM || '20');
  const fee    = parseFloat(process.env.DELIVERY_FEE || '30');
  if (km <= freeKm) return { fee: 0,   allowed: true,  label: 'Free Delivery' };
  if (km <= maxKm)  return { fee: fee,  allowed: true,  label: `₹${fee} Delivery Fee` };
  return                    { fee: 0,   allowed: false, label: `Outside delivery zone (>${maxKm} km)` };
}

// POST /api/orders/check-delivery
router.post('/check-delivery', authMiddleware, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) { res.status(400).json({ error: 'lat and lng required' }); return; }
  const storeLat = parseFloat(process.env.STORE_LAT || '11.0168');
  const storeLng = parseFloat(process.env.STORE_LNG || '76.9558');
  const km = distKm(storeLat, storeLng, lat, lng);
  const info = deliveryInfo(km);
  res.json({ distanceKm: parseFloat(km.toFixed(2)), ...info, storeLat, storeLng });
});

// ─── SPECIAL ORDER REQUESTS ──────────────────────────────────────
// POST /api/orders/special-request  — user requests a special order product
router.post('/special-request', authMiddleware, async (req, res) => {
  const { product_id, qty, notes } = req.body;
  if (!product_id) { res.status(400).json({ error: 'product_id required' }); return; }
  try {
    const [prod] = await pool.query('SELECT name, requires_approval FROM products WHERE id = ?', [product_id]);
    if (!prod.length) { res.status(404).json({ error: 'Product not found' }); return; }
    if (!prod[0].requires_approval) { res.status(400).json({ error: 'This product does not require approval' }); return; }
    await pool.query(
      'INSERT INTO special_order_requests (user_id, product_id, qty, notes) VALUES (?,?,?,?)',
      [req.user.id, product_id, qty || 1, notes || '']
    );
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Special order request for ${prod[0].name} by ${req.user.name}`, req.user.email]);
    res.status(201).json({ message: 'Special order request sent! Admin will review shortly.' });
  } catch (err) {
    console.error('special request error:', err.message);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// GET /api/orders/special-requests/my
router.get('/special-requests/my', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sr.*, p.name as product_name, p.price, p.image_path
       FROM special_order_requests sr JOIN products p ON sr.product_id = p.id
       WHERE sr.user_id = ? ORDER BY sr.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch requests' }); }
});

// POST /api/orders  — place new order
router.post('/', authMiddleware, async (req, res) => {
  const { delivery_address, delivery_lat, delivery_lng,
          payment_method, offer_code, notes, address_id } = req.body;
  if (!delivery_address || !payment_method) {
    res.status(400).json({ error: 'delivery_address and payment_method required' }); return;
  }
  if (!['cod', 'upi'].includes(payment_method)) {
    res.status(400).json({ error: 'payment_method must be cod or upi' }); return;
  }
  try {
    const [cart] = await pool.query(
      `SELECT c.qty, p.id as product_id, p.name, p.price, p.unit, p.payment_methods, p.requires_approval
       FROM cart_items c JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND p.is_active = 1`,
      [req.user.id]
    );
    if (cart.length === 0) { res.status(400).json({ error: 'Cart is empty' }); return; }

    // Block if any product requires approval
    const approvalNeeded = cart.filter(i => i.requires_approval);
    if (approvalNeeded.length > 0) {
      res.status(400).json({
        error: `"${approvalNeeded[0].name}" requires admin approval. Please submit a special order request first.`
      }); return;
    }

    // Validate payment method per product
    for (const item of cart) {
      const methods = JSON.parse(item.payment_methods || '["cod","upi"]');
      if (!methods.includes(payment_method)) {
        res.status(400).json({
          error: `'${payment_method}' not available for "${item.name}". Available: ${methods.join(', ')}`
        }); return;
      }
    }

    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

    let km = null, fee = 0;
    if (delivery_lat && delivery_lng) {
      const sLat = parseFloat(process.env.STORE_LAT || '11.0168');
      const sLng = parseFloat(process.env.STORE_LNG || '76.9558');
      km = distKm(sLat, sLng, delivery_lat, delivery_lng);
      const info = deliveryInfo(km);
      if (!info.allowed) { res.status(400).json({ error: 'Delivery not available for this distance' }); return; }
      fee = info.fee;
    }

    // Apply discount/coupon
    let discount = 0;
    if (offer_code) {
      const [ofr] = await pool.query(
        `SELECT * FROM offer_codes WHERE code = ? AND is_active = 1 
         AND promo_type = 'coupon'
         AND (expires_at IS NULL OR expires_at >= CURDATE())`,
        [offer_code.toUpperCase()]
      );
      if (ofr.length > 0 && subtotal >= ofr[0].min_order) {
        const dt = ofr[0].discount_type || 'fixed';
        discount = dt === 'percentage'
          ? Math.round((subtotal * ofr[0].discount_value) / 100 * 100) / 100
          : parseFloat(ofr[0].discount_value || ofr[0].discount_amt);
      }
    }

    // Also apply best auto-discount (no code needed)
    const [autoDiscs] = await pool.query(
      `SELECT * FROM offer_codes WHERE promo_type = 'discount' AND is_active = 1
       AND (expires_at IS NULL OR expires_at >= CURDATE()) AND min_order <= ?
       ORDER BY discount_value DESC LIMIT 1`,
      [subtotal]
    );
    if (autoDiscs.length > 0) {
      const ad = autoDiscs[0];
      const autoAmt = ad.discount_type === 'percentage'
        ? Math.round((subtotal * ad.discount_value) / 100 * 100) / 100
        : parseFloat(ad.discount_value);
      if (autoAmt > discount) discount = autoAmt;
    }

    const total = Math.max(0, subtotal + fee - discount);
    const ordId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const otp   = String(Math.floor(1000 + Math.random() * 9000));

    await pool.query(
      `INSERT INTO orders
        (id, user_id, address_id, delivery_address, delivery_lat, delivery_lng, distance_km,
         subtotal, delivery_fee, discount, total_amount, payment_method,
         payment_status, status, delivery_otp, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ordId, req.user.id, address_id || null, delivery_address,
       delivery_lat || null, delivery_lng || null,
       km ? parseFloat(km.toFixed(2)) : null,
       subtotal, fee, discount, total,
       payment_method,
       payment_method === 'cod' ? 'pending' : 'pending',
       'pending', otp, notes || null]
    );

    const vals = cart.map(i => [ordId, i.product_id, i.name, i.unit, i.price, i.qty]);
    await pool.query('INSERT INTO order_items (order_id, product_id, name, unit, price, qty) VALUES ?', [vals]);

    await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Order placed: ${ordId} by ${req.user.name}`, req.user.email]);

    const orderData = {
      id: ordId, delivery_address, total_amount: total, delivery_fee: fee,
      discount, distance_km: km ? parseFloat(km.toFixed(2)) : null,
      payment_method, delivery_otp: otp
    };
    sendOrderConfirmation(req.user.email, orderData, cart, req.user).catch(() => {});

    try {
      const [admins] = await pool.query("SELECT email FROM users WHERE role = 'admin'");
      const emails = admins.map(a => a.email).filter(Boolean);
      if (emails.length) sendNewOrderAlertToAdmins(emails, orderData, cart, req.user.name).catch(() => {});
    } catch (_) {}

    res.status(201).json({
      message: 'Order placed', orderId: ordId, deliveryOtp: otp,
      totalAmount: total, deliveryFee: fee, discount
    });
  } catch (err) {
    console.error('place order:', err.message);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// GET /api/orders/my
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    for (const o of orders) {
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      o.items = items;
    }
    res.json(orders);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch orders' }); }
});

// GET /api/orders/all — admin
router.get('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC LIMIT 200`
    );
    rows.forEach(o => {
      if (o.delivery_lat && o.delivery_lng)
        o.google_maps_url = `https://www.google.com/maps/search/?api=1&query=${o.delivery_lat},${o.delivery_lng}`;
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch orders' }); }
});

// PATCH /api/orders/:id/status — admin
router.patch('/:id/status', authMiddleware, adminOnly, async (req, res) => {
  const valid = ['pending','confirmed','out_for_delivery','delivered','cancelled'];
  const { status } = req.body;
  if (!valid.includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
  if (status === 'delivered') {
    res.status(400).json({ error: 'Use OTP verification to mark delivered' }); return;
  }
  try {
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order.length) { res.status(404).json({ error: 'Order not found' }); return; }

    await pool.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);

    if (status === 'out_for_delivery') {
      const newOtp = String(Math.floor(1000 + Math.random() * 9000));
      await pool.query('UPDATE orders SET delivery_otp = ?, delivery_otp_generated_at = NOW() WHERE id = ?', [newOtp, req.params.id]);
      const [ui] = await pool.query('SELECT email, name FROM users WHERE id = ?', [order[0].user_id]);
      if (ui.length) {
        sendDeliveryOTP(ui[0].email, ui[0].name, req.params.id, newOtp).catch(() => {});
      }
    }

    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Order ${req.params.id} → ${status}`, req.user.email]);
    res.json({ message: 'Status updated' });
  } catch (err) {
    console.error('patch status error:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/orders/:id/payment-status — update payment status (for UPI callback)
router.patch('/:id/payment-status', authMiddleware, async (req, res) => {
  const { payment_status } = req.body;
  if (!['pending','paid','failed'].includes(payment_status)) {
    res.status(400).json({ error: 'Invalid payment_status' }); return;
  }
  try {
    const [order] = await pool.query('SELECT user_id FROM orders WHERE id = ?', [req.params.id]);
    if (!order.length) { res.status(404).json({ error: 'Order not found' }); return; }
    if (order[0].user_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    await pool.query('UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?',
      [payment_status, req.params.id]);
    res.json({ message: 'Payment status updated' });
  } catch (err) { res.status(500).json({ error: 'Failed to update payment status' }); }
});

// PATCH /api/orders/:id/delivery-date
router.patch('/:id/delivery-date', authMiddleware, adminOnly, async (req, res) => {
  const { estimated_delivery_date } = req.body;
  if (!estimated_delivery_date) { res.status(400).json({ error: 'estimated_delivery_date required' }); return; }
  try {
    const [rows] = await pool.query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`, [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Order not found' }); return; }
    await pool.query(
      `UPDATE orders SET estimated_delivery_date = ?, status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [estimated_delivery_date, req.params.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Delivery date set for ${req.params.id}: ${estimated_delivery_date}`, req.user.email]);
    sendDeliveryDateEmail(rows[0].customer_email, rows[0].customer_name, req.params.id, estimated_delivery_date, rows[0].delivery_address).catch(() => {});
    res.json({ message: 'Delivery date set', estimated_delivery_date });
  } catch (err) { res.status(500).json({ error: 'Failed to set delivery date' }); }
});

// POST /api/orders/:id/verify-otp
router.post('/:id/verify-otp', authMiddleware, adminOnly, async (req, res) => {
  const { otp } = req.body;
  if (!otp) { res.status(400).json({ error: 'OTP is required' }); return; }
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Order not found' }); return; }
    if (rows[0].status === 'delivered') { res.status(400).json({ error: 'Already delivered' }); return; }
    if (String(rows[0].delivery_otp).trim() !== String(otp).trim()) {
      res.status(400).json({ error: 'Incorrect OTP' }); return;
    }
    await pool.query(
      `UPDATE orders SET status = 'delivered', otp_verified = 1, delivered_at = NOW(), 
       payment_status = 'paid', updated_at = NOW() WHERE id = ?`, [req.params.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Order ${req.params.id} delivered (OTP verified)`, req.user.email]);
    res.json({ message: 'Order delivered!', orderId: req.params.id });
  } catch (err) { res.status(500).json({ error: 'Failed to verify OTP' }); }
});

// POST /api/orders/:id/send-otp — admin: resend delivery OTP to customer email
router.post('/:id/send-otp', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.delivery_otp, u.email, u.name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`, [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Order not found' }); return; }
    if (!rows[0].email) { res.status(400).json({ error: 'No email address' }); return; }
    await sendDeliveryOTP(rows[0].email, rows[0].name, req.params.id, rows[0].delivery_otp);
    res.json({ message: `OTP sent to ${rows[0].email}` });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP email' });
  }
});

// GET /api/orders/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`, [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Order not found' }); return; }
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
    const order = rows[0];
    if (order.delivery_lat && order.delivery_lng)
      order.google_maps_url = `https://www.google.com/maps/search/?api=1&query=${order.delivery_lat},${order.delivery_lng}`;
    res.json({ ...order, items });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch order' }); }
});

module.exports = router;