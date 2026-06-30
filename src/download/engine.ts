import { request } from 'undici';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Transform, TransformCallback } from 'stream';
import { EventEmitter } from 'events';
import path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
import { parseContentDisposition, getFilenameFromUrl, getUniqueFilename } from '../utils/filename';

export interface EngineProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  progress: number;
  speed: number;
  eta: number | null;
}

class ProgressStream extends Transform {
  private bytesThisPeriod = 0;
  private lastUpdate = Date.now();

  constructor(
    private initialBytes: number,
    private totalBytes: number | null,
    private onProgress: (progress: EngineProgress) => void
  ) {
    super();
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    const chunkLength = chunk.length;
    this.initialBytes += chunkLength;
    this.bytesThisPeriod += chunkLength;

    const now = Date.now();
    const elapsed = now - this.lastUpdate;

    // Calculate progress, speed, and ETA every 1 second (or when completing)
    if (elapsed >= 1000) {
      const speed = Math.round((this.bytesThisPeriod / elapsed) * 1000); // bytes per sec
      const progress = this.totalBytes ? Math.min(100, Math.round((this.initialBytes / this.totalBytes) * 100)) : 0;
      const remainingBytes = this.totalBytes ? this.totalBytes - this.initialBytes : null;
      const eta = remainingBytes && speed > 0 ? Math.ceil(remainingBytes / speed) : null;

      this.onProgress({
        downloadedBytes: this.initialBytes,
        totalBytes: this.totalBytes,
        progress,
        speed,
        eta,
      });

      this.bytesThisPeriod = 0;
      this.lastUpdate = now;
    }

    this.push(chunk);
    callback();
  }

  // Force one last update on complete
  flushProgress(): void {
    const progress = this.totalBytes ? 100 : 0;
    this.onProgress({
      downloadedBytes: this.initialBytes,
      totalBytes: this.totalBytes,
      progress,
      speed: 0,
      eta: null,
    });
  }
}

export class DownloadEngine extends EventEmitter {
  private abortController: AbortController | null = null;
  private aria2cProcess: ChildProcess | null = null;
  private isPaused = false;
  private isCancelled = false;
  private fileWriter: fs.WriteStream | null = null;
  private deleteFileOnCancel = true;

  private static isAria2cAvailable: boolean | null = null;

  constructor(
    public readonly id: string,
    public readonly url: string,
    public readonly saveDir: string,
    public filename: string,
    public downloadedBytes: number = 0,
    public totalBytes: number | null = null
  ) {
    super();
  }

  private static checkAria2c(): boolean {
    if (DownloadEngine.isAria2cAvailable === null) {
      try {
        execSync('aria2c --version', { stdio: 'ignore' });
        DownloadEngine.isAria2cAvailable = true;
      } catch {
        DownloadEngine.isAria2cAvailable = false;
      }
    }
    return DownloadEngine.isAria2cAvailable;
  }

  async start(): Promise<void> {
    this.isPaused = false;
    this.isCancelled = false;

    const useAria = DownloadEngine.checkAria2c();
    if (useAria) {
      return this.startAria2c();
    } else {
      return this.startUndici();
    }
  }

  private async startAria2c(): Promise<void> {
    this.abortController = new AbortController();

    try {
      const args = [
        '--console-log-level=info',
        '--summary-interval=1',
        '--dir=' + this.saveDir,
        '--auto-file-naming=false',
        '--allow-overwrite=true',
      ];

      // If filename is already set to something valid, instruct aria2c to use it
      if (this.filename && this.filename !== 'temp_download') {
        args.push('--out=' + this.filename);
      }

      args.push(this.url);

      // Ensure save directory exists
      await fs.promises.mkdir(this.saveDir, { recursive: true });

      // Spawn aria2c
      this.aria2cProcess = spawn('aria2c', args, {
        signal: this.abortController.signal,
      });

      let stdoutBuffer = '';
      this.aria2cProcess.stdout?.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || ''; // Hold partial line

        for (const line of lines) {
          this.parseAria2cLine(line);
        }
      });

