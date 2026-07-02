"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const defaultDownloadPath = path_1.default.join(os_1.default.homedir(), 'Downloads');
// Set up a centralized data directory in the user's home folder
const appDataDir = path_1.default.join(os_1.default.homedir(), '.tdown');
try {
    if (!fs_1.default.existsSync(appDataDir)) {
        fs_1.default.mkdirSync(appDataDir, { recursive: true });
    }
}
catch (err) {
    // Fallback to current working directory if home dir is inaccessible
}
exports.config = {
    port: parseInt(process.env.TDOWN_PORT || '3000', 10),
    dbPath: process.env.TDOWN_DB_PATH || path_1.default.join(appDataDir, 'tdown.db'),
    defaultDownloadDir: process.env.TDOWN_DOWNLOAD_DIR || defaultDownloadPath,
    maxConcurrentDownloads: parseInt(process.env.TDOWN_CONCURRENCY || '3', 10),
    uiRefreshIntervalMs: 250, // 4 FPS
};
