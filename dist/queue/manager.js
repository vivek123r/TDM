"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueManager = void 0;
const events_1 = require("events");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const engine_1 = require("../download/engine");
const config_1 = require("../config");
const system_1 = require("../services/system");
class QueueManager extends events_1.EventEmitter {
    db;
    items = [];
    activeEngines = new Map();
    lastDbWrite = new Map();
    constructor(db) {
        super();
        this.db = db;
    }
    async init() {
        // Load all items from SQLite
        this.items = await this.db.getAll();
        // Automatically trigger queue run for any items that might be in a 'waiting' state
        this.processQueue();
    }
    getItems() {
        return this.items;
    }
    getItem(id) {
        return this.items.find((item) => item.id === id);
    }
    async add(url, saveDir = config_1.config.defaultDownloadDir, customFilename) {
        const id = crypto_1.default.randomUUID();
        const filename = customFilename || 'temp_download';
        const position = await this.db.getNextPosition();
        const item = {
            id,
            url,
            filename,
            saveDir,
            status: 'waiting',
            progress: 0,
            downloadedBytes: 0,
            totalBytes: null,
            speed: 0,
            eta: null,
            error: null,
            createdAt: Date.now(),
            completedAt: null,
            position,
        };
        this.items.push(item);
        await this.db.save(item);
        this.emit('update', item);
        this.processQueue();
        return item;
    }
    async pause(id) {
        const item = this.getItem(id);
        if (!item)
            return;
        if (item.status === 'downloading') {
            const engine = this.activeEngines.get(id);
            if (engine) {
                engine.pause();
            }
        }
        else if (item.status === 'waiting') {
            item.status = 'paused';
            await this.db.updateStatus(id, 'paused');
            this.emit('update', item);
        }
    }
    async resume(id) {
        const item = this.getItem(id);
        if (!item)
            return;
        if (item.status === 'paused' || item.status === 'failed' || item.status === 'cancelled') {
            item.status = 'waiting';
            item.error = null;
            await this.db.updateStatus(id, 'waiting', null);
            this.emit('update', item);
            this.processQueue();
        }
    }
    async cancel(id) {
        const item = this.getItem(id);
        if (!item)
            return;
        if (item.status === 'downloading') {
            const engine = this.activeEngines.get(id);
            if (engine) {
                engine.cancel();
            }
        }
        else {
            item.status = 'cancelled';
            await this.db.updateStatus(id, 'cancelled');
            this.emit('update', item);
            // Clean up partial file if exists
            const filePath = path_1.default.join(item.saveDir, item.filename);
            await promises_1.default.unlink(filePath).catch(() => { });
        }
    }
    async retry(id) {
        await this.resume(id);
    }
    async delete(id, deleteFile = true) {
        const item = this.getItem(id);
        if (!item)
            return;
        // 1. Stop if downloading
        if (item.status === 'downloading') {
            const engine = this.activeEngines.get(id);
            if (engine) {
                engine.cancel(deleteFile);
            }
        }
        else {
            // 2. Delete file if requested (only if engine is not running)
            if (deleteFile) {
                const filePath = path_1.default.join(item.saveDir, item.filename);
                await promises_1.default.unlink(filePath).catch(() => { });
                await promises_1.default.unlink(filePath + '.aria2').catch(() => { });
            }
        }
        // 3. Remove from database and memory
        await this.db.delete(id);
        this.items = this.items.filter((i) => i.id !== id);
        this.emit('delete', id);
        this.processQueue();
    }
    async shutdown() {
        // Gracefully pause all downloading engines
        const activeIds = Array.from(this.activeEngines.keys());
        const pausePromises = activeIds.map((id) => this.pause(id));
        await Promise.all(pausePromises);
    }
    async getSystemStats() {
        const cpu = (0, system_1.getCpuUsage)();
        const ram = (0, system_1.getRamUsage)();
        const disk = await (0, system_1.getDiskUsage)(config_1.config.defaultDownloadDir);
        let totalSpeed = 0;
        for (const item of this.items) {
            if (item.status === 'downloading') {
                totalSpeed += item.speed;
            }
        }
        const downloadingCount = this.items.filter((i) => i.status === 'downloading').length;
        const queueCount = this.items.filter((i) => i.status === 'waiting').length;
        return {
            cpuUsage: cpu,
            ramUsageBytes: ram.processRss,
            networkDownloadSpeed: totalSpeed,
            diskUsagePercent: disk,
            activeDownloadsCount: downloadingCount,
            queueLength: queueCount,
        };
    }
    processQueue() {
        const activeCount = this.activeEngines.size;
        if (activeCount >= config_1.config.maxConcurrentDownloads) {
            return;
        }
        // Find the next waiting download
        const nextItem = this.items
            .filter((i) => i.status === 'waiting')
            .sort((a, b) => a.position - b.position)[0];
        if (!nextItem)
            return;
        // Start download
        this.startDownload(nextItem);
        // Process next if we still have available slots
        this.processQueue();
    }
    startDownload(item) {
        item.status = 'downloading';
        item.speed = 0;
        item.eta = null;
        item.error = null;
        const engine = new engine_1.DownloadEngine(item.id, item.url, item.saveDir, item.filename, item.downloadedBytes, item.totalBytes);
        this.activeEngines.set(item.id, engine);
        this.db.updateStatus(item.id, 'downloading').catch((err) => {
            console.error('Failed to update DB status to downloading:', err);
        });
        engine.on('filename', (newFilename) => {
            item.filename = newFilename;
            this.db.save(item).catch(() => { });
            this.emit('update', item);
        });
        engine.on('progress', (progress) => {
            item.downloadedBytes = progress.downloadedBytes;
            item.totalBytes = progress.totalBytes;
            item.progress = progress.progress;
            item.speed = progress.speed;
            item.eta = progress.eta;
            // Throttle DB updates (every 5 seconds)
            const now = Date.now();
            const lastWrite = this.lastDbWrite.get(item.id) || 0;
            if (now - lastWrite > 5000) {
                this.db.updateProgress(item.id, item.progress, item.downloadedBytes, item.totalBytes).catch(() => { });
                this.lastDbWrite.set(item.id, now);
            }
            this.emit('update', item);
        });
        engine.on('completed', () => {
            this.handleEngineTermination(item.id, 'completed', null, Date.now());
        });
        engine.on('paused', () => {
            this.handleEngineTermination(item.id, 'paused');
        });
        engine.on('cancelled', () => {
            this.handleEngineTermination(item.id, 'cancelled');
        });
        engine.on('error', (errStr) => {
            this.handleEngineTermination(item.id, 'failed', errStr);
        });
        // Start asynchronously
        engine.start().catch((err) => {
            this.handleEngineTermination(item.id, 'failed', err.message);
        });
        this.emit('update', item);
    }
    handleEngineTermination(id, status, error = null, completedAt = null) {
        this.activeEngines.delete(id);
        this.lastDbWrite.delete(id);
        const item = this.getItem(id);
        if (!item)
            return;
        item.status = status;
        item.speed = 0;
        item.eta = null;
        item.error = error;
        if (completedAt) {
            item.completedAt = completedAt;
            item.progress = 100;
        }
        // Persist immediately on terminal states
        this.db.save(item).catch((err) => {
            console.error('Failed to save terminal state to DB:', err);
        });
        this.emit('update', item);
        // Trigger queue to run the next item
        this.processQueue();
    }
}
exports.QueueManager = QueueManager;
