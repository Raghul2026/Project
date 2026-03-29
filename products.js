// routes/products.js
'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

function safePaymentMethods(value) {
  if (Array.isArray(value)) return value;
  if (!value) return ['cod', 'upi'];
  try { return JSON.parse(value); } catch { return ['cod', 'upi']; }
}

async function hasCol(table, column) {
  try {
    const dbName = process.env.DB_NAME || 'ssmilk_db';
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [dbName, table, column]);
    return rows[0]?.cnt > 0;
  } catch { return false; }
}

// GET /api/products  — public (active only)
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];
    if (category && category !== 'All') { sql += ' AND category = ?'; params.push(category); }
    if (search) { sql += ' AND (name LIKE ? OR category LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY category, name';
    const [rows] = await pool.query(sql, params);
    const products = rows.map(p => ({
      ...p,
      payment_methods: safePaymentMethods(p.payment_methods),
      requires_approval: p.requires_approval || 0
    }));
    res.json(products);
  } catch (err) {
    console.error('GET products:', err.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/all  — admin (includes hidden)
router.get('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    const products = rows.map(p => ({
      ...p,
      payment_methods: safePaymentMethods(p.payment_methods),
      requires_approval: p.requires_approval || 0
    }));
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id  — public
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Product not found' }); return; }
    const product = rows[0];
    product.payment_methods = safePaymentMethods(product.payment_methods);
    product.requires_approval = product.requires_approval || 0;
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products  — admin: add new product
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { name, category, price, unit, description, image_path,
          stock_qty, stock_max, payment_methods, requires_approval } = req.body;
  if (!name || !category || !price || !unit) {
    res.status(400).json({ error: 'name, category, price and unit are required' }); return;
  }

  let payMethods = ['cod', 'upi'];
  if (Array.isArray(payment_methods) && payment_methods.length > 0) {
    const valid = ['cod', 'upi'];
    if (payment_methods.every(m => valid.includes(m))) payMethods = payment_methods;
  }

  try {
    // Check if requires_approval column exists
    const hasApproval = await hasCol('products', 'requires_approval');
    let result;
    if (hasApproval) {
      [result] = await pool.query(
        `INSERT INTO products (name, category, price, unit, description, image_path, 
          stock_qty, stock_max, payment_methods, requires_approval) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, category, price, unit, description || '', image_path || '',
         stock_qty || 100, stock_max || 200,
         JSON.stringify(payMethods), requires_approval ? 1 : 0]);
    } else {
      [result] = await pool.query(
        `INSERT INTO products (name, category, price, unit, description, image_path, 
          stock_qty, stock_max, payment_methods) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, category, price, unit, description || '', image_path || '',
         stock_qty || 100, stock_max || 200, JSON.stringify(payMethods)]);
    }
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Admin added product: ${name}`, req.user.email]);
    const [np] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    const product = np[0];
    product.payment_methods = safePaymentMethods(product.payment_methods);
    res.status(201).json({ message: 'Product added', product });
  } catch (err) {
    console.error('POST product:', err.message);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// PUT /api/products/:id  — admin: update product
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { name, category, price, unit, description, image_path,
          stock_qty, stock_max, is_active, payment_methods, requires_approval } = req.body;

  let payMethodsStr = undefined;
  if (Array.isArray(payment_methods) && payment_methods.length > 0) {
    const valid = ['cod', 'upi'];
    if (payment_methods.every(m => valid.includes(m))) {
      payMethodsStr = JSON.stringify(payment_methods);
    }
  }

  try {
    const [existing] = await pool.query('SELECT payment_methods FROM products WHERE id = ?', [req.params.id]);
    if (!existing.length) { res.status(404).json({ error: 'Product not found' }); return; }
    const currentPM = payMethodsStr || (existing[0]?.payment_methods || JSON.stringify(['cod', 'upi']));

    const hasApproval = await hasCol('products', 'requires_approval');
    if (hasApproval) {
      await pool.query(
        `UPDATE products SET name=?, category=?, price=?, unit=?, description=?, image_path=?,
          stock_qty=?, stock_max=?, is_active=?, payment_methods=?, requires_approval=?, updated_at=NOW()
         WHERE id=?`,
        [name, category, price, unit, description, image_path,
         stock_qty, stock_max, is_active ?? 1, currentPM,
         requires_approval ? 1 : 0, req.params.id]);
    } else {
      await pool.query(
        `UPDATE products SET name=?, category=?, price=?, unit=?, description=?, image_path=?,
          stock_qty=?, stock_max=?, is_active=?, payment_methods=?, updated_at=NOW()
         WHERE id=?`,
        [name, category, price, unit, description, image_path,
         stock_qty, stock_max, is_active ?? 1, currentPM, req.params.id]);
    }

    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Admin updated product ID ${req.params.id}: ${name}`, req.user.email]);
    const [up] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    const product = up[0];
    product.payment_methods = safePaymentMethods(product.payment_methods);
    res.json({ message: 'Product updated', product });
  } catch (err) {
    console.error('PUT product:', err.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id  — admin
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT name FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) { res.status(404).json({ error: 'Product not found' }); return; }
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`Admin deleted product: ${rows[0].name} (ID ${req.params.id})`, req.user.email]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('delete product error:', err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;