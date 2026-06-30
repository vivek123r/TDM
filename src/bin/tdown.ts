#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import { config } from '../config';

const PORT = config.port;

// Helper to check if daemon is running
function checkDaemon(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/stats`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Helper to send HTTP requests to the daemon
function makeRequest(method: 'GET' | 'POST' | 'DELETE', urlPath: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(dataStr);
    }
    req.end();
  });
}

async function startDaemonDetached() {
  const daemonPath = path.join(__dirname, '../daemon/index.js');
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: 'ignore', // Run silently in background
  });
  child.unref(); // Let the parent process exit without waiting for the child
}

async function run() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'daemon' || command === 'start') {
    // Start daemon in foreground
    const daemonPath = path.join(__dirname, '../daemon/index.js');
    const child = spawn(process.execPath, [daemonPath], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  if (command === 'stop') {
    const isRunning = await checkDaemon();
    if (!isRunning) {
      console.log('Daemon is not running.');
      return;
    }
    console.log('Stopping background daemon...');
    try {
      await makeRequest('POST', '/shutdown');
      console.log('Daemon stopped.');
    } catch {
      console.log('Daemon stopped.');
    }
    return;
  }

  if (command === 'add') {
    const url = args[1];
    if (!url) {
      console.error('Error: Please provide a URL. Usage: tdown add <url> [saveDir]');
      process.exit(1);
    }
    const saveDir = args[2] || undefined;
    
    // Ensure daemon is running
    const isRunning = await checkDaemon();
    if (!isRunning) {
      console.log('Daemon is not running. Starting daemon...');
      await startDaemonDetached();
      await new Promise((r) => setTimeout(r, 1500)); // wait for daemon to boot
    }

    try {
      const res = await makeRequest('POST', '/downloads', { url, saveDir });
      console.log(`Successfully queued download: ${res.filename || 'temp_download'}`);
    } catch (err: any) {
      console.error('Error queueing download:', err.message);
      process.exit(1);
    }
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`
tdown - Professional Terminal Download Manager

Usage:
  tdown               - Open the interactive TUI dashboard (auto-starts daemon in background)
  tdown add <url>     - Queue a download via command line (auto-starts daemon if needed)
  tdown stop          - Stop the background daemon
  tdown daemon        - Start the daemon in the foreground
  tdown help          - Show this help message
`);
    return;
  }

  // Default: launch TUI client
  const isRunning = await checkDaemon();
  if (!isRunning) {
    console.log('Background daemon is not running. Starting daemon...');
    await startDaemonDetached();
    await new Promise((r) => setTimeout(r, 1500)); // wait for daemon to boot
  }

  // Launch TUI client
  const clientPath = path.join(__dirname, '../client/index.js');
  const clientProc = spawn(process.execPath, [clientPath], { stdio: 'inherit' });
  clientProc.on('exit', (code) => process.exit(code ?? 0));
}

run().catch((err) => {
  console.error('Error running CLI:', err);
  process.exit(1);
});
