// mailer.js — Email + SMS sender for SS Milk
// Email: Gmail via Nodemailer
// SMS:   Fast2SMS (free India) → TextBelt (free 1/day) → Twilio (paid) → Console
'use strict';
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ═══════════════════════════════════════════════════════════════════
//  SMS SENDER — FREE providers for OTP
// ═══════════════════════════════════════════════════════════════════
//
//  Setup (pick one):
//
//  1. Fast2SMS (FREE for India, unlimited OTP)
//     → Sign up: https://www.fast2sms.com
//     → Get API key from dashboard
//     → Add to .env: FAST2SMS_API_KEY=your_key
//
//  2. TextBelt (FREE globally, 1 SMS/day)
//     → No signup needed! Works out of the box
//     → For more: https://textbelt.com (paid key)
//     → Add to .env: TEXTBELT_KEY=your_key (optional)
//
//  3. Twilio (PAID, reliable)
//     → Add to .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//
// ═══════════════════════════════════════════════════════════════════

async function sendSmsOtp(toPhone, otp, orderId = '') {
  if (!toPhone) { console.warn('[SMS] No phone number provided'); return; }

  // Clean phone number
  let phone = String(toPhone).replace(/[\s\-()]/g, '');
  const phone10 = phone.replace(/^\+?91/, '');
  if (!phone.startsWith('+')) phone = '+91' + phone10;

  const message = `Your SS Milk delivery OTP for order ${orderId} is: ${otp}. Share this with the delivery person. - SS Milk Dairy`;

  // ─── METHOD 1: Fast2SMS (Free for India — unlimited OTP) ──────
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  if (fast2smsKey && phone10.length === 10) {
    try {
      const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': fast2smsKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: phone10,
          flash: 0
        })
      });
      const data = await resp.json();
      if (data.return === true) {
        console.info(`[SMS] ✓ OTP sent to ${phone10} via Fast2SMS`);
        return;
      }
      console.warn(`[SMS] Fast2SMS error: ${data.message || JSON.stringify(data)}`);
    } catch (err) {
      console.warn(`[SMS] Fast2SMS failed: ${err.message}`);
    }
  }

  // ─── METHOD 2: TextBelt (Free — 1 SMS per day, no signup) ─────
  const textbeltKey = process.env.TEXTBELT_KEY || 'textbelt';
  try {
    const resp = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message, key: textbeltKey })
    });
    const data = await resp.json();
    if (data.success) {
      console.info(`[SMS] ✓ OTP sent to ${phone} via TextBelt (quota left: ${data.quotaRemaining})`);
      return;
    }
    console.warn(`[SMS] TextBelt: ${data.error || 'failed'}`);
  } catch (err) {
    console.warn(`[SMS] TextBelt failed: ${err.message}`);
  }

  // ─── METHOD 3: Twilio (Paid) ──────────────────────────────────
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_FROM;
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const payload = new URLSearchParams({ To: phone, From: twilioFrom, Body: message });
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
      });
      if (resp.ok) { console.info(`[SMS] ✓ OTP sent via Twilio`); return; }
      const e = await resp.json().catch(() => ({}));
      console.warn(`[SMS] Twilio error: ${e.message || resp.statusText}`);
    } catch (err) {
      console.warn(`[SMS] Twilio failed: ${err.message}`);
    }
  }

  // ─── FALLBACK: Console log (development) ──────────────────────
  console.info('┌──────────────────────────────────────────┐');
  console.info(`│  📱 SMS OTP (dev mode — no provider set) │`);
  console.info(`│  Phone: ${phone10 || toPhone}`);
  console.info(`│  Order: ${orderId}`);
  console.info(`│  OTP:   ${otp}`);
  console.info('│                                          │');
  console.info('│  To send real SMS, add to .env:          │');
  console.info('│  FAST2SMS_API_KEY=your_key               │');
  console.info('└──────────────────────────────────────────┘');
}


