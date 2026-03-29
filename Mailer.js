// mailer.js — Nodemailer email sender
'use strict';
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ── OTP Email (Unique & Simple) ───────────────────────────────────
async function sendOTP(toEmail, otp, name = '') {
  const html = `
  <div style="font-family:'Arial',sans-serif;max-width:400px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#0FBA81,#07a070);padding:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:6px;">🔐</div>
      <h2 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Verify Your Email</h2>
      <p style="color:rgba(255,255,255,0.9);font-size:12px;margin:4px 0 0;">SS Milk Dairy</p>
    </div>
    <div style="padding:24px;text-align:center;">
      <p style="color:#333;font-size:14px;margin:0 0 8px;">Hi <strong>${name || 'there'}</strong>,</p>
      <p style="color:#666;font-size:13px;margin:0 0 24px;">Your verification code is ready. Enter it within 10 minutes.</p>
      
      <div style="background:#f5f5f5;border:3px solid #0FBA81;border-radius:8px;padding:18px;margin:16px 0;">
        <p style="color:#666;font-size:11px;text-transform:uppercase;margin:0 0 8px;letter-spacing:1px;">Verification Code</p>
        <div style="font-size:42px;font-weight:900;letter-spacing:8px;color:#0FBA81;font-family:'Courier New',monospace;margin:0;">${otp}</div>
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

// ── Order Confirmation Email (customer) ───────────────────────────
async function sendOrderConfirmation(toEmail, order, items, customer = {}) {
  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.name} (${i.unit})</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${i.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(i.price * i.qty).toFixed(2)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${(i.price * i.qty).toFixed(2)}</td>
    </tr>`).join('');

  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0FBA81,#07a070);padding:24px;text-align:center;color:#fff;">
      <h2 style="margin:0;font-size:22px;">SS Milk Dairy - Order Invoice</h2>
      <p style="margin:8px 0 0;font-size:13px;">Pure dairy delivery at your doorstep</p>
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 10px;font-size:14px;"><strong>Order ID:</strong> ${order.id}</p>
      <p style="margin:0 0 10px;font-size:14px;"><strong>Customer:</strong> ${customer.name || ''} | ${customer.phone || ''}</p>
      <p style="margin:0 0 10px;font-size:14px;"><strong>Delivery Address:</strong> ${order.delivery_address}</p>
      <p style="margin:0 0 20px;font-size:14px;"><strong>Payment Mode:</strong> ${order.payment_method.toUpperCase()}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="background:#f8f9fa;">
            <th style="padding:8px;text-align:left;">Item</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Rate</th>
            <th style="padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="margin:0;font-size:13px;">Subtotal: <strong>₹${order.subtotal.toFixed(2)}</strong></p>
      <p style="margin:0;font-size:13px;">Delivery Fee: <strong>₹${order.delivery_fee.toFixed(2)}</strong></p>
      <p style="margin:0;font-size:13px;">Discount: <strong>₹${order.discount.toFixed(2)}</strong></p>
      <p style="margin:0;font-size:16px;font-weight:800;">Grand Total: ₹${order.total_amount.toFixed(2)}</p>
      <p style="margin:16px 0 0;font-size:13px;">Delivery OTP: <strong>${order.delivery_otp}</strong></p>
      <p style="margin:3px 0 0;font-size:12px;color:#666;">Note: This is an auto-generated invoice. Please keep it for your reference.</p>
    </div>
    <div style="background:#f0f4fa;padding:12px;text-align:center;font-size:12px;">SS Milk Dairy • 123 Dairy Lane, Coimbatore • support@ssmilk.com</div>
  </div>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `Invoice ${order.id} – SS Milk`,
    html,
  });
}

