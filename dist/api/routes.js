"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouter = createRouter;
const express_1 = __importDefault(require("express"));
function createRouter(queue) {
    const router = express_1.default.Router();
    // GET /api/downloads - List all downloads (supports query param search ?q=...)
    router.get('/downloads', (req, res) => {
        try {
            const q = req.query.q;
            let downloads = queue.getItems();
            if (q) {
                const query = q.toLowerCase();
                downloads = downloads.filter((item) => item.filename.toLowerCase().includes(query) ||
                    item.url.toLowerCase().includes(query));
            }
            res.json(downloads);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/downloads - Create a new download
    router.post('/downloads', async (req, res) => {
        try {
            const { url, saveDir, filename } = req.body;
            if (!url) {
                res.status(400).json({ error: 'URL is required' });
                return;
            }
            const item = await queue.add(url, saveDir, filename);
            res.status(201).json(item);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/downloads/:id/pause - Pause a download
    router.post('/downloads/:id/pause', async (req, res) => {
        try {
            const { id } = req.params;
            const item = queue.getItem(id);
            if (!item) {
                res.status(404).json({ error: 'Download not found' });
                return;
            }
            await queue.pause(id);
            res.json({ message: 'Download paused' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/downloads/:id/resume - Resume a download
    router.post('/downloads/:id/resume', async (req, res) => {
        try {
            const { id } = req.params;
            const item = queue.getItem(id);
            if (!item) {
                res.status(404).json({ error: 'Download not found' });
                return;
            }
            await queue.resume(id);
            res.json({ message: 'Download resumed' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/downloads/:id/cancel - Cancel a download
    router.post('/downloads/:id/cancel', async (req, res) => {
        try {
            const { id } = req.params;
            const item = queue.getItem(id);
            if (!item) {
                res.status(404).json({ error: 'Download not found' });
                return;
            }
            await queue.cancel(id);
            res.json({ message: 'Download cancelled' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/downloads/:id/retry - Retry a download
    router.post('/downloads/:id/retry', async (req, res) => {
        try {
            const { id } = req.params;
            const item = queue.getItem(id);
            if (!item) {
                res.status(404).json({ error: 'Download not found' });
                return;
            }
            await queue.retry(id);
            res.json({ message: 'Download retried' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // DELETE /api/downloads/:id - Delete a download
    router.delete('/downloads/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const deleteFile = req.query.deleteFile !== 'false'; // default true
            const item = queue.getItem(id);
            if (!item) {
                res.status(404).json({ error: 'Download not found' });
                return;
            }
            await queue.delete(id, deleteFile);
            res.json({ message: 'Download deleted' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // GET /api/stats - Get system stats
    router.get('/stats', async (req, res) => {
        try {
            const stats = await queue.getSystemStats();
            res.json(stats);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/shutdown - Gracefully shut down the daemon
    router.post('/shutdown', (req, res) => {
        res.json({ message: 'Daemon shutting down...' });
        setTimeout(() => {
            process.exit(0);
        }, 500);
    });
    return router;
}
