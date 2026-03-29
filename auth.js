// routes/auth.js — User authentication routes
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool     = require('../db');
const { sendOTP, sendPasswordReset } = require('../mailer');
require('dotenv').config();

// ── Helper: generate 6-digit OTP ──────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── POST /api/auth/send-otp ────────────────────────────────────────
// Sends OTP to email for registration
router.post('/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    // Check if email already registered
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered. Please login.' });
    }

    // Delete old OTPs
    await pool.query('DELETE FROM email_otps WHERE email = ?', [email]);

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      'INSERT INTO email_otps (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    await sendOTP(email, otp, name);

    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Check email config.' });
  }
});

// ── POST /api/auth/register ────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, otp } = req.body;

  if (!name || !email || !password || !otp)
    return res.status(400).json({ error: 'All fields are required' });

  try {
    // Validate OTP
    const [otpRows] = await pool.query(
      'SELECT * FROM email_otps WHERE email = ? AND otp = ? AND used = 0 AND expires_at > NOW()',
      [email, otp]
    );
    if (otpRows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, 'customer', 1]
    );

    // Mark OTP used
    await pool.query('UPDATE email_otps SET used = 1 WHERE email = ?', [email]);

    // Log activity
    await pool.query('INSERT INTO activity_log (action, performed_by) VALUES (?, ?)',
      [`New user registered: ${name}`, email]);

    // Generate token
    const token = jwt.sign(
      { id: result.insertId, email, name, role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: result.insertId, name, email, role: 'customer' }
    });
  } catch (err) {
    console.error('register error:', err);
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0)
      return res.status(401).json({ error: 'Account not found. Please register.' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    // Always return success (don't reveal if email exists)
    if (rows.length === 0)
      return res.json({ message: 'If the email exists, a reset link has been sent.' });

    const token = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in OTP table (reusing it)
    await pool.query('DELETE FROM email_otps WHERE email = ?', [email]);
    await pool.query(
      'INSERT INTO email_otps (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, token, expires]
    );

    await sendPasswordReset(email, token);
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: 'Failed to send reset link' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({ error: 'Token and new password required' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM email_otps WHERE otp = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0)
      return res.status(400).json({ error: 'Invalid or expired reset link' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE email = ?',
      [passwordHash, rows[0].email]);
    await pool.query('UPDATE email_otps SET used = 1 WHERE otp = ?', [token]);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

module.exports = router;
