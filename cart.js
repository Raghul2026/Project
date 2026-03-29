// routes/cart.js
'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/cart
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.qty, p.id as product_id, p.name, p.price, p.unit, p.image_path, p.category
       FROM cart_items c JOIN products p ON c.product_id = p.id
       WHERE c.user_id = ? AND p.is_active = 1 ORDER BY c.added_at`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart
router.post('/', authMiddleware, async (req, res) => {
  const { product_id, qty = 1 } = req.body;
  if (!product_id) { res.status(400).json({ error: 'product_id required' }); return; }
  try {
    const [prod] = await pool.query('SELECT id FROM products WHERE id = ? AND is_active = 1', [product_id]);
    if (prod.length === 0) { res.status(404).json({ error: 'Product not found' }); return; }
    await pool.query(
      'INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)',
      [req.user.id, product_id, qty]
    );
    res.json({ message: 'Added to cart' });
  } catch (err) {
    console.error('cart add:', err.message);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// PUT /api/cart/:product_id
router.put('/:product_id', authMiddleware, async (req, res) => {
  const { qty } = req.body;
  if (qty <= 0) {
    await pool.query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?',
      [req.user.id, req.params.product_id]);
    res.json({ message: 'Item removed' }); return;
  }
  try {
    await pool.query('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?',
      [qty, req.user.id, req.params.product_id]);
    res.json({ message: 'Cart updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// DELETE /api/cart/:product_id
router.delete('/:product_id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?',
      [req.user.id, req.params.product_id]);
    res.json({ message: 'Removed from cart' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// DELETE /api/cart  — clear all
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;