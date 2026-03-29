// api.js — Shared API client for SS Milk frontend
// Include this in ALL HTML pages:  <script src="api.js"></script>

const API_BASE = (window.location.origin || 'http://localhost:5000') + '/api';

// ── Token helpers ─────────────────────────────────────────────────
function getToken()         { return localStorage.getItem('authToken'); }
function setToken(t)        { localStorage.setItem('authToken', t); }
function removeToken()      { localStorage.removeItem('authToken'); }
function getUserData()      { return JSON.parse(localStorage.getItem('userData') || 'null'); }
function setUserData(u)     { localStorage.setItem('userData', JSON.stringify(u)); }
function clearUserData()    { localStorage.removeItem('userData'); localStorage.removeItem('authToken'); }
function isLoggedIn()       { return !!getToken(); }
function isAdmin()          { return getUserData()?.role === 'admin'; }

// ── Core fetch wrapper ────────────────────────────────────────────
async function apiRequest(endpoint, method = 'GET', body = null, requireAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth) {
    const token = getToken();
    if (!token) { window.location.href = 'user_authentication.html'; return; }
    headers['Authorization'] = `Bearer ${token}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${API_BASE}${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════
const Auth = {
  async sendOTP(email, name)            { return apiRequest('/auth/send-otp', 'POST', { email, name }); },
  async register(name, email, password, otp) {
    const data = await apiRequest('/auth/register', 'POST', { name, email, password, otp });
    if (data.token) { setToken(data.token); setUserData(data.user); }
    return data;
  },
  async login(email, password) {
    const data = await apiRequest('/auth/login', 'POST', { email, password });
    if (data.token) { setToken(data.token); setUserData(data.user); }
    return data;
  },
  async forgotPassword(email)           { return apiRequest('/auth/forgot-password', 'POST', { email }); },
  async resetPassword(token, newPwd)    { return apiRequest('/auth/reset-password', 'POST', { token, newPassword: newPwd }); },
  logout() { clearUserData(); window.location.href = 'index.html'; }
};

// ═══════════════════════════════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════════════════════════════
const Products = {
  async getAll(category = '', search = '') {
    let url = '/products?';
    if (category && category !== 'All') url += `category=${encodeURIComponent(category)}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;
    return apiRequest(url);
  },
  async getAllAdmin()       { return apiRequest('/products/all', 'GET', null, true); },
  async getById(id)        { return apiRequest(`/products/${id}`); },
  async add(product)       { return apiRequest('/products', 'POST', product, true); },
  async update(id, product){ return apiRequest(`/products/${id}`, 'PUT', product, true); },
  async delete(id)         { return apiRequest(`/products/${id}`, 'DELETE', null, true); }
};

// ═══════════════════════════════════════════════════════════════════
//  CART
// ═══════════════════════════════════════════════════════════════════
const Cart = {
  async get()                  { return apiRequest('/cart', 'GET', null, true); },
  async add(product_id, qty=1) { return apiRequest('/cart', 'POST', { product_id, qty }, true); },
  async update(product_id, qty){ return apiRequest(`/cart/${product_id}`, 'PUT', { qty }, true); },
  async remove(product_id)     { return apiRequest(`/cart/${product_id}`, 'DELETE', null, true); },
  async clear()                { return apiRequest('/cart', 'DELETE', null, true); },
};

// ═══════════════════════════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════════════════════════
const Orders = {
  async checkDelivery(lat, lng)    { return apiRequest('/orders/check-delivery', 'POST', { lat, lng }, true); },
  async place(orderData)           { return apiRequest('/orders', 'POST', orderData, true); },
  async getMyOrders()              { return apiRequest('/orders/my', 'GET', null, true); },
  async getAllAdmin()               { return apiRequest('/orders/all', 'GET', null, true); },
  async getById(id)                { return apiRequest(`/orders/${id}`, 'GET', null, true); },
  async updateStatus(orderId, st)  { return apiRequest(`/orders/${orderId}/status`, 'PATCH', { status: st }, true); },
  async setDeliveryDate(orderId, d){ return apiRequest(`/orders/${orderId}/delivery-date`, 'PATCH', { estimated_delivery_date: d }, true); },
  async verifyDeliveryOtp(orderId, otp) { return apiRequest(`/orders/${orderId}/verify-otp`, 'POST', { otp }, true); },
  async sendDeliveryOtpEmail(orderId) { return apiRequest(`/orders/${orderId}/send-otp`, 'POST', null, true); },
  async updatePaymentStatus(orderId, status) { return apiRequest(`/orders/${orderId}/payment-status`, 'PATCH', { payment_status: status }, true); }
};

