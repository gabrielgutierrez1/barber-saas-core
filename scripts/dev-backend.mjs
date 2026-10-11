import { spawn } from 'node:child_process';
let server;
const compiler = spawn('tsc', ['-p', 'backend/tsconfig.json', '--watch', '--preserveWatchOutput'], {
  stdio: ['inherit', 'pipe', 'inherit'],
  shell: false,
});
compiler.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (text.includes('Found 0 errors.')) {
    server?.kill();
    server = spawn(process.execPath, ['backend/dist/main.js'], { stdio: 'inherit' });
  }
});
function stop() {
  compiler.kill();
  server?.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
compiler.on('exit', () => {
  server?.kill();
});
