import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const SOCKET_URL = API_URL.replace('/api', '');

// Setup Axios
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Keep credentials and uploaded documents out of browser logs.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fuelops_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Setup Socket
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: (callback) => callback({ token: localStorage.getItem('fuelops_token') })
});

const generatedKey = (prefix) => `${prefix}-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
const writeConfig = (prefix, requestKey) => ({ headers: { 'Idempotency-Key': requestKey || generatedKey(prefix) } });

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me')
};

export const storeService = {
  getStores: () => api.get('/stores')
};

export const inventoryService = {
  movements: (storeId, inventoryId) => api.get('/inventory/movements', { params: { storeId, inventoryId } }),
  getInventory: (storeId) => api.get(`/inventory?storeId=${storeId}`),
  getItem: (id) => api.get(`/inventory/${id}`),
  createItem: (data, requestKey) => api.post('/inventory', data, writeConfig('inventory-create', requestKey)),
  updateItem: (id, data, requestKey) => api.put(`/inventory/${id}`, data, writeConfig('inventory-update', requestKey)),
  deleteItem: (id, requestKey) => api.delete(`/inventory/${id}`, writeConfig('inventory-delete', requestKey)),
  stockAction: (id, data, requestKey) => api.post(`/inventory/${id}/stock`, data, { headers: { 'Idempotency-Key': requestKey } }),
  addPackage: (id, data, requestKey) => api.post(`/inventory/${id}/packages`, data, { headers: { 'Idempotency-Key': requestKey } }),
  importCsv: (data, requestKey) => api.post('/inventory/import-csv', data, writeConfig('inventory-import', requestKey))
};

export const salesService = {
  recordSale: (data, requestKey) => api.post('/sales', data, writeConfig('sale', requestKey)),
  getSales: (storeId) => api.get(`/sales?storeId=${storeId}`)
};

export const fuelService = {
  recordLog: (data, requestKey) => api.post('/fuel-log', data, writeConfig('fuel-log', requestKey)),
  getLogs: (storeId) => api.get(`/fuel-log?storeId=${storeId}`),
  getTanks: (storeId) => api.get(`/fuel-log/tanks?storeId=${storeId}`),
  updateTank: (id, data, requestKey) => api.put(`/fuel-log/tanks/${id}`, data, writeConfig('fuel-tank', requestKey))
};

export const reportsService = {
  getSummary: (storeId, range = 'all') => api.get(`/reports/summary?storeId=${storeId}&range=${range}`)
};

export const dailyCloseService = {
  submitClosing: (data, requestKey) => api.post('/daily-close', data, writeConfig('daily-close', requestKey)),
  getClosings: (storeId) => api.get(`/daily-close?storeId=${storeId}`)
};

export const posService = {
  connect: (data) => api.post('/pos/connect', data),
  getStatus: (storeId) => api.get(`/pos/status?storeId=${storeId}`),
  disconnect: (storeId) => api.post('/pos/disconnect', { storeId }),
  sync: (data) => api.post('/pos/sync', data),
  importCsv: (data, requestKey) => api.post('/pos/import-csv', data, writeConfig('pos-import', requestKey)),
  autoScan: (data) => api.post('/pos/auto-scan', data),
  saveMapping: (data) => api.post('/pos/mappings', data),
  getMappings: (storeId) => api.get(`/pos/mappings?storeId=${storeId}`)
};

export const vendorService = {
  getAll: () => api.get('/vendors'),
  getById: (id) => api.get(`/vendors/${id}`),
  create: (data, requestKey) => api.post('/vendors', data, writeConfig('vendor-create', requestKey)),
  update: (id, data, requestKey) => api.put(`/vendors/${id}`, data, writeConfig('vendor-update', requestKey)),
  remove: (id, storeId, requestKey) => api.delete(`/vendors/${id}${storeId ? `?storeId=${storeId}` : ''}`, writeConfig('vendor-delete', requestKey))
};

export const employeeService = {
  getAll: (storeId) => api.get(`/employees?storeId=${storeId}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  remove: (id) => api.delete(`/employees/${id}`)
};

export const transferService = {
  getStores: () => api.get('/transfers/stores'),
  getAll: () => api.get('/transfers'),
  getById: (id) => api.get(`/transfers/${id}`),
  create: (data, requestKey) => api.post('/transfers', data, { headers: { 'Idempotency-Key': requestKey } }),
  transition: (id, action, data = {}, requestKey) => api.post(`/transfers/${id}/${action}`, data, { headers: { 'Idempotency-Key': requestKey } }),
  downloadPdf: (id) => api.get(`/transfers/${id}/pdf`, { responseType: 'blob' })
};

export const settlementService = {
  getAll: () => api.get('/settlements'),
  create: (data, requestKey) => api.post('/settlements', data, { headers: { 'Idempotency-Key': requestKey } }),
  updateStatus: (id, data, requestKey) => api.post(`/settlements/${id}/status`, data, { headers: { 'Idempotency-Key': requestKey } })
};

export const invoiceService = {
  capabilities: () => api.get('/invoices/capabilities'),
  getAll: (storeId) => api.get(`/invoices?storeId=${storeId}`),
  getPurchases: (storeId) => api.get(`/invoices/purchases?storeId=${storeId}`),
  upload: (data) => api.post('/invoices', data),
  extract: (id) => api.post(`/invoices/${id}/extract`),
  getById: (id) => api.get(`/invoices/${id}`),
  download: (id) => api.get(`/invoices/${id}/file`, { responseType: 'blob' }),
  saveDraft: (id, draft, expectedUpdatedAt) => api.put(`/invoices/${id}/draft`, { draft, expectedUpdatedAt }),
  manual: (data, requestKey) => api.post('/invoices/manual', data, writeConfig('manual-purchase', requestKey)),
  voidPurchase: (id, reason, requestKey) => api.post(`/invoices/purchases/${id}/void`, { reason }, writeConfig('purchase-void', requestKey)),
  approve: (id, data, requestKey) => api.post(`/invoices/${id}/approve`, data, { headers: { 'Idempotency-Key': requestKey } })
};

export const expenseService = {
  getAll: (storeId) => api.get(`/expenses?storeId=${storeId}`),
  create: (data, requestKey) => api.post('/expenses', data, { headers: { 'Idempotency-Key': requestKey } }),
  remove: (id, reason, requestKey) => api.delete(`/expenses/${id}`, { data: { reason }, headers: { 'Idempotency-Key': requestKey } })
};

export const assistantService = {
  query: (data) => api.post('/assistant/query', data)
};

export const auditService = {
  getAll: (storeId) => api.get(`/audit-logs?storeId=${storeId}`),
  create: (data) => api.post('/audit-logs', data)
};
