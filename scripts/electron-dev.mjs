#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(rootDir, 'crypto-average-price');
const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
let activeRendererUrl = rendererUrl;
const pnpmCommand = 'pnpm';
const electronCliPath = join(rootDir, 'node_modules', 'electron', 'cli.js');

let viteProcess;
let electronProcess;
let shuttingDown = false;

/**
 * Removes ANSI escape sequences from process output before readiness checks.
 * @param {string} value - Raw terminal output.
 * @returns {string} Output without ANSI escape codes.
 */
function stripAnsi(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Quotes a command argument for safe cmd.exe execution on Windows.
 * @param {string} value - Raw command argument.
 * @returns {string} Argument formatted for a Windows command line.
 */
function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Builds the executable and arguments used to spawn a command on this platform.
 * @param {string} command - Executable command to run.
 * @param {string[]} args - Command-line arguments for the executable.
 * @returns {{command: string, args: string[]}} Platform-specific command details.
 */
function buildSpawnCommand(command, args) {
  if (process.platform !== 'win32' || command === process.execPath) {
    return { command, args };
  }

  const commandPrefix = command.endsWith('.cmd') ? 'call ' : '';

  return {
    command: 'cmd.exe',
    args: ['/d', '/c', `${commandPrefix}${[command, ...args].map(quoteWindowsArg).join(' ')}`],
  };
}

/**
 * Starts a child process with inherited stderr and piped stdout.
 * @param {string} command - Executable command to spawn.
 * @param {string[]} args - Command-line arguments for the executable.
 * @param {import('node:child_process').SpawnOptions} options - Spawn options.
 * @returns {import('node:child_process').ChildProcessWithoutNullStreams} Started child process.
 */
function startProcess(command, args, options) {
  const spawnCommand = buildSpawnCommand(command, args);

  return spawn(spawnCommand.command, spawnCommand.args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

/**
 * Stops a child process if it is still running.
 * @param {import('node:child_process').ChildProcess | undefined} childProcess - Process to stop.
 * @returns {void}
 */
function stopProcess(childProcess) {
  if (childProcess && !childProcess.killed) {
    childProcess.kill();
  }
}

/**
 * Stops all running development child processes and exits.
 * @param {number} exitCode - Process exit code to use.
 * @returns {void}
 */
function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopProcess(electronProcess);
  stopProcess(viteProcess);
  process.exit(exitCode);
}

/**
 * Starts Electron pointed at the active Vite development server.
 * @returns {void}
 */
function startElectron() {
  electronProcess = startProcess(process.execPath, [electronCliPath, '.'], {
    cwd: rootDir,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: activeRendererUrl,
    },
  });

  electronProcess.stdout.on('data', chunk => {
    process.stdout.write(chunk);
  });

  electronProcess.on('exit', code => {
    shutdown(code ?? 0);
  });
}

/**
 * Starts Vite and launches Electron after Vite reports the local server URL.
 * @returns {void}
 */
function startDevelopment() {
  viteProcess = startProcess(pnpmCommand, ['dev', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: appDir,
    env: process.env,
  });

  let electronStarted = false;
  let viteOutputBuffer = '';

  viteProcess.stdout.on('data', chunk => {
    const output = chunk.toString();
    process.stdout.write(output);
    viteOutputBuffer += stripAnsi(output);

    const localUrlMatch = viteOutputBuffer.match(/http:\/\/127\.0\.0\.1:\d+/);

    if (!electronStarted && (viteOutputBuffer.includes(rendererUrl) || localUrlMatch)) {
      activeRendererUrl = localUrlMatch?.[0] || rendererUrl;
      electronStarted = true;
      startElectron();
    }
  });

  viteProcess.on('exit', code => {
    if (!shuttingDown) {
      shutdown(code ?? 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

startDevelopment();