// ═══════════════════════════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════════════════════════
const Profile = {
  async get()                    { return apiRequest('/profile', 'GET', null, true); },
  async update(data)             { return apiRequest('/profile', 'PUT', data, true); },
  async getAddresses()           { return apiRequest('/profile/addresses', 'GET', null, true); },
  async addAddress(a)            { return apiRequest('/profile/addresses', 'POST', a, true); },
  async updateAddress(id, a)     { return apiRequest(`/profile/addresses/${id}`, 'PUT', a, true); },
  async deleteAddress(id)        { return apiRequest(`/profile/addresses/${id}`, 'DELETE', null, true); },
};

// ═══════════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════════
const Admin = {
  async getStats()              { return apiRequest('/admin/stats', 'GET', null, true); },
  async getActivity()           { return apiRequest('/admin/activity', 'GET', null, true); },
  async getMembers()            { return apiRequest('/admin/members', 'GET', null, true); },
  async updateRole(id, role)    { return apiRequest(`/admin/members/${id}/role`, 'PATCH', { role }, true); },
  async deactivateMember(id)    { return apiRequest(`/admin/members/${id}/deactivate`, 'PATCH', {}, true); },
  async activateMember(id)      { return apiRequest(`/admin/members/${id}/activate`, 'PATCH', {}, true); },
  async deleteMember(id)        { return apiRequest(`/admin/members/${id}`, 'DELETE', null, true); },
  // Offers (coupons + discounts)
  async getOffers()             { return apiRequest('/admin/offers', 'GET', null, true); },
  async getActiveOffers()       { return apiRequest('/admin/offers/active', 'GET', null, false); },
  async createOffer(o)          { return apiRequest('/admin/offers', 'POST', o, true); },
  async deleteOffer(id)         { return apiRequest(`/admin/offers/${id}`, 'DELETE', null, true); },
  async validateOffer(code, subtotal) { return apiRequest('/admin/validate-offer', 'POST', { code, subtotal }); },
  // Settings
  async getSettings()           { return apiRequest('/admin/settings', 'GET', null, true); },
  async saveSettings(data)      { return apiRequest('/admin/settings', 'PUT', data, true); },
  // Special order requests
  async getSpecialRequests()    { return apiRequest('/admin/special-requests', 'GET', null, true); },
  async updateSpecialRequest(id, status, notes) { return apiRequest(`/admin/special-requests/${id}`, 'PATCH', { status, admin_notes: notes }, true); },
  // Contact messages
  async getContactMessages()    { return apiRequest('/admin/contact-messages', 'GET', null, true); },
};

// ═══════════════════════════════════════════════════════════════════
//  SPECIAL ORDER (user-facing)
// ═══════════════════════════════════════════════════════════════════
const SpecialOrder = {
  async request(product_id, qty, notes) { return apiRequest('/orders/special-request', 'POST', { product_id, qty, notes }, true); },
  async getMyRequests()                 { return apiRequest('/orders/special-requests/my', 'GET', null, true); },
};

// ═══════════════════════════════════════════════════════════════════
//  CONTACT
// ═══════════════════════════════════════════════════════════════════
const Contact = {
  async send(data)  { return apiRequest('/contact', 'POST', data); },
};

// ═══════════════════════════════════════════════════════════════════
//  UPI
// ═══════════════════════════════════════════════════════════════════
const UPI = {
  async getConfig() { return apiRequest('/upi-config'); },
  buildUpiUrl(upiId, merchantName, amount) {
    return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&cu=INR`;
  },
  buildQrUrl(upiUrl, size = 250) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(upiUrl)}`;
  },
  buildGpayUrl(upiId, merchantName, amount) {
    return `intent://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${amount}&cu=INR#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
  },
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
};

// ═══════════════════════════════════════════════════════════════════
//  DELIVERY / LOCATION
// ═══════════════════════════════════════════════════════════════════
const Delivery = {
  async getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { timeout: 10000, maximumAge: 60000 }
      );
    });
  },
  async checkZone(lat, lng) { return Orders.checkDelivery(lat, lng); }
};

// ── Google Drive URL fixer (shared across pages) ──────────────────
function fixDriveUrl(url) {
  if (!url) return url;
  let m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  m = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  m = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (m && !url.includes('export=view')) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  return url;
}

// ── Global toast helper ───────────────────────────────────────────
function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:9999;';
    document.body.appendChild(container);
  }
  const colors = { info: '#333', success: '#0FBA81', error: '#dc3545', warning: '#FF8C00' };
  const toast  = document.createElement('div');
  toast.style.cssText = `background:${colors[type]||colors.info};color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 5px 15px rgba(0,0,0,0.2);animation:slideInToast .3s ease;max-width:300px;`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

(function() {
  const s = document.createElement('style');
  s.textContent = `@keyframes slideInToast{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`;
  document.head.appendChild(s);
})();