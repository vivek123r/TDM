import express from 'express';
import http from 'http';
import { config } from '../config';
import { DatabaseService } from '../storage/database';
import { QueueManager } from '../queue/manager';
import { createRouter } from '../api/routes';
import { WebSocketService } from '../api/websocket';

async function main() {
  console.log('Starting tdown Background Daemon...');

  // 1. Initialize Storage
  const db = new DatabaseService();
  await db.init();
  console.log('Database initialized.');

  // 2. Initialize Queue Manager
  const queue = new QueueManager(db);
  await queue.init();
  console.log('Download queue initialized.');

  // 3. Initialize HTTP Express Server
  const app = express();
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Mount API router
  app.use('/api', createRouter(queue));

  const server = http.createServer(app);

  // 4. Initialize WebSocket Service
  const wsService = new WebSocketService(queue, server);
  wsService.init();

  // 5. Start Server
  server.listen(config.port, () => {
    console.log(`tdown Daemon is running on http://localhost:${config.port}`);
    console.log(`WebSocket server is listening on the same port.`);
  });

  // 6. Graceful Shutdown
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed.');
    });

    try {
      // Close WebSockets
      await wsService.close();
      console.log('WebSocket service closed.');

      // Pause active downloads and update status in database
      console.log('Saving download queue state...');
      await queue.shutdown();
      console.log('Download queue paused and stored.');

      // Close DB connection
      await db.close();
      console.log('Database connection closed.');

      console.log('Shutdown complete. Goodbye!');
      process.exit(0);
    } catch (err: any) {
      console.error('Error during shutdown:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Handle Windows CMD close
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
}

main().catch((err) => {
  console.error('Fatal error starting TDM Daemon:', err);
  process.exit(1);
});
