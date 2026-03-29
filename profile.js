// routes/profile.js
'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, role, is_verified, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    const [addr] = await pool.query(
      'SELECT * FROM user_addresses WHERE user_id = ? AND is_default = 1 LIMIT 1', [req.user.id]);
    res.json({ ...rows[0], defaultAddress: addr[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profile
router.put('/', authMiddleware, async (req, res) => {
  const { name, phone } = req.body;
  try {
    await pool.query('UPDATE users SET name = ?, phone = ? WHERE id = ?',
      [name, phone, req.user.id]);
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/profile/addresses
router.get('/addresses', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

// POST /api/profile/addresses
router.post('/addresses', authMiddleware, async (req, res) => {
  const { label, full_address, city, pincode, latitude, longitude, is_default } = req.body;
  if (!full_address) { res.status(400).json({ error: 'full_address required' }); return; }
  try {
    if (is_default)
      await pool.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    const [r] = await pool.query(
      'INSERT INTO user_addresses (user_id, label, full_address, city, pincode, latitude, longitude, is_default) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, label||'Home', full_address, city||'', pincode||'', latitude||null, longitude||null, is_default?1:0]
    );
    res.status(201).json({ message: 'Address saved', id: r.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save address' });
  }
});

// PUT /api/profile/addresses/:id
router.put('/addresses/:id', authMiddleware, async (req, res) => {
  const { label, full_address, city, pincode, latitude, longitude, is_default } = req.body;
  try {
    if (is_default)
      await pool.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    await pool.query(
      'UPDATE user_addresses SET label=?,full_address=?,city=?,pincode=?,latitude=?,longitude=?,is_default=? WHERE id=? AND user_id=?',
      [label, full_address, city, pincode, latitude, longitude, is_default?1:0, req.params.id, req.user.id]
    );
    res.json({ message: 'Address updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update address' });
  }
});

// DELETE /api/profile/addresses/:id
router.delete('/addresses/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]);
    res.json({ message: 'Address deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

module.exports = router;