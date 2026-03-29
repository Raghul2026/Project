// routes/auth.js
'use strict';
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../db');
const { sendOTP, sendPasswordReset } = require('../mailer');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function makeOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email) { res.status(400).json({ error: 'Email is required' }); return; }
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) { res.status(409).json({ error: 'Email already registered. Please login.' }); return; }
    await pool.query('DELETE FROM email_otps WHERE email = ?', [email]);
    const otp = makeOTP();
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query('INSERT INTO email_otps (email, otp, expires_at) VALUES (?, ?, ?)', [email, otp, exp]);
    await sendOTP(email, otp, name);
    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP. Check email configuration in .env' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, otp } = req.body;
  if (!name || !email || !password || !otp) { res.status(400).json({ error: 'All fields required' }); return; }
  try {
    const [otpRows] = await pool.query(
      'SELECT id FROM email_otps WHERE email = ? AND otp = ? AND used = 0 AND expires_at > NOW()',
      [email, otp]
    );
    if (otpRows.length === 0) { res.status(400).json({ error: 'Invalid or expired OTP' }); return; }
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, 'customer', 1]
    );
    await pool.query('UPDATE email_otps SET used = 1 WHERE email = ?', [email]);
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`New user registered: ${name}`, email]);
    const user = { id: result.insertId, name, email, role: 'customer' };
    res.status(201).json({ message: 'Account created', token: makeToken(user), user });
  } catch (err) {
    console.error('register error:', err.message);
    if (err.code === 'ER_DUP_ENTRY') { res.status(409).json({ error: 'Email already registered' }); return; }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) { res.status(401).json({ error: 'Account not found. Please register.' }); return; }
    const user  = rows[0];
    // Block deactivated accounts
    if (user.is_active === 0) { res.status(403).json({ error: 'Your account has been deactivated. Please contact support.' }); return; }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { res.status(401).json({ error: 'Incorrect password' }); return; }
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ message: 'Login successful', token: makeToken(payload), user: payload });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length === 0) { res.json({ message: 'If account exists, reset link was sent.' }); return; }
    const token = uuidv4();
    const exp   = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query('DELETE FROM email_otps WHERE email = ?', [email]);
    await pool.query('INSERT INTO email_otps (email, otp, expires_at) VALUES (?, ?, ?)', [email, token, exp]);
    await sendPasswordReset(email, token);
    res.json({ message: 'If account exists, reset link was sent.' });
  } catch (err) {
    console.error('forgot-password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) { res.status(400).json({ error: 'Token and new password required' }); return; }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM email_otps WHERE otp = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0) { res.status(400).json({ error: 'Invalid or expired reset link' }); return; }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, rows[0].email]);
    await pool.query('UPDATE email_otps SET used = 1 WHERE otp = ?', [token]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('reset-password error:', err.message);
    res.status(500).json({ error: 'Reset failed' });
  }
});

module.exports = router;