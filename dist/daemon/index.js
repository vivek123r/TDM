"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const config_1 = require("../config");
const database_1 = require("../storage/database");
const manager_1 = require("../queue/manager");
const routes_1 = require("../api/routes");
const websocket_1 = require("../api/websocket");
async function main() {
    console.log('Starting tdown Background Daemon...');
    // 1. Initialize Storage
    const db = new database_1.DatabaseService();
    await db.init();
    console.log('Database initialized.');
    // 2. Initialize Queue Manager
    const queue = new manager_1.QueueManager(db);
    await queue.init();
    console.log('Download queue initialized.');
    // 3. Initialize HTTP Express Server
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // CORS headers
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        }
        else {
            next();
        }
    });
    // Mount API router
    app.use('/api', (0, routes_1.createRouter)(queue));
    const server = http_1.default.createServer(app);
    // 4. Initialize WebSocket Service
    const wsService = new websocket_1.WebSocketService(queue, server);
    wsService.init();
    // 5. Start Server
    server.listen(config_1.config.port, () => {
        console.log(`tdown Daemon is running on http://localhost:${config_1.config.port}`);
        console.log(`WebSocket server is listening on the same port.`);
    });
    // 6. Graceful Shutdown
    let shuttingDown = false;
    const gracefulShutdown = async (signal) => {
        if (shuttingDown)
            return;
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
        }
        catch (err) {
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
