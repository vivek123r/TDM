"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const defaultDownloadPath = path_1.default.join(os_1.default.homedir(), 'Downloads');
exports.config = {
    port: parseInt(process.env.TDOWN_PORT || '3000', 10),
    dbPath: process.env.TDOWN_DB_PATH || path_1.default.join(process.cwd(), 'tdown.db'),
    defaultDownloadDir: process.env.TDOWN_DOWNLOAD_DIR || defaultDownloadPath,
    maxConcurrentDownloads: parseInt(process.env.TDOWN_CONCURRENCY || '3', 10),
    uiRefreshIntervalMs: 250, // 4 FPS
};
