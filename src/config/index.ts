import path from 'path';
import os from 'os';
import fs from 'fs';

export interface Config {
  port: number;
  dbPath: string;
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
  uiRefreshIntervalMs: number;
}

const defaultDownloadPath = path.join(os.homedir(), 'Downloads');

// Set up a centralized data directory in the user's home folder
const appDataDir = path.join(os.homedir(), '.tdown');
try {
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
} catch (err) {
  // Fallback to current working directory if home dir is inaccessible
}

export const config: Config = {
  port: parseInt(process.env.TDOWN_PORT || '3000', 10),
  dbPath: process.env.TDOWN_DB_PATH || path.join(appDataDir, 'tdown.db'),
  defaultDownloadDir: process.env.TDOWN_DOWNLOAD_DIR || defaultDownloadPath,
  maxConcurrentDownloads: parseInt(process.env.TDOWN_CONCURRENCY || '3', 10),
  uiRefreshIntervalMs: 250, // 4 FPS
};
