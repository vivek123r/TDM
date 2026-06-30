import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let lastCpuInfo = getCpuTicks();

function getCpuTicks() {
  const cpus = os.cpus();
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

export function getCpuUsage(): number {
  const current = getCpuTicks();
  const idleDiff = current.idle - lastCpuInfo.idle;
  const totalDiff = current.total - lastCpuInfo.total;
  lastCpuInfo = current;

  if (totalDiff === 0) return 0;
  const usage = Math.round((1 - idleDiff / totalDiff) * 100);
  return Math.max(0, Math.min(100, usage));
}

export function getRamUsage(): { processRss: number; systemUsedPercent: number } {
  const total = os.totalmem();
  const free = os.freemem();
  const systemUsedPercent = Math.round(((total - free) / total) * 100);
  const processRss = process.memoryUsage().rss;

  return {
    processRss,
    systemUsedPercent,
  };
}

export async function getDiskUsage(dir: string): Promise<number> {
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
    } else {
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
  } catch {
    return 0;
  }
}
