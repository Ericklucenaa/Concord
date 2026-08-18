import http from 'http';
import app from './app.js';
import { initDb } from './db/database.js';
import { setupSocketIO } from './socket/socketHandler.js';

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

async function startServer() {
  try {
    // 1. Initialize SQLite Database
    await initDb();

    // 2. Create HTTP Server
    const httpServer = http.createServer(app);

    // 3. Setup Socket.IO with WebRTC signaling
    const io = setupSocketIO(httpServer, CLIENT_ORIGIN);

    // 4. Start Listening
    httpServer.listen(PORT, () => {
      console.log(`========================================`);
      console.log(` Concord Backend Server is running!`);
      console.log(` HTTP API: http://localhost:${PORT}`);
      console.log(` WebSocket: ws://localhost:${PORT}`);
      console.log(`========================================`);
    });
  } catch (err) {
    console.error('Fatal error starting Concord backend server:', err);
    process.exit(1);
  }
}

startServer();
