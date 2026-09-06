import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import salesRoutes from './routes/sales';
import fuelRoutes from './routes/fuel';
import dailyClosingRoutes from './routes/dailyClosing';
import reportRoutes from './routes/reports';
import posRoutes from './routes/pos';
import storeRoutes from './routes/stores';
import vendorRoutes from './routes/vendors';
import employeeRoutes from './routes/employees';
import auditLogRoutes from './routes/auditLogs';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 5001;

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production');
}

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
  credentials: true
}));
app.use(express.json());

// Global Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Inject io into req.app so routes can emit events
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('join_store', (storeId) => {
    socket.join(`store-${storeId}`);
    console.log(`Client ${socket.id} joined store: ${storeId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/fuel-log', fuelRoutes);
app.use('/api/daily-close', dailyClosingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/audit-logs', auditLogRoutes);

server.listen(PORT, () => {
  console.log(`Server & WebSockets running on port ${PORT}`);
});