// ═══════════════════════════════════════════════════════════════════
//  DELIVERY OTP — Email + Phone
// ═══════════════════════════════════════════════════════════════════
async function sendDeliveryOTP(toEmail, customerName, orderId, otp) {
  const html = `
  <div style="font-family:'Arial',sans-serif;max-width:420px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#FF8C00,#E67E22);padding:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:6px;">🚚</div>
      <h2 style="color:#fff;margin:0;font-size:20px;">Out for Delivery!</h2>
    </div>
    <div style="padding:24px;text-align:center;">
      <p style="color:#333;font-size:14px;margin:0 0 16px;">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#666;font-size:13px;margin:0 0 12px;">Your order <strong>${orderId}</strong> is on its way! 🎉</p>
      <p style="color:#666;font-size:13px;font-weight:700;">Share this code with delivery person:</p>
      <div style="background:#fff;border:2px solid #FF8C00;border-radius:8px;padding:16px;margin:12px 0;">
        <div style="font-size:48px;font-weight:900;letter-spacing:10px;color:#FF8C00;font-family:'Courier New',monospace;">${otp}</div>
      </div>
      <div style="background:#e8f5e9;border-radius:6px;padding:12px;margin:16px 0;">
        <p style="font-size:12px;color:#2e7d32;margin:0;">✓ Delivery arriving soon. Stay home!</p>
      </div>
    </div>
    <div style="background:#f9f9f9;padding:12px;text-align:center;border-top:1px solid #eee;">
      <p style="font-size:10px;color:#999;margin:0;">🥛 SS Milk • Fast & Fresh Delivery</p>
    </div>
  </div>`;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM, to: toEmail,
      subject: `🚚 Delivery OTP: ${otp} – Order ${orderId} | SS Milk`, html
    });
    console.info(`[EMAIL] ✓ Delivery OTP sent to ${toEmail}`);
  } catch (err) {
    console.warn(`[EMAIL] Delivery OTP failed: ${err.message}`);
  }
}


// ═══════════════════════════════════════════════════════════════════
//  EMAIL OTP (Registration)
// ═══════════════════════════════════════════════════════════════════
async function sendOTP(toEmail, otp, name = '') {
  const html = `
  <div style="font-family:'Arial',sans-serif;max-width:400px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0FBA81,#07a070);padding:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:6px;">🔐</div>
      <h2 style="color:#fff;margin:0;font-size:20px;">Verify Your Email</h2>
      <p style="color:rgba(255,255,255,0.9);font-size:12px;margin:4px 0 0;">SS Milk Dairy</p>
    </div>
    <div style="padding:24px;text-align:center;">
      <p style="color:#333;font-size:14px;margin:0 0 8px;">Hi <strong>${name || 'there'}</strong>,</p>
      <p style="color:#666;font-size:13px;margin:0 0 24px;">Your verification code is ready. Enter it within 10 minutes.</p>
      <div style="background:#f5f5f5;border:3px solid #0FBA81;border-radius:8px;padding:18px;margin:16px 0;">
        <p style="color:#666;font-size:11px;text-transform:uppercase;margin:0 0 8px;letter-spacing:1px;">Verification Code</p>
        <div style="font-size:42px;font-weight:900;letter-spacing:8px;color:#0FBA81;font-family:'Courier New',monospace;">${otp}</div>
      </div>
      <div style="background:#fff3cd;border-radius:6px;padding:12px;margin:16px 0;text-align:left;">
        <p style="font-size:12px;color:#856404;margin:0;">⏱️ <strong>Expires in:</strong> 10 minutes</p>
      </div>
      <p style="color:#999;font-size:11px;margin:20px 0 0;">Didn't request this? You can safely ignore.</p>
    </div>
    <div style="background:#f9f9f9;padding:12px;text-align:center;border-top:1px solid #eee;">
      <p style="font-size:10px;color:#999;margin:0;">🥛 SS Milk • Pure Dairy, Every Morning</p>
    </div>
  </div>`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject: `Your SS Milk Verification Code: ${otp}`, html });
}