// ── Delivery Date Notification (customer) ─────────────────────────
async function sendDeliveryDateEmail(toEmail, customerName, orderId, deliveryDate, address) {
  const formattedDate = new Date(deliveryDate).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#007bff,#0056b3);padding:25px;text-align:center;">
      <div style="font-size:38px;margin-bottom:8px;">📅</div>
      <h2 style="color:#fff;margin:0;font-size:20px;">Your Delivery is Scheduled!</h2>
    </div>
    <div style="padding:25px;">
      <p style="font-size:15px;color:#2c2e3e;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size:14px;color:#7a7a7a;margin-bottom:20px;">Great news! Your order has been confirmed and a delivery date has been assigned.</p>
      <div style="background:#f0f4ff;border-left:4px solid #007bff;border-radius:10px;padding:18px 20px;margin:20px 0;">
        <div style="font-size:11px;font-weight:700;color:#6B7A99;letter-spacing:.8px;margin-bottom:6px;">ORDER ID</div>
        <div style="font-size:17px;font-weight:800;color:#007bff;margin-bottom:14px;">${orderId}</div>
        <div style="font-size:11px;font-weight:700;color:#6B7A99;letter-spacing:.8px;margin-bottom:6px;">EXPECTED DELIVERY DATE</div>
        <div style="font-size:20px;font-weight:800;color:#1A2438;">${formattedDate}</div>
      </div>
      <div style="background:#e6faf4;border-radius:10px;padding:14px 18px;margin:15px 0;">
        <p style="font-size:13px;margin:0;color:#0a7a55;">📍 Delivering to: <strong>${address}</strong></p>
      </div>
      <div style="background:#fff3cd;border-radius:10px;padding:14px 18px;font-size:13px;margin:15px 0;">
        <strong>⚠️ Important:</strong> Please keep your <strong>Delivery OTP</strong> ready to share with our delivery person when they arrive.
      </div>
      <p style="font-size:12px;color:#7a7a7a;margin-top:20px;">If you have any questions, please contact us. Thank you for choosing SS Milk! 🥛</p>
    </div>
    <div style="background:#f8f9fa;padding:14px 25px;text-align:center;font-size:11px;color:#999;">
      SS Milk – Pure Dairy, Every Morning 🐄
    </div>
  </div>`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `📅 Delivery Scheduled for ${formattedDate} – Order ${orderId} | SS Milk`,
    html,
  });
}

// ── New Order Alert Email (all admins) ────────────────────────────
async function sendNewOrderAlertToAdmins(adminEmails, order, items, customerName) {
  if (!adminEmails || adminEmails.length === 0) return;
  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${i.name} × ${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:600;">₹${(i.price * i.qty).toFixed(2)}</td>
    </tr>`).join('');
  const feeRow = order.delivery_fee > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#FF8C00;">Delivery Fee</td><td style="padding:8px 12px;text-align:right;font-size:13px;color:#FF8C00;">₹${order.delivery_fee}</td></tr>` : '';
  const discRow = order.discount > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#0FBA81;">Discount</td><td style="padding:8px 12px;text-align:right;font-size:13px;color:#0FBA81;">-₹${order.discount}</td></tr>` : '';
  const distRow = order.distance_km ? `<p style="font-size:13px;color:#7a7a7a;margin:4px 0;">📍 Distance: <strong>${order.distance_km} km</strong></p>` : '';
  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#1C6BFF,#1254CC);padding:25px;text-align:center;">
      <div style="font-size:32px;">🛒</div>
      <h2 style="color:#fff;margin:8px 0 0;font-size:20px;">New Order Received!</h2>
      <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:4px 0 0;">SS Milk Admin Alert</p>
    </div>
    <div style="padding:25px;">
      <div style="background:#f0f4ff;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:11px;color:#6B7A99;font-weight:600;">ORDER ID</div><div style="font-size:18px;font-weight:800;color:#1C6BFF;">${order.id}</div></div>
        <div style="text-align:right;"><div style="font-size:11px;color:#6B7A99;font-weight:600;">TOTAL</div><div style="font-size:22px;font-weight:800;color:#1A2438;">₹${order.total_amount}</div></div>
      </div>
      <p style="font-size:14px;margin:0 0 6px;"><strong>Customer:</strong> ${customerName}</p>
      <p style="font-size:13px;color:#7a7a7a;margin:4px 0;">📦 Payment: <strong>${order.payment_method}</strong></p>
      <p style="font-size:13px;color:#7a7a7a;margin:4px 0;">🏠 Address: ${order.delivery_address}</p>
      ${distRow}
      <table style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#f8f9fa;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7A99;font-weight:700;">ITEMS ORDERED</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6B7A99;font-weight:700;">AMOUNT</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>${feeRow}${discRow}
          <tr style="background:#f0f4ff;">
            <td style="padding:10px 12px;font-weight:800;font-size:14px;">Total to Collect</td>
            <td style="padding:10px 12px;font-weight:800;font-size:16px;color:#1C6BFF;text-align:right;">₹${order.total_amount}</td>
          </tr>
        </tfoot>
      </table>
      <div style="background:#fff3cd;border-radius:8px;padding:12px 16px;font-size:13px;">
        <strong>⚡ Action Required:</strong> Please confirm this order and set a delivery date from the admin panel.
      </div>
    </div>
    <div style="background:#f8f9fa;padding:14px 25px;text-align:center;font-size:11px;color:#999;">
      SS Milk Admin Panel · Automated Notification
    </div>
  </div>`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: adminEmails.join(', '),
    subject: `🛒 New Order ${order.id} – ₹${order.total_amount} | SS Milk`,
    html,
  });
}

// ── Delivery OTP Email (when out for delivery) ────────────────────
async function sendDeliveryOTP(toEmail, customerName, orderId, otp) {
  const html = `
  <div style="font-family:'Arial',sans-serif;max-width:420px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#FF8C00,#E67E22);padding:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:6px;">🚚</div>
      <h2 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Out for Delivery!</h2>
    </div>
    <div style="padding:24px;text-align:center;">
      <p style="color:#333;font-size:14px;margin:0 0 16px;">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#666;font-size:13px;margin:0 0 12px;">Your order is on its way! 🎉</p>
      
      <div style="background:#fff3e0;border-left:4px solid #FF8C00;border-radius:6px;padding:12px 16px;margin:16px 0;text-align:left;">
        <p style="font-size:12px;color:#E67E22;margin:0;"><strong>Order #${orderId}</strong></p>
      </div>
      
      <p style="color:#666;font-size:13px;margin:0 0 12px;font-weight:700;">Share this code with delivery person:</p>
      <div style="background:#fff;border:2px solid #FF8C00;border-radius:8px;padding:16px;margin:12px 0;">
        <div style="font-size:48px;font-weight:900;letter-spacing:10px;color:#FF8C00;font-family:'Courier New',monospace;margin:0;">${otp}</div>
      </div>
      
      <div style="background:#e8f5e9;border-radius:6px;padding:12px;margin:16px 0;">
        <p style="font-size:12px;color:#2e7d32;margin:0;">✓ Delivery estimated soon. Stay home!</p>
      </div>
      
      <p style="color:#999;font-size:11px;margin:16px 0 0;">For support, contact us anytime.</p>
    </div>
    <div style="background:#f9f9f9;padding:12px;text-align:center;border-top:1px solid #eee;">
      <p style="font-size:10px;color:#999;margin:0;">🥛 SS Milk • Fast & Fresh Delivery</p>
    </div>
  </div>`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `🚚 Out for Delivery! Your Code: ${otp} – SS Milk Order ${orderId}`,
    html,
  });
}

async function sendSmsOtp(toPhone, otp, orderId = '') {
  const body = `SS Milk Delivery OTP for order ${orderId}: ${otp}. Please share with delivery partner.`;

  // Twilio SMS (only if all 3 env vars are set)
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_FROM;

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const payload = new URLSearchParams({
        To: toPhone,
        From: twilioFrom,
        Body: body,
      });
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: payload.toString()
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        console.warn(`[SMS] Twilio error: ${errData.message || resp.statusText}`);
      } else {
        console.info(`[SMS] Sent OTP to ${toPhone} via Twilio`);
      }
      return;
    } catch (err) {
      console.warn(`[SMS] Twilio failed: ${err.message}`);
    }
  }

  // Fallback: No SMS provider configured — just log it (development mode)
  console.info(`[SMS-DEV] OTP for ${toPhone} (order ${orderId}): ${otp}`);
}

async function sendPasswordReset(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/reset-password.html?token=${resetToken}`;
  const html = `
  <div style="font-family:'Poppins',sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#007bff,#0056b3);padding:25px;text-align:center;">
      <h2 style="color:#fff;margin:0;">🔒 Reset Your Password</h2>
    </div>
    <div style="padding:25px;">
      <p>You requested a password reset for your SS Milk account.</p>
      <a href="${resetUrl}" style="display:inline-block;background:#007bff;color:#fff;padding:14px 30px;border-radius:10px;text-decoration:none;font-weight:700;margin:15px 0;">Reset Password</a>
      <p style="font-size:12px;color:#7a7a7a;">Link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>
  </div>`;
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject: 'Reset Your SS Milk Password', html });
}

module.exports = { sendOTP, sendOrderConfirmation, sendDeliveryDateEmail, sendNewOrderAlertToAdmins, sendPasswordReset, sendDeliveryOTP, sendSmsOtp };