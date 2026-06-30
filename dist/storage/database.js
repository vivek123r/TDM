"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const sqlite_1 = require("sqlite");
const sqlite3_1 = __importDefault(require("sqlite3"));
const config_1 = require("../config");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
class DatabaseService {
    db = null;
    async init() {
        // Ensure the folder for database exists
        const dbDir = path_1.default.dirname(config_1.config.dbPath);
        await promises_1.default.mkdir(dbDir, { recursive: true });
        this.db = await (0, sqlite_1.open)({
            filename: config_1.config.dbPath,
            driver: sqlite3_1.default.Database,
        });
        await this.db.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        saveDir TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        downloadedBytes INTEGER NOT NULL,
        totalBytes INTEGER,
        error TEXT,
        createdAt INTEGER NOT NULL,
        completedAt INTEGER,
        position INTEGER NOT NULL
      )
    `);
        // Recovery on startup: reset active downloads to 'waiting'
        // so they automatically resume when the daemon restarts.
        await this.db.run(`UPDATE downloads SET status = 'waiting', error = null WHERE status IN ('downloading', 'waiting')`);
    }
    async getAll() {
        if (!this.db)
            throw new Error('Database not initialized');
        const rows = await this.db.all('SELECT * FROM downloads ORDER BY position ASC, createdAt ASC');
        return rows.map(this.mapRowToItem);
    }
    async getById(id) {
        if (!this.db)
            throw new Error('Database not initialized');
        const row = await this.db.get('SELECT * FROM downloads WHERE id = ?', id);
        return row ? this.mapRowToItem(row) : null;
    }
    async save(item) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.db.run(`INSERT INTO downloads (id, url, filename, saveDir, status, progress, downloadedBytes, totalBytes, error, createdAt, completedAt, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         progress = excluded.progress,
         downloadedBytes = excluded.downloadedBytes,
         totalBytes = excluded.totalBytes,
         error = excluded.error,
         completedAt = excluded.completedAt,
         position = excluded.position`, [
            item.id,
            item.url,
            item.filename,
            item.saveDir,
            item.status,
            item.progress,
            item.downloadedBytes,
            item.totalBytes,
            item.error,
            item.createdAt,
            item.completedAt,
            item.position,
        ]);
    }
    async updateStatus(id, status, error = null, completedAt = null) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.db.run(`UPDATE downloads SET status = ?, error = ?, completedAt = ? WHERE id = ?`, [status, error, completedAt, id]);
    }
    async updateProgress(id, progress, downloadedBytes, totalBytes) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.db.run(`UPDATE downloads SET progress = ?, downloadedBytes = ?, totalBytes = ? WHERE id = ?`, [progress, downloadedBytes, totalBytes, id]);
    }
    async delete(id) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.db.run('DELETE FROM downloads WHERE id = ?', id);
    }
    async getNextPosition() {
        if (!this.db)
            throw new Error('Database not initialized');
        const row = await this.db.get('SELECT MAX(position) as maxPos FROM downloads');
        return (row?.maxPos ?? -1) + 1;
    }
    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
    mapRowToItem(row) {
        return {
            id: row.id,
            url: row.url,
            filename: row.filename,
            saveDir: row.saveDir,
            status: row.status,
            progress: row.progress,
            downloadedBytes: row.downloadedBytes,
            totalBytes: row.totalBytes,
            speed: 0, // dynamic runtime data
            eta: null, // dynamic runtime data
            error: row.error,
            createdAt: row.createdAt,
            completedAt: row.completedAt,
            position: row.position,
        };
    }
}
exports.DatabaseService = DatabaseService;