// ═══════════════════════════════════════════════════════════════════
//  ORDER CONFIRMATION (Invoice)
// ═══════════════════════════════════════════════════════════════════
async function sendOrderConfirmation(toEmail, order, items, customer = {}) {
  const itemRows = items.map(i =>
    `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${i.name} (${i.unit})</td>
     <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${i.qty}</td>
     <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(i.price*i.qty).toFixed(2)}</td></tr>`).join('');

  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0FBA81,#07a070);padding:24px;text-align:center;color:#fff;">
      <h2 style="margin:0;font-size:22px;">SS Milk Dairy – Order Invoice</h2>
    </div>
    <div style="padding:20px;">
      <p style="font-size:14px;"><strong>Order:</strong> ${order.id} | <strong>Customer:</strong> ${customer.name||''}</p>
      <p style="font-size:14px;"><strong>Address:</strong> ${order.delivery_address}</p>
      <p style="font-size:14px;"><strong>Payment:</strong> ${(order.payment_method||'').toUpperCase()}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead><tr style="background:#f8f9fa;">
          <th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="font-size:13px;">Subtotal: ₹${Number(order.subtotal||0).toFixed(2)} | Delivery: ₹${Number(order.delivery_fee||0).toFixed(2)} | Discount: -₹${Number(order.discount||0).toFixed(2)}</p>
      <p style="font-size:16px;font-weight:800;">Grand Total: ₹${Number(order.total_amount||0).toFixed(2)}</p>
      <div style="background:#fff3cd;border-radius:8px;padding:14px;margin:16px 0;text-align:center;">
        <p style="margin:0;font-size:13px;"><strong>🔑 Delivery OTP:</strong></p>
        <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#FF8C00;font-family:monospace;">${order.delivery_otp}</div>
        <p style="margin:6px 0 0;font-size:11px;color:#856404;">Share this with the delivery person</p>
      </div>
    </div>
  </div>`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject: `Invoice ${order.id} – SS Milk`, html });
}


// ═══════════════════════════════════════════════════════════════════
//  DELIVERY DATE NOTIFICATION
// ═══════════════════════════════════════════════════════════════════
async function sendDeliveryDateEmail(toEmail, customerName, orderId, deliveryDate, address) {
  const fd = new Date(deliveryDate).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#007bff,#0056b3);padding:25px;text-align:center;">
      <div style="font-size:38px;">📅</div>
      <h2 style="color:#fff;margin:8px 0 0;">Delivery Scheduled!</h2>
    </div>
    <div style="padding:25px;">
      <p>Hi <strong>${customerName}</strong>, your order <strong>${orderId}</strong> will be delivered on:</p>
      <div style="background:#f0f4ff;border-left:4px solid #007bff;border-radius:10px;padding:18px;margin:16px 0;">
        <div style="font-size:20px;font-weight:800;">${fd}</div>
      </div>
      <p style="font-size:13px;">📍 Delivering to: <strong>${address}</strong></p>
      <p style="font-size:13px;background:#fff3cd;padding:12px;border-radius:8px;">⚠️ Keep your <strong>Delivery OTP</strong> ready.</p>
    </div>
  </div>`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject: `📅 Delivery on ${fd} – Order ${orderId}`, html });
}


// ═══════════════════════════════════════════════════════════════════
//  ADMIN ALERT — New Order
// ═══════════════════════════════════════════════════════════════════
async function sendNewOrderAlertToAdmins(adminEmails, order, items, customerName) {
  if (!adminEmails || !adminEmails.length) return;
  const rows = items.map(i => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.name} × ${i.qty}</td><td style="padding:6px 10px;text-align:right;border-bottom:1px solid #eee;">₹${(i.price*i.qty).toFixed(2)}</td></tr>`).join('');
  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:#1C6BFF;padding:20px;text-align:center;color:#fff;">
      <h2 style="margin:0;">🛒 New Order ${order.id}</h2>
    </div>
    <div style="padding:20px;">
      <p><strong>Customer:</strong> ${customerName} | <strong>Total:</strong> ₹${order.total_amount}</p>
      <p><strong>Payment:</strong> ${(order.payment_method||'').toUpperCase()} | <strong>Address:</strong> ${order.delivery_address}</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">${rows}</table>
      <p style="background:#fff3cd;padding:10px;border-radius:8px;font-size:13px;">⚡ Confirm this order from admin panel.</p>
    </div>
  </div>`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: adminEmails.join(', '), subject: `🛒 New Order ${order.id} – ₹${order.total_amount}`, html });
}


// ═══════════════════════════════════════════════════════════════════
//  PASSWORD RESET
// ═══════════════════════════════════════════════════════════════════
async function sendPasswordReset(toEmail, resetToken) {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/reset-password.html?token=${resetToken}`;
  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:#007bff;padding:25px;text-align:center;">
      <h2 style="color:#fff;margin:0;">🔒 Reset Password</h2>
    </div>
    <div style="padding:25px;">
      <p>Click below to reset your SS Milk password:</p>
      <a href="${url}" style="display:inline-block;background:#007bff;color:#fff;padding:14px 30px;border-radius:10px;text-decoration:none;font-weight:700;">Reset Password</a>
      <p style="font-size:12px;color:#7a7a7a;margin-top:15px;">Expires in 1 hour. Ignore if not requested.</p>
    </div>
  </div>`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject: 'Reset Your SS Milk Password', html });
}


module.exports = {
  sendOTP,
  sendOrderConfirmation,
  sendDeliveryDateEmail,
  sendNewOrderAlertToAdmins,
  sendPasswordReset,
  sendDeliveryOTP,
  sendSmsOtp
};