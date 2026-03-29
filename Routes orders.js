// routes/orders.js
'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { sendOrderConfirmation, sendNewOrderAlertToAdmins, sendDeliveryDateEmail, sendDeliveryOTP, sendSmsOtp } = require('../mailer');
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
  if (km <= 5)  return { fee: 0,  allowed: true,  label: 'Free Delivery' };
  if (km <= 20) return { fee: 30, allowed: true,  label: '₹30 Delivery Fee' };
  return               { fee: 0,  allowed: false, label: 'Outside delivery zone (>20 km)' };
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

// POST /api/orders  — place new order
router.post('/', authMiddleware, async (req, res) => {
  const { delivery_address, delivery_lat, delivery_lng,
          payment_method, offer_code, schedule_date, schedule_slot, notes } = req.body;
  if (!delivery_address || !payment_method) {
    res.status(400).json({ error: 'delivery_address and payment_method required' }); return;
  }
  if (!['cod', 'upi'].includes(payment_method)) {
    res.status(400).json({ error: 'payment_method must be cod or upi' }); return;
  }
  try {
    const [cart] = await pool.query(
      `SELECT c.qty, p.id as product_id, p.name, p.price, p.unit, p.payment_methods
       FROM cart_items c JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND p.is_active = 1`,
      [req.user.id]
    );
    if (cart.length === 0) { res.status(400).json({ error: 'Cart is empty' }); return; }

    // Validate payment method is available for all products
    for (const item of cart) {
      const paymentMethods = JSON.parse(item.payment_methods || '["cod","upi"]');
      if (!paymentMethods.includes(payment_method)) {
        res.status(400).json({ 
          error: `Payment method '${payment_method}' not available for product '${item.name}'. Available: ${paymentMethods.join(', ')}` 
        }); 
        return;
      }
    }

    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

    let km = null, fee = 0;
    if (delivery_lat && delivery_lng) {
      const sLat = parseFloat(process.env.STORE_LAT || '11.0168');
      const sLng = parseFloat(process.env.STORE_LNG || '76.9558');
      km = distKm(sLat, sLng, delivery_lat, delivery_lng);
      const info = deliveryInfo(km);
      if (!info.allowed) { res.status(400).json({ error: 'Delivery not available beyond 20 km' }); return; }
      fee = info.fee;
    }

    let discount = 0;
    if (offer_code) {
      const [ofr] = await pool.query(
        'SELECT * FROM offer_codes WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at >= CURDATE())',
        [offer_code.toUpperCase()]
      );
      if (ofr.length > 0 && subtotal >= ofr[0].min_order) {
        const discountType = ofr[0].discount_type || 'fixed';
        if (discountType === 'percentage') {
          discount = Math.round((subtotal * ofr[0].discount_value) / 100 * 100) / 100;
        } else {
          discount = parseFloat(ofr[0].discount_value || ofr[0].discount_amt);
        }
      }
    }

    const total = Math.max(0, subtotal + fee - discount);
    const ordId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const otp   = String(Math.floor(1000 + Math.random() * 9000));

    await pool.query(
      `INSERT INTO orders
        (id, user_id, delivery_address, delivery_lat, delivery_lng, distance_km,
         subtotal, delivery_fee, discount, total_amount, payment_method,
         payment_status, status, delivery_otp, schedule_date, schedule_slot, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ordId, req.user.id, delivery_address,
       delivery_lat || null, delivery_lng || null,
       km ? parseFloat(km.toFixed(2)) : null,
       subtotal, fee, discount, total,
       payment_method,
       payment_method === 'cod' ? 'pending' : 'paid',
       'pending', otp,
       schedule_date || null, schedule_slot || null, notes || null]
    );

    if (cart.length > 0) {
      const vals = cart.map(i => [ordId, i.product_id, i.name, i.unit, i.price, i.qty]);
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, name, unit, price, qty) VALUES ?',
        [vals]
      );
    }

    await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Order placed: ${ordId} by ${req.user.name}`, req.user.email]);

    const orderData = {
      id: ordId, delivery_address,
      total_amount: total, delivery_fee: fee, discount,
      distance_km: km ? parseFloat(km.toFixed(2)) : null,
      payment_method, delivery_otp: otp
    };

    sendOrderConfirmation(req.user.email, orderData, cart, req.user).catch(() => {});

    // Send delivery OTP via SMS if phone is available
    if (req.user.phone) {
      sendSmsOtp(req.user.phone, otp, ordId).catch(() => {});
    }

    // Notify all admin emails
    try {
      const [admins] = await pool.query("SELECT email FROM users WHERE role = 'admin'");
      const adminEmails = admins.map(a => a.email).filter(Boolean);
      if (adminEmails.length > 0)
        sendNewOrderAlertToAdmins(adminEmails, orderData, cart, req.user.name).catch(() => {});
    } catch (_) {}

    res.status(201).json({
      message: 'Order placed', orderId: ordId, deliveryOtp: otp,
      totalAmount: total, deliveryFee: fee, discount,
    });
  } catch (err) {
    console.error('place order:', err.message);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// GET /api/orders/my
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    for (const o of orders) {
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      o.items = items;
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/all — admin
router.get('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC LIMIT 200`
    );
    // Add Google Maps link for each order that has coordinates
    rows.forEach(o => {
      if (o.delivery_lat && o.delivery_lng) {
        o.google_maps_url = `https://www.google.com/maps/search/?api=1&query=${o.delivery_lat},${o.delivery_lng}`;
      }
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// PATCH /api/orders/:id/status — admin: change status
router.patch('/:id/status', authMiddleware, adminOnly, async (req, res) => {
  const valid = ['pending','confirmed','out_for_delivery','delivered','cancelled'];
  const { status } = req.body;
  if (!valid.includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }

  // Block setting delivered directly — must go through OTP verify
  if (status === 'delivered') {
    res.status(400).json({ error: 'Use the OTP verification endpoint to mark as delivered' });
    return;
  }

  try {
    const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (order.length === 0) { res.status(404).json({ error: 'Order not found' }); return; }

    await pool.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, req.params.id]);
    
    // If status is out_for_delivery, generate new OTP and send email/SMS
    if (status === 'out_for_delivery') {
      const newOtp = String(Math.floor(1000 + Math.random() * 9000));
      await pool.query(
        'UPDATE orders SET delivery_otp = ?, delivery_otp_generated_at = NOW() WHERE id = ?',
        [newOtp, req.params.id]
      );
      const [userInfo] = await pool.query('SELECT email, name, phone FROM users WHERE id = ?', [order[0].user_id]);
      if (userInfo.length > 0) {
        const u = userInfo[0];
        sendDeliveryOTP(u.email, u.name, req.params.id, newOtp).catch(() => {});
        if (u.phone) {
          sendSmsOtp(u.phone, newOtp, req.params.id).catch(() => {});
        }
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

// PATCH /api/orders/:id/delivery-date — admin: set estimated delivery date
router.patch('/:id/delivery-date', authMiddleware, adminOnly, async (req, res) => {
  const { estimated_delivery_date } = req.body;
  if (!estimated_delivery_date) {
    res.status(400).json({ error: 'estimated_delivery_date required (YYYY-MM-DD)' }); return;
  }
  try {
    // Get order + customer info
    const [rows] = await pool.query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Order not found' }); return; }
    const order = rows[0];

    // Update delivery date + confirm the order
    await pool.query(
      `UPDATE orders
         SET estimated_delivery_date = ?, status = 'confirmed', updated_at = NOW()
       WHERE id = ?`,
      [estimated_delivery_date, req.params.id]
    );
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Delivery date set for ${req.params.id}: ${estimated_delivery_date}`, req.user.email]);

    // Email the customer with their delivery date
    sendDeliveryDateEmail(
      order.customer_email,
      order.customer_name,
      req.params.id,
      estimated_delivery_date,
      order.delivery_address
    ).catch(() => {});

    res.json({ message: 'Delivery date set and customer notified', estimated_delivery_date });
  } catch (err) {
    console.error('delivery-date error:', err.message);
    res.status(500).json({ error: 'Failed to set delivery date' });
  }
});

// POST /api/orders/:id/verify-otp — admin: verify delivery OTP → mark delivered
router.post('/:id/verify-otp', authMiddleware, adminOnly, async (req, res) => {
  const { otp } = req.body;
  if (!otp) { res.status(400).json({ error: 'OTP is required' }); return; }

  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Order not found' }); return; }
    const order = rows[0];

    if (order.status === 'delivered') {
      res.status(400).json({ error: 'Order already delivered' }); return;
    }
    
    // Allow OTP verification even if not in out_for_delivery status
    if (String(order.delivery_otp).trim() !== String(otp).trim()) {
      res.status(400).json({ error: 'Incorrect OTP. Please check with the customer.' }); return;
    }

    // OTP correct — mark delivered
    await pool.query(
      `UPDATE orders
         SET status = 'delivered', otp_verified = 1, delivered_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [req.params.id]
    );
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Order ${req.params.id} delivered (OTP verified)`, req.user.email]);

    res.json({ message: 'OTP verified. Order marked as Delivered!', orderId: req.params.id });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// POST /api/orders/:id/send-otp-phone
router.post('/:id/send-otp-phone', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.delivery_otp, u.phone, u.name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Order not found' }); return; }
    const order = rows[0];
    if (!order.phone) { res.status(400).json({ error: 'Customer does not have a phone number on record' }); return; }

    await sendSmsOtp(order.phone, order.delivery_otp, req.params.id);
    res.json({ message: 'OTP sent to customer phone number' });
  } catch (err) {
    console.error('send-otp-phone error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP by phone' });
  }
});

// GET /api/orders/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Order not found' }); return; }
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);

    const order = rows[0];
    // Add Google Maps link if coordinates available
    if (order.delivery_lat && order.delivery_lng) {
      order.google_maps_url = `https://www.google.com/maps/search/?api=1&query=${order.delivery_lat},${order.delivery_lng}`;
    }

    res.json({ ...order, items });
  } catch (err) {
    console.error('get order error:', err.message);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

module.exports = router;