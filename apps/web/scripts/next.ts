import { buildApp, runNext } from './lib/run-next';

const [command, ...args] = process.argv.slice(2);
if (command !== 'build' && command !== 'dev') {
  console.error('usage: tsx scripts/next.ts build|dev [next arguments]');
  process.exit(2);
}
const r = command === 'build' ? await buildApp({ args }) : await runNext('dev', { args });
process.exit(r.code);
