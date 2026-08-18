import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import serverRoutes from './routes/serverRoutes.js';
import channelRoutes from './routes/channelRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import inviteRoutes from './routes/inviteRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import { DEFAULT_ICE_SERVERS } from '../../shared/constants.js';

dotenv.config();

const app = express();

// Security: Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});

// Middleware
app.use(limiter);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebRTC STUN/TURN ICE Servers config endpoint
app.get('/api/config/webrtc', (req, res) => {
  let iceServers = [...DEFAULT_ICE_SERVERS];

  if (process.env.STUN_SERVERS) {
    const stuns = process.env.STUN_SERVERS.split(',').map((s) => ({ urls: s.trim() }));
    if (stuns.length > 0) iceServers = stuns;
  }

  if (process.env.TURN_SERVER_URL) {
    iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }

  res.json({ iceServers });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/members', memberRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

export default app;
