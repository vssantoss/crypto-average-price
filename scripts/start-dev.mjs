#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_NODE_DESCRIPTION = 'Node.js 20.19.0 or newer in the 20.x line, or Node.js 22.12.0 or newer';
const REQUIRED_PNPM_VERSION = '11.1.3';
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(rootDir, 'crypto-average-price');
const pnpmCommand = 'pnpm';

/**
 * Converts a semantic version string into numeric major, minor, and patch parts.
 * @param {string} version - Version text such as "v20.19.0" or "11.1.3".
 * @returns {{major: number, minor: number, patch: number} | null} Parsed version parts, or null when parsing fails.
 */
function parseVersion(version) {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Checks whether the installed Node.js version satisfies Vite's runtime requirements.
 * @param {{major: number, minor: number, patch: number}} version - Parsed Node.js version parts.
 * @returns {boolean} True when the Node.js version can run this project.
 */
function supportsNodeVersion(version) {
  if (version.major === 20) {
    return version.minor > 19 || (version.minor === 19 && version.patch >= 0);
  }

  if (version.major === 22) {
    return version.minor > 12 || (version.minor === 12 && version.patch >= 0);
  }

  return version.major > 22;
}

/**
 * Prints step-by-step instructions for installing a compatible Node.js runtime.
 * @param {string} reason - The reason the current Node.js runtime cannot start the project.
 * @returns {void}
 */
function printNodeHelp(reason) {
  console.error(`\n${reason}`);
  console.error(`This project needs ${REQUIRED_NODE_DESCRIPTION}.\n`);
  console.error('Step-by-step:');
  console.error('1. Install the latest Node.js LTS from https://nodejs.org/en/download');
  console.error('2. Close and reopen your terminal so PATH is refreshed.');
  console.error('3. Confirm the install with: node --version');
  console.error('4. Run the start script again.');
}

/**
 * Prints step-by-step instructions for installing or activating the required pnpm version.
 * @param {string} reason - The reason pnpm cannot start the project.
 * @returns {void}
 */
function printPnpmHelp(reason) {
  console.error(`\n${reason}`);
  console.error(`This project expects pnpm ${REQUIRED_PNPM_VERSION}.\n`);
  console.error('Step-by-step with Corepack, which is included with modern Node.js:');
  console.error('1. Run: corepack enable');
  console.error(`2. Run: corepack prepare pnpm@${REQUIRED_PNPM_VERSION} --activate`);
  console.error('3. Confirm the install with: pnpm --version');
  console.error('4. Run the start script again.\n');
  console.error('If Corepack is not available, use the pnpm installation guide: https://pnpm.io/installation');
}

/**
 * Quotes a command argument for cmd.exe on Windows.
 * @param {string} value - Raw command argument.
 * @returns {string} The argument formatted for a Windows command line.
 */
function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Builds the executable and arguments needed to run a command on the current platform.
 * @param {string} command - Executable command to run.
 * @param {string[]} args - Command arguments.
 * @returns {{command: string, args: string[]}} Platform-specific executable and arguments.
 */
function buildSpawnCommand(command, args) {
  if (process.platform !== 'win32') {
    return { command, args };
  }

  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArg).join(' ')],
  };
}

/**
 * Runs a command and returns its completed process result.
 * @param {string} command - Executable command to run.
 * @param {string[]} args - Command arguments.
 * @param {import('node:child_process').SpawnSyncOptions} options - spawnSync options.
 * @returns {import('node:child_process').SpawnSyncReturns<Buffer>} Completed command result.
 */
function run(command, args, options = {}) {
  const spawnCommand = buildSpawnCommand(command, args);

  return spawnSync(spawnCommand.command, spawnCommand.args, {
    cwd: appDir,
    stdio: 'inherit',
    ...options,
  });
}

/**
 * Runs a command and returns trimmed stdout when it succeeds.
 * @param {string} command - Executable command to run.
 * @param {string[]} args - Command arguments.
 * @returns {string | null} Trimmed stdout, or null when the command fails.
 */
function readCommandOutput(command, args) {
  const spawnCommand = buildSpawnCommand(command, args);
  const result = spawnSync(spawnCommand.command, spawnCommand.args, {
    cwd: appDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

/**
 * Verifies that the script is being run from a complete repository checkout.
 * @returns {void}
 */
function ensureProjectFiles() {
  if (!existsSync(join(appDir, 'package.json'))) {
    console.error(`Could not find the app package at ${join(appDir, 'package.json')}.`);
    console.error('Make sure you are running this from a complete clone of the repository.');
    process.exit(1);
  }
}

/**
 * Verifies that the current Node.js runtime is compatible with the project.
 * @returns {void}
 */
function ensureNodeVersion() {
  const version = parseVersion(process.version);

  if (!version || !supportsNodeVersion(version)) {
    printNodeHelp(`Found ${process.version}, which is not compatible.`);
    process.exit(1);
  }

  console.log(`Found Node.js ${process.version}.`);
}

/**
 * Verifies that the required pnpm version is installed and available on PATH.
 * @returns {void}
 */
function ensurePnpmVersion() {
  const pnpmVersion = readCommandOutput(pnpmCommand, ['--version']);

  if (!pnpmVersion) {
    printPnpmHelp('pnpm was not found on PATH.');
    process.exit(1);
  }

  if (pnpmVersion !== REQUIRED_PNPM_VERSION) {
    printPnpmHelp(`Found pnpm ${pnpmVersion}, which does not match the project version.`);
    process.exit(1);
  }

  console.log(`Found pnpm ${pnpmVersion}.`);
}

/**
 * Installs project dependencies from the lockfile before starting the dev server.
 * @returns {void}
 */
function installDependencies() {
  console.log('\nChecking and installing project dependencies...');
  const result = run(pnpmCommand, ['install', '--frozen-lockfile']);

  if (result.error || result.status !== 0) {
    console.error('\nDependency installation failed.');
    console.error('Step-by-step:');
    console.error('1. Check that your internet connection is working.');
    console.error('2. Run: cd crypto-average-price');
    console.error('3. Run: pnpm install --frozen-lockfile');
    console.error('4. Run the start script again.');
    process.exit(result.status || 1);
  }
}

/**
 * Starts the Vite development server and exits with its status code.
 * @returns {void}
 */
function startDevServer() {
  console.log('\nStarting the development server...');
  const result = run(pnpmCommand, ['dev']);

  if (result.error) {
    console.error(`Failed to start the dev server: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? (result.signal ? 1 : 0));
}

/**
 * Runs the full preflight, dependency installation, and dev-server startup flow.
 * @returns {void}
 */
function main() {
  ensureProjectFiles();
  ensureNodeVersion();
  ensurePnpmVersion();
  installDependencies();

  if (process.argv.includes('--check-only')) {
    console.log('\nPreflight and dependency installation completed.');
    return;
  }

  startDevServer();
}

main();
