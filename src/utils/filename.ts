import path from 'path';
import fs from 'fs/promises';

/**
 * Parses the Content-Disposition header to extract the filename.
 */
export function parseContentDisposition(header: string): string | null {
  if (!header) return null;

  // Try filename* (RFC 5987 style UTF-8 name)
  const utf8Match = header.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // Ignore URL decoding errors and fallback
    }
  }

  // Try standard filename="..."
  const match = header.match(/filename="?([^";\n]+)"?/i);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Extracts a filename from a URL path.
 */
export function getFilenameFromUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    const basename = path.basename(pathname);
    if (basename && basename.includes('.')) {
      return decodeURIComponent(basename);
    }
  } catch {
    // Fallback if URL is invalid
  }
  return 'download';
}

/**
 * Checks if a file exists. If it does, generates a unique name by appending (1), (2), etc.
 */
export async function getUniqueFilename(saveDir: string, filename: string): Promise<string> {
  let uniqueName = filename;
  let filePath = path.join(saveDir, uniqueName);
  
  const ext = path.extname(filename);
  const nameWithoutExt = path.basename(filename, ext);
  let counter = 1;

  while (true) {
    try {
      await fs.access(filePath);
      // File exists, modify filename
      uniqueName = `${nameWithoutExt}(${counter})${ext}`;
      filePath = path.join(saveDir, uniqueName);
      counter++;
    } catch {
      // File does not exist, name is unique
      break;
    }
  }

  return uniqueName;
}
