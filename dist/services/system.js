"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCpuUsage = getCpuUsage;
exports.getRamUsage = getRamUsage;
exports.getDiskUsage = getDiskUsage;
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
let lastCpuInfo = getCpuTicks();
function getCpuTicks() {
    const cpus = os_1.default.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
        user += cpu.times.user;
        nice += cpu.times.nice;
        sys += cpu.times.sys;
        idle += cpu.times.idle;
        irq += cpu.times.irq;
    }
    const total = user + nice + sys + idle + irq;
    return { idle, total };
}
function getCpuUsage() {
    const current = getCpuTicks();
    const idleDiff = current.idle - lastCpuInfo.idle;
    const totalDiff = current.total - lastCpuInfo.total;
    lastCpuInfo = current;
    if (totalDiff === 0)
        return 0;
    const usage = Math.round((1 - idleDiff / totalDiff) * 100);
    return Math.max(0, Math.min(100, usage));
}
function getRamUsage() {
    const total = os_1.default.totalmem();
    const free = os_1.default.freemem();
    const systemUsedPercent = Math.round(((total - free) / total) * 100);
    const processRss = process.memoryUsage().rss;
    return {
        processRss,
        systemUsedPercent,
    };
}
async function getDiskUsage(dir) {
    try {
        if (process.platform === 'win32') {
            // Find drive letter (e.g. C:)
            const drive = dir.substring(0, 2).toUpperCase();
            const { stdout } = await execAsync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size /value`);
            const freeMatch = stdout.match(/FreeSpace=(\d+)/);
            const sizeMatch = stdout.match(/Size=(\d+)/);
            if (freeMatch && sizeMatch) {
                const free = parseInt(freeMatch[1], 10);
                const size = parseInt(sizeMatch[1], 10);
                if (size > 0) {
                    return Math.round(((size - free) / size) * 100);
                }
            }
            return 0;
        }
        else {
            // Linux/macOS - run df -k on the directory
            const { stdout } = await execAsync(`df -k "${dir}"`);
            const lines = stdout.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].replace(/\s+/g, ' ').split(' ');
                // Find column containing '%'
                const percentCol = parts.find(p => p.endsWith('%'));
                if (percentCol) {
                    return parseInt(percentCol.slice(0, -1), 10);
                }
            }
            return 0;
        }
    }
    catch {
        return 0;
    }
}
