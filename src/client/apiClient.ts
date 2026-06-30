import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { DownloadItem, DownloadStats } from '../models/download';
import { config } from '../config';

export class ApiClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected = false;
  private baseUrl: string;
  private wsUrl: string;

  constructor() {
    super();
    this.baseUrl = `http://localhost:${config.port}/api`;
    this.wsUrl = `ws://localhost:${config.port}`;
  }

  get connectionStatus(): boolean {
    return this.isConnected;
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.isConnected = true;
      this.emit('connected');
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.emit('message', msg);
      } catch (err: any) {
        console.error('[Client] WS parse error:', err.message);
      }
    });

    this.ws.on('close', () => {
      this.handleDisconnect();
    });

    this.ws.on('error', () => {
      // close event will trigger reconnection
      this.ws?.close();
    });
  }

  private handleDisconnect(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.emit('disconnected');
    }

    if (!this.reconnectTimeout) {
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        this.connect();
      }, 2000); // retry every 2 seconds
    }
  }

  async addDownload(url: string, saveDir?: string, filename?: string): Promise<DownloadItem> {
    const res = await fetch(`${this.baseUrl}/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, saveDir, filename }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    return res.json() as Promise<DownloadItem>;
  }

  async pauseDownload(id: string): Promise<void> {
    await this.postCommand(id, 'pause');
  }

  async resumeDownload(id: string): Promise<void> {
    await this.postCommand(id, 'resume');
  }

  async cancelDownload(id: string): Promise<void> {
    await this.postCommand(id, 'cancel');
  }

  async retryDownload(id: string): Promise<void> {
    await this.postCommand(id, 'retry');
  }

  async deleteDownload(id: string, deleteFile: boolean = true): Promise<void> {
    const res = await fetch(`${this.baseUrl}/downloads/${id}?deleteFile=${deleteFile}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
  }

  private async postCommand(id: string, command: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/downloads/${id}/${command}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
  }

  close(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
  }
}