      // We wait for the process to exit
      return new Promise<void>((resolve, reject) => {
        if (!this.aria2cProcess) {
          reject(new Error('aria2c process failed to start'));
          return;
        }

        this.aria2cProcess.on('close', async (code) => {
          this.aria2cProcess = null;
          await this.cleanup();

          if (this.isPaused) {
            this.emit('paused');
            resolve();
          } else if (this.isCancelled) {
            this.emit('cancelled');
            // Clean up files if requested
            if (this.deleteFileOnCancel) {
              const filePath = path.join(this.saveDir, this.filename);
              fs.promises.unlink(filePath).catch(() => {});
              fs.promises.unlink(filePath + '.aria2').catch(() => {});
            }
            resolve();
          } else if (code === 0) {
            this.emit('completed');
            resolve();
          } else {
            const errMsg = `aria2c exited with error code ${code}`;
            this.emit('error', errMsg);
            reject(new Error(errMsg));
          }
        });

        this.aria2cProcess.on('error', async (err) => {
          this.aria2cProcess = null;
          await this.cleanup();
          this.emit('error', err.message);
          reject(err);
        });
      });

    } catch (err: any) {
      await this.cleanup();
      if (!this.isPaused && !this.isCancelled) {
        this.emit('error', err.message);
        throw err;
      }
    }
  }

  private parseAria2cLine(line: string): void {
    // 1. Detect resolved filename from output logs
    // Look for: *** Info: [HttpResponseCommand.cc:245] Saving image to /path/to/file
    const filenameMatch = line.match(/Saving\s+\S+\s+to\s+(.+)/i);
    if (filenameMatch) {
      const fullPath = filenameMatch[1].trim();
      const detectedFilename = path.basename(fullPath);
      if (detectedFilename && this.filename !== detectedFilename) {
        this.filename = detectedFilename;
        this.emit('filename', this.filename);
      }
    }

    // 2. Parse download progress line
    // e.g. [#91b5bf 8.1MiB/39MiB(20%) CN:1 SPD:10.1MiB/s ETA:3s]
    const progressMatch = line.match(/\[#\w+\s+([^(]+)\((\d+)%\)\s+CN:\d+\s+SPD:([^\s]+)\s+ETA:([^\]]+)\]/);
    if (progressMatch) {
      const sizePart = progressMatch[1].trim(); // e.g. "8.1MiB/39MiB" or "8.1MiB/unknown"
      const progress = parseInt(progressMatch[2], 10);
      const speedStr = progressMatch[3]; // e.g. "10.1MiB/s"
      const etaStr = progressMatch[4]; // e.g. "3s" or "1m3s"

      const sizes = sizePart.split('/');
      const downloaded = parseSizeToBytes(sizes[0]);
      const total = sizes[1] ? parseSizeToBytes(sizes[1]) : null;

      const speed = parseSizeToBytes(speedStr.replace(/\/s$/i, ''));
      const eta = parseDurationToSeconds(etaStr);

      this.downloadedBytes = downloaded;
      if (total) this.totalBytes = total;

      this.emit('progress', {
        downloadedBytes: this.downloadedBytes,
        totalBytes: this.totalBytes,
        progress,
        speed,
        eta,
      });
    }
  }

  private async startUndici(): Promise<void> {
    this.abortController = new AbortController();

    try {
      // Prepare headers
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) tdown/1.0',
      };

      // Check if file exists to verify we can resume
      let filePath = path.join(this.saveDir, this.filename || 'temp_download');
      let actualFileExists = false;
      try {
        const stats = await fs.promises.stat(filePath);
        actualFileExists = true;
        if (this.downloadedBytes > 0 && stats.size > 0) {
          // Sync database count with actual file size if they differ slightly
          this.downloadedBytes = stats.size;
          headers['Range'] = `bytes=${this.downloadedBytes}-`;
        } else {
          this.downloadedBytes = 0;
        }
      } catch {
        // File does not exist, start from scratch
        this.downloadedBytes = 0;
      }

      // Initiate request (using generous timeouts for slow or congested networks, and following redirects)
      const response = await request(this.url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal,
        headersTimeout: 60000, // Wait up to 60 seconds for initial server response headers
        bodyTimeout: 0,        // Disable body chunk timeout to allow slow/congested streams to continue
        maxRedirections: 5,    // Follow up to 5 redirects automatically (critical for CDNs/mirrors)
      });

      if (response.statusCode !== 200 && response.statusCode !== 206) {
        throw new Error(`Server returned HTTP status ${response.statusCode}`);
      }

      // 1. Detect Filename if not set
      if (!this.filename || this.filename === 'temp_download' || !actualFileExists) {
        const cdHeader = response.headers['content-disposition'] as string;
        let detectedName = parseContentDisposition(cdHeader) || getFilenameFromUrl(this.url);
        
        // Remove unsafe characters
        detectedName = detectedName.replace(/[\\/:*?"<>|]/g, '_');
        
        if (this.filename !== detectedName) {
          this.filename = await getUniqueFilename(this.saveDir, detectedName);
          filePath = path.join(this.saveDir, this.filename);
          // If filename changed, reset downloadedBytes because it's a new file
          this.downloadedBytes = 0;
          this.emit('filename', this.filename);
        }
      }

      // 2. Determine if resume succeeded
      const isPartial = response.statusCode === 206;
      if (!isPartial && this.downloadedBytes > 0) {
        // Server ignored Range header, start from 0
        this.downloadedBytes = 0;
      }

      // 3. Set Total Bytes
      const lengthHeader = response.headers['content-length'] as string;
      if (lengthHeader) {
        const length = parseInt(lengthHeader, 10);
        if (isPartial) {
          this.totalBytes = this.downloadedBytes + length;
        } else {
          this.totalBytes = length;
        }
      }

      // Ensure directory exists
      await fs.promises.mkdir(this.saveDir, { recursive: true });

      // Open file stream
      const flags = isPartial && this.downloadedBytes > 0 ? 'r+' : 'w';
      this.fileWriter = fs.createWriteStream(filePath, {
        flags,
        start: isPartial && this.downloadedBytes > 0 ? this.downloadedBytes : 0,
      });

      // Handle file stream errors
      this.fileWriter.on('error', (err) => {
        this.emit('error', err.message);
      });

      // Create progress stream
      const progressStream = new ProgressStream(
        this.downloadedBytes,
        this.totalBytes,
        (progressInfo) => {
          this.downloadedBytes = progressInfo.downloadedBytes;
          this.totalBytes = progressInfo.totalBytes;
          this.emit('progress', progressInfo);
        }
      );

      // Stream the response body to the file
      await pipeline(
        response.body,
        progressStream,
        this.fileWriter,
        { signal: this.abortController.signal }
      );

      // Verify that we downloaded the complete file if total size was specified
      if (this.totalBytes !== null && this.downloadedBytes < this.totalBytes) {
        throw new Error('Connection closed before download completed');
      }

      // Success
      progressStream.flushProgress();
      this.emit('completed');

    } catch (err: any) {
      if (this.isPaused) {
        this.emit('paused');
      } else if (this.isCancelled) {
        this.emit('cancelled');
        // Clean up partial file on explicit cancellation if requested
        if (this.deleteFileOnCancel) {
          try {
            await this.cleanup();
            const filePath = path.join(this.saveDir, this.filename);
            await fs.promises.unlink(filePath);
          } catch {
            // Ignore delete errors
          }
        }
      } else {
        const errMsg = err.name === 'AbortError' ? 'Download timed out' : err.message;
        this.emit('error', errMsg);
      }
    } finally {
      await this.cleanup();
    }
  }

  pause(): void {
    if (this.aria2cProcess) {
      this.isPaused = true;
      this.aria2cProcess.kill('SIGINT');
    } else if (this.abortController) {
      this.isPaused = true;
      this.abortController.abort();
    }
  }

  cancel(deleteFile: boolean = true): void {
    this.deleteFileOnCancel = deleteFile;
    if (this.aria2cProcess) {
      this.isCancelled = true;
      this.aria2cProcess.kill('SIGINT');
    } else if (this.abortController) {
      this.isCancelled = true;
      this.abortController.abort();
    } else {
      // If not running, just emit cancelled
      this.emit('cancelled');
      if (deleteFile) {
        const filePath = path.join(this.saveDir, this.filename);
        fs.promises.unlink(filePath).catch(() => {});
        fs.promises.unlink(filePath + '.aria2').catch(() => {});
      }
    }
  }

  private async cleanup(): Promise<void> {
    if (this.fileWriter) {
      const writer = this.fileWriter;
      this.fileWriter = null;
      await new Promise<void>((resolve) => {
        writer.on('close', resolve);
        writer.on('error', () => resolve());
        writer.end();
      });
    }
    this.abortController = null;
  }
}

