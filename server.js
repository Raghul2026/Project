// ================================================================
//  server.js — SS Milk Backend
//  Express 5 + Node.js v24 compatible
//  Run:  node server.js
//  Dev:  npm run dev
// ================================================================
'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── Body parsers ──────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── CORS ──────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials:    true,
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── Security headers ──────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'SAMEORIGIN');
  res.setHeader('X-XSS-Protection',       '1; mode=block');
  next();
});

// ── Built-in rate limiter ─────────────────────────────────────────
const _rl = new Map();
function rateLimit(windowMs, max) {
  return function rateLimiter(req, res, next) {
    const key = (req.ip || '') + '|' + req.path;
    const now = Date.now();
    let e = _rl.get(key);
    if (!e || now - e.t > windowMs) {
      e = { n: 1, t: now };
    } else {
      e.n += 1;
    }
    _rl.set(key, e);
    if (_rl.size > 20000) {
      for (const [k, v] of _rl) {
        if (now - v.t > windowMs) _rl.delete(k);
      }
    }
    if (e.n > max) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }
    next();
  };
}

// ── Static frontend files ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Load routes safely ────────────────────────────────────────────
function loadRoute(filePath) {
  try {
    const mod = require(filePath);
    if (typeof mod !== 'function' && typeof mod.handle !== 'function') {
      throw new Error(`Route ${filePath} did not export a valid Express router`);
    }
    return mod;
  } catch (err) {
    console.error(`❌ Failed to load route: ${filePath}\n   ${err.message}`);
    process.exit(1);
  }
}

const authRoute     = loadRoute('./routes/auth');
const productsRoute = loadRoute('./routes/products');
const cartRoute     = loadRoute('./routes/cart');
const ordersRoute   = loadRoute('./routes/orders');
const profileRoute  = loadRoute('./routes/profile');
const adminRoute    = loadRoute('./routes/admin');

// ── Mount routes ──────────────────────────────────────────────────
app.use('/api/auth',     rateLimit(15 * 60 * 1000, 20),  authRoute);
app.use('/api/products', rateLimit(60 * 1000, 100),       productsRoute);
app.use('/api/cart',     rateLimit(60 * 1000, 60),        cartRoute);
app.use('/api/orders',   rateLimit(60 * 1000, 30),        ordersRoute);
app.use('/api/profile',  rateLimit(60 * 1000, 60),        profileRoute);
app.use('/api/admin',    rateLimit(60 * 1000, 120),       adminRoute);

// ── Contact form endpoint ────────────────────────────────────────
app.post('/api/contact', rateLimit(60 * 1000, 5), async (_req, res) => {
  const { name, email, phone, subject, message } = _req.body;
  if (!name || !email || !message) {
    res.status(400).json({ error: 'name, email and message are required' }); return;
  }
  try {
    const pool = require('./db');
    await pool.query(
      'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)',
      [name, email, phone || '', subject || '', message]
    );
    res.status(201).json({ message: 'Message sent! We will get back to you soon.' });
  } catch (err) {
    console.error('contact error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── Utility endpoints ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'SS Milk API is running', ts: new Date().toISOString() });
});

app.get('/api/upi-config', (_req, res) => {
  res.json({
    upiId:        process.env.UPI_ID        || 'ssmilk@upi',
    merchantName: process.env.MERCHANT_NAME || 'SS Milk',
  });
});

// ── SPA fallback ──────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) next();
  });
});

// ── 404 for unknown API routes ────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[ERROR]', err.message);
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || 'Internal server error',
    ...(isDev ? { stack: err.stack } : {}),
  });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  // Get local IP address
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) { localIP = cfg.address; break; }
    }
    if (localIP !== 'localhost') break;
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀  SS Milk Server`);
  console.log(`📡  Local   →  http://localhost:${PORT}`);
  console.log(`🌐  Network →  http://${localIP}:${PORT}`);
  console.log(`📡  API     →  http://${localIP}:${PORT}/api`);
  console.log(`⚡  Node.js →  ${process.version}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});