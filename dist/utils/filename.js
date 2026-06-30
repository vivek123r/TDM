"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseContentDisposition = parseContentDisposition;
exports.getFilenameFromUrl = getFilenameFromUrl;
exports.getUniqueFilename = getUniqueFilename;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
/**
 * Parses the Content-Disposition header to extract the filename.
 */
function parseContentDisposition(header) {
    if (!header)
        return null;
    // Try filename* (RFC 5987 style UTF-8 name)
    const utf8Match = header.match(/filename\*=UTF-8''([^;\n]+)/i);
    if (utf8Match) {
        try {
            return decodeURIComponent(utf8Match[1]);
        }
        catch {
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
function getFilenameFromUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        const pathname = url.pathname;
        const basename = path_1.default.basename(pathname);
        if (basename && basename.includes('.')) {
            return decodeURIComponent(basename);
        }
    }
    catch {
        // Fallback if URL is invalid
    }
    return 'download';
}
/**
 * Checks if a file exists. If it does, generates a unique name by appending (1), (2), etc.
 */
async function getUniqueFilename(saveDir, filename) {
    let uniqueName = filename;
    let filePath = path_1.default.join(saveDir, uniqueName);
    const ext = path_1.default.extname(filename);
    const nameWithoutExt = path_1.default.basename(filename, ext);
    let counter = 1;
    while (true) {
        try {
            await promises_1.default.access(filePath);
            // File exists, modify filename
            uniqueName = `${nameWithoutExt}(${counter})${ext}`;
            filePath = path_1.default.join(saveDir, uniqueName);
            counter++;
        }
        catch {
            // File does not exist, name is unique
            break;
        }
    }
    return uniqueName;
}
