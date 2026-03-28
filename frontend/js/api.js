const BASE = '/api';

function _qs(params) {
  if (!params || !Object.keys(params).length) return '';
  return '?' + new URLSearchParams(params).toString();
}

async function req(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

const api = {
  getClients:     ()        => req('GET',    '/clients'),
  createClient:   (d)       => req('POST',   '/clients', d),
  updateClient:   (id, d)   => req('PUT',    `/clients/${id}`, d),
  deleteClient:   (id)      => req('DELETE', `/clients/${id}`),
  importClients:  (file)    => { const fd = new FormData(); fd.append('file', file);
                                 return fetch(BASE + '/clients/import', { method: 'POST', body: fd }).then(r => r.json()); },

  getProducts:    ()        => req('GET',    '/products'),
  createProduct:  (d)       => req('POST',   '/products', d),
  updateProduct:  (id, d)   => req('PUT',    `/products/${id}`, d),
  deleteProduct:  (id)      => req('DELETE', `/products/${id}`),
  importProducts: (file)    => { const fd = new FormData(); fd.append('file', file);
                                 return fetch(BASE + '/products/import', { method: 'POST', body: fd }).then(r => r.json()); },

  getOrders:    (p)    => req('GET',    '/orders'        + _qs(p)),
  getOrderIds:  (p)    => req('GET',    '/orders/ids'    + _qs(p)),
  deleteOrders: (ids)  => req('DELETE', '/orders/batch', { ids }),
  createOrder:  (d)    => req('POST',   '/orders', d),
  deleteOrder:  (id)   => req('DELETE', `/orders/${id}`),
  resetOrders:  ()     => req('DELETE', '/orders'),

  startGenerator: (interval) => req('POST',  '/generator/start', { interval }),
  stopGenerator:  ()          => req('POST',  '/generator/stop'),
  genStatus:      ()          => req('GET',   '/generator/status'),

  // Stats — all accept optional { start, end } filter params
  range:          ()        => req('GET', '/stats/range'),
  summary:        (p)       => req('GET', '/stats/summary'  + _qs(p)),
  timeline:       (p)       => req('GET', '/stats/timeline' + _qs(p)),
  productStats:   (p)       => req('GET', '/stats/products' + _qs(p)),
  dailyStats:     (p)       => req('GET', '/stats/daily'    + _qs(p)),
  hourlyStats:    (p)       => req('GET', '/stats/hourly'   + _qs(p)),
};