// Module-level Helper Functions for parsing size and duration

function parseSizeToBytes(str: string): number {
  const match = str.trim().match(/^([\d.]+)\s*([a-zA-Z]*)/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'g':
    case 'gb':
    case 'gib':
      return Math.round(value * 1024 * 1024 * 1024);
    case 'm':
    case 'mb':
    case 'mib':
      return Math.round(value * 1024 * 1024);
    case 'k':
    case 'kb':
    case 'kib':
      return Math.round(value * 1024);
    case 'b':
    default:
      return Math.round(value);
  }
}

function parseDurationToSeconds(str: string): number {
  const timeStr = str.trim().toLowerCase();
  if (timeStr === '0s' || timeStr === '--' || timeStr === 'inf') return 0;

  let totalSeconds = 0;
  const hMatch = timeStr.match(/(\d+)h/);
  const mMatch = timeStr.match(/(\d+)m/);
  const sMatch = timeStr.match(/(\d+)s/);

  if (hMatch) totalSeconds += parseInt(hMatch[1], 10) * 3600;
  if (mMatch) totalSeconds += parseInt(mMatch[1], 10) * 60;
  if (sMatch) totalSeconds += parseInt(sMatch[1], 10);

  if (!hMatch && !mMatch && !sMatch) {
    const rawSec = parseInt(timeStr, 10);
    if (!isNaN(rawSec)) {
      totalSeconds = rawSec;
    }
  }

  return totalSeconds;
}
