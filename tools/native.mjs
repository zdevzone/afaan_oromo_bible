import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const action = process.argv[2];
if (action !== 'dev' && action !== 'check' && action !== 'release') {
  throw new Error('Use native.mjs dev, check, or release.');
}

if (action === 'release') {
  await import('./check-release.mjs');
}

const args = ['exec', 'tauri', action === 'dev' ? 'dev' : 'build'];
if (action !== 'release') args.push('--features', 'development-content');
if (action === 'check') args.push('--no-bundle');

const child = spawn('vp', args, {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, APP_TARGET: 'tauri' },
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(`Could not start Vite+: ${error.message}. Install the global vp CLI and add it to PATH.`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
