import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { DownloadItem, DownloadStatus } from '../models/download';
import { config } from '../config';
import fs from 'fs/promises';
import path from 'path';

export class DatabaseService {
  private db: Database | null = null;

  async init(): Promise<void> {
    // Ensure the folder for database exists
    const dbDir = path.dirname(config.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    this.db = await open({
      filename: config.dbPath,
      driver: sqlite3.Database,
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
    await this.db.run(
      `UPDATE downloads SET status = 'waiting', error = null WHERE status IN ('downloading', 'waiting')`
    );
  }

  async getAll(): Promise<DownloadItem[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = await this.db.all<any[]>('SELECT * FROM downloads ORDER BY position ASC, createdAt ASC');
    return rows.map(this.mapRowToItem);
  }

  async getById(id: string): Promise<DownloadItem | null> {
    if (!this.db) throw new Error('Database not initialized');
    const row = await this.db.get<any>('SELECT * FROM downloads WHERE id = ?', id);
    return row ? this.mapRowToItem(row) : null;
  }

  async save(item: DownloadItem): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(
      `INSERT INTO downloads (id, url, filename, saveDir, status, progress, downloadedBytes, totalBytes, error, createdAt, completedAt, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         progress = excluded.progress,
         downloadedBytes = excluded.downloadedBytes,
         totalBytes = excluded.totalBytes,
         error = excluded.error,
         completedAt = excluded.completedAt,
         position = excluded.position`,
      [
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
      ]
    );
  }

  async updateStatus(id: string, status: DownloadStatus, error: string | null = null, completedAt: number | null = null): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(
      `UPDATE downloads SET status = ?, error = ?, completedAt = ? WHERE id = ?`,
      [status, error, completedAt, id]
    );
  }

  async updateProgress(
    id: string,
    progress: number,
    downloadedBytes: number,
    totalBytes: number | null
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(
      `UPDATE downloads SET progress = ?, downloadedBytes = ?, totalBytes = ? WHERE id = ?`,
      [progress, downloadedBytes, totalBytes, id]
    );
  }

  async delete(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run('DELETE FROM downloads WHERE id = ?', id);
  }

  async getNextPosition(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = await this.db.get<{ maxPos: number | null }>('SELECT MAX(position) as maxPos FROM downloads');
    return (row?.maxPos ?? -1) + 1;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  private mapRowToItem(row: any): DownloadItem {
    return {
      id: row.id,
      url: row.url,
      filename: row.filename,
      saveDir: row.saveDir,
      status: row.status as DownloadStatus,
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
