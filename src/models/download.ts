export type DownloadStatus = 
  | 'waiting' 
  | 'downloading' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  saveDir: string;
  status: DownloadStatus;
  progress: number; // 0 to 100
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number; // bytes per second
  eta: number | null; // seconds
  error: string | null;
  createdAt: number; // timestamp ms
  completedAt: number | null; // timestamp ms
  position: number; // Queue order
}

export interface DownloadStats {
  cpuUsage: number;
  ramUsageBytes: number;
  networkDownloadSpeed: number; // total download speed across all downloads
  diskUsagePercent: number;
  activeDownloadsCount: number;
  queueLength: number;
}
