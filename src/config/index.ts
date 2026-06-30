import path from 'path';
import os from 'os';

export interface Config {
  port: number;
  dbPath: string;
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
  uiRefreshIntervalMs: number;
}

const defaultDownloadPath = path.join(os.homedir(), 'Downloads');

export const config: Config = {
  port: parseInt(process.env.TDOWN_PORT || '3000', 10),
  dbPath: process.env.TDOWN_DB_PATH || path.join(process.cwd(), 'tdown.db'),
  defaultDownloadDir: process.env.TDOWN_DOWNLOAD_DIR || defaultDownloadPath,
  maxConcurrentDownloads: parseInt(process.env.TDOWN_CONCURRENCY || '3', 10),
  uiRefreshIntervalMs: 250, // 4 FPS
};
