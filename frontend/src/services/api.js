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

// Request Interceptor: Attach token and log request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fuelops_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Debug mode: Log API Requests
  console.log(`[API REQUEST] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`, config.data || '');
  
  return config;
}, (error) => {
  console.error('[API REQUEST ERROR]', error);
  return Promise.reject(error);
});

// Response Interceptor: Log responses and errors globally
api.interceptors.response.use((response) => {
  // Debug mode: Log API Responses
  console.log(`[API RESPONSE] ${response.config.method.toUpperCase()} ${response.config.url}`, response.data);
  return response;
}, (error) => {
  console.error('[API RESPONSE ERROR]', error.response?.data || error.message);
  return Promise.reject(error);
});

// Setup Socket
export const socket = io(SOCKET_URL, {
  autoConnect: false // Connect manually after login
});

export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me')
};

export const storeService = {
  getStores: () => api.get('/stores')
};

export const inventoryService = {
  getInventory: (storeId) => api.get(`/inventory?storeId=${storeId}`),
  getItem: (id) => api.get(`/inventory/${id}`),
  createItem: (data) => api.post('/inventory', data),
  updateItem: (id, data) => api.put(`/inventory/${id}`, data),
  deleteItem: (id) => api.delete(`/inventory/${id}`),
  importCsv: (data) => api.post('/inventory/import-csv', data)
};

export const salesService = {
  recordSale: (data) => api.post('/sales', data),
  getSales: (storeId) => api.get(`/sales?storeId=${storeId}`)
};

export const fuelService = {
  recordLog: (data) => api.post('/fuel-log', data),
  getLogs: (storeId) => api.get(`/fuel-log?storeId=${storeId}`),
  getTanks: (storeId) => api.get(`/fuel-log/tanks?storeId=${storeId}`),
  updateTank: (id, data) => api.put(`/fuel-log/tanks/${id}`, data)
};

export const reportsService = {
  getSummary: (storeId, range = 'all') => api.get(`/reports/summary?storeId=${storeId}&range=${range}`)
};

export const dailyCloseService = {
  submitClosing: (data) => api.post('/daily-close', data),
  getClosings: (storeId) => api.get(`/daily-close?storeId=${storeId}`)
};

export const posService = {
  connect: (data) => api.post('/pos/connect', data),
  getStatus: (storeId) => api.get(`/pos/status?storeId=${storeId}`),
  disconnect: (storeId) => api.post('/pos/disconnect', { storeId }),
  sync: (data) => api.post('/pos/sync', data),
  importCsv: (data) => api.post('/pos/import-csv', data),
  autoScan: (data) => api.post('/pos/auto-scan', data),
  saveMapping: (data) => api.post('/pos/mappings', data),
  getMappings: (storeId) => api.get(`/pos/mappings?storeId=${storeId}`)
};

export const vendorService = {
  getAll: () => api.get('/vendors'),
  getById: (id) => api.get(`/vendors/${id}`),
  create: (data) => api.post('/vendors', data),
  update: (id, data) => api.put(`/vendors/${id}`, data),
  remove: (id, storeId) => api.delete(`/vendors/${id}${storeId ? `?storeId=${storeId}` : ''}`)
};

export const employeeService = {
  getAll: (storeId) => api.get(`/employees?storeId=${storeId}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  remove: (id) => api.delete(`/employees/${id}`)
};

export const auditService = {
  getAll: (storeId) => api.get(`/audit-logs?storeId=${storeId}`),
  create: (data) => api.post('/audit-logs', data)
};
