/**
 * Formats a size in bytes to a human-readable string.
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Formats speed in bytes/sec to a human-readable string.
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

/**
 * Formats duration in seconds to a human-readable string (e.g., 01:24 or 02:45:12).
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '00:00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num: number) => String(num).padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Generates a Unicode progress bar.
 */
export function generateProgressBar(progress: number, width: number = 15): string {
  const percent = Math.max(0, Math.min(100, progress));
  const filledLength = Math.round((percent / 100) * width);
  const emptyLength = width - filledLength;

  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);

  return `${filled}${empty} ${percent}%`;
}
