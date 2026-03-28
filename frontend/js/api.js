const BASE = '/api';

// ── Token management ──────────────────────────────────────────────────────
let _token = localStorage.getItem('auth_token') || '';

function setToken(t) {
  _token = t || '';
  _token ? localStorage.setItem('auth_token', _token) : localStorage.removeItem('auth_token');
}

function getToken() { return _token; }

// ── Helpers ───────────────────────────────────────────────────────────────
function _qs(params) {
  if (!params || !Object.keys(params).length) return '';
  return '?' + new URLSearchParams(params).toString();
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (res.status === 401) {
    setToken('');
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('401');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

async function reqForm(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(BASE + path, { method: 'POST', body: fd, headers });
  if (res.status === 401) { setToken(''); window.dispatchEvent(new Event('auth:logout')); throw new Error('401'); }
  return res.json();
}

// ── API ───────────────────────────────────────────────────────────────────
const api = {
  // Auth
  login: (username, password) => {
    const body = new URLSearchParams({ username, password });
    return fetch(`${BASE}/auth/login`, { method: 'POST', body }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'Login failed');
      return d;
    });
  },
  me:           ()        => req('GET',    '/auth/me'),
  getUsers:     ()        => req('GET',    '/auth/users'),
  createUser:   (d)       => req('POST',   '/auth/users', d),
  updateUser:   (id, d)   => req('PUT',    `/auth/users/${id}`, d),
  deleteUser:   (id)      => req('DELETE', `/auth/users/${id}`),

  // Clients
  getClients:     ()        => req('GET',    '/clients'),
  createClient:   (d)       => req('POST',   '/clients', d),
  updateClient:   (id, d)   => req('PUT',    `/clients/${id}`, d),
  deleteClient:   (id)      => req('DELETE', `/clients/${id}`),
  importClients:  (file)    => reqForm('/clients/import', file),

  // Products
  getProducts:    ()        => req('GET',    '/products'),
  createProduct:  (d)       => req('POST',   '/products', d),
  updateProduct:  (id, d)   => req('PUT',    `/products/${id}`, d),
  deleteProduct:  (id)      => req('DELETE', `/products/${id}`),
  importProducts: (file)    => reqForm('/products/import', file),

  // Orders
  getOrders:    (p)    => req('GET',    '/orders'        + _qs(p)),
  getOrderIds:  (p)    => req('GET',    '/orders/ids'    + _qs(p)),
  deleteOrders: (ids)  => req('DELETE', '/orders/batch', { ids }),
  createOrder:  (d)    => req('POST',   '/orders', d),
  deleteOrder:  (id)   => req('DELETE', `/orders/${id}`),
  resetOrders:  ()     => req('DELETE', '/orders'),

  // Generator
  startGenerator: (interval) => req('POST', '/generator/start', { interval }),
  stopGenerator:  ()          => req('POST', '/generator/stop'),
  genStatus:      ()          => req('GET',  '/generator/status'),

  // Stats
  range:        ()    => req('GET', '/stats/range'),
  summary:      (p)   => req('GET', '/stats/summary'  + _qs(p)),
  timeline:     (p)   => req('GET', '/stats/timeline' + _qs(p)),
  productStats: (p)   => req('GET', '/stats/products' + _qs(p)),
  dailyStats:   (p)   => req('GET', '/stats/daily'    + _qs(p)),
  hourlyStats:  (p)   => req('GET', '/stats/hourly'   + _qs(p)),
};
