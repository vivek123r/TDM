"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const config_1 = require("../config");
class ApiClient extends events_1.EventEmitter {
    ws = null;
    reconnectTimeout = null;
    isConnected = false;
    baseUrl;
    wsUrl;
    constructor() {
        super();
        this.baseUrl = `http://localhost:${config_1.config.port}/api`;
        this.wsUrl = `ws://localhost:${config_1.config.port}`;
    }
    get connectionStatus() {
        return this.isConnected;
    }
    connect() {
        if (this.ws) {
            this.ws.close();
        }
        this.ws = new ws_1.default(this.wsUrl);
        this.ws.on('open', () => {
            this.isConnected = true;
            this.emit('connected');
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
        });
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this.emit('message', msg);
            }
            catch (err) {
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
    handleDisconnect() {
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
    async addDownload(url, saveDir, filename) {
        const res = await fetch(`${this.baseUrl}/downloads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, saveDir, filename }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || `HTTP error ${res.status}`);
        }
        return res.json();
    }
    async pauseDownload(id) {
        await this.postCommand(id, 'pause');
    }
    async resumeDownload(id) {
        await this.postCommand(id, 'resume');
    }
    async cancelDownload(id) {
        await this.postCommand(id, 'cancel');
    }
    async retryDownload(id) {
        await this.postCommand(id, 'retry');
    }
    async deleteDownload(id, deleteFile = true) {
        const res = await fetch(`${this.baseUrl}/downloads/${id}?deleteFile=${deleteFile}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || `HTTP error ${res.status}`);
        }
    }
    async postCommand(id, command) {
        const res = await fetch(`${this.baseUrl}/downloads/${id}/${command}`, {
            method: 'POST',
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || `HTTP error ${res.status}`);
        }
    }
    close() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
        }
    }
}
exports.ApiClient = ApiClient;
