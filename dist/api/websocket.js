"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
class WebSocketService {
    queue;
    httpServer;
    wss = null;
    clients = new Set();
    statsInterval = null;
    constructor(queue, httpServer) {
        this.queue = queue;
        this.httpServer = httpServer;
    }
    init() {
        // Attach WebSocket server to the same HTTP server
        this.wss = new ws_1.WebSocketServer({ server: this.httpServer });
        this.wss.on('connection', async (ws) => {
            this.clients.add(ws);
            // Send initial dump of downloads and system stats
            try {
                const downloads = this.queue.getItems();
                const stats = await this.queue.getSystemStats();
                ws.send(JSON.stringify({ type: 'init', downloads, stats }));
            }
            catch (err) {
                console.error('[WS] Error sending initial state:', err.message);
            }
            ws.on('close', () => {
                this.clients.delete(ws);
                this.manageStatsInterval();
            });
            ws.on('error', () => {
                this.clients.delete(ws);
                this.manageStatsInterval();
            });
            this.manageStatsInterval();
        });
        // Listen for queue updates and forward them to connected clients
        this.queue.on('update', (item) => {
            this.broadcast({ type: 'update', item });
        });
        this.queue.on('delete', (id) => {
            this.broadcast({ type: 'delete', id });
        });
    }
    manageStatsInterval() {
        if (this.clients.size > 0) {
            if (!this.statsInterval) {
                // Poll stats every 1 second only if clients are connected
                this.statsInterval = setInterval(async () => {
                    if (this.clients.size === 0)
                        return;
                    try {
                        const stats = await this.queue.getSystemStats();
                        this.broadcast({ type: 'stats', stats });
                    }
                    catch {
                        // Ignore stats fetching errors during connection changes
                    }
                }, 1000);
            }
        }
        else {
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.statsInterval = null;
            }
        }
    }
    broadcast(data) {
        const payload = JSON.stringify(data);
        for (const client of this.clients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(payload);
            }
        }
    }
    async close() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        return new Promise((resolve) => {
            if (this.wss) {
                this.wss.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
}
exports.WebSocketService = WebSocketService;
