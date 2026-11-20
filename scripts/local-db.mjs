#!/usr/bin/env node
/**
 * A private PostgreSQL instance just for SeatLock (no Docker, no admin password).
 * Data lives in ./.local/pgdata (git-ignored); it listens on localhost:5434.
 *
 *   npm run localdb:setup   # create the instance, start it, load schema + seed data
 *   npm run localdb:start   # start it (e.g. after a reboot)
 *   npm run localdb:stop
 *   npm run localdb:status
 *
 * Uses the PostgreSQL binaries already installed on the machine. Override the
 * location with PG_BIN=/path/to/postgres/bin if they aren't found.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, '.local', 'pgdata');
const LOG = join(ROOT, '.local', 'postgres.log');
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5434);
const USER = 'seatlock';
const PASSWORD = 'seatlock_password';
const URL_ = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/seatlock`;
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

function findBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
      // Prefer 16 (matches docker-compose), else the newest installed.
      const versions = readdirSync(base).filter((v) => existsSync(join(base, v, 'bin', 'initdb.exe')));
      versions.sort((a, b) => (a === '16' ? -1 : b === '16' ? 1 : Number(b) - Number(a)));
      if (versions.length) return join(base, versions[0], 'bin');
    }
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pg_ctl'], { encoding: 'utf8' });
  if (which.status === 0) return resolve(which.stdout.split(/\r?\n/)[0], '..');
  // Debian/Ubuntu keep server binaries outside PATH
  const deb = '/usr/lib/postgresql';
  if (existsSync(deb)) {
    const v = readdirSync(deb).sort((a, b) => Number(b) - Number(a))[0];
    if (v) return join(deb, v, 'bin');
  }
  throw new Error('PostgreSQL binaries not found. Install PostgreSQL or set PG_BIN to its bin folder.');
}

const BIN = findBin();
const run = (name, args, opts = {}) => execFileSync(join(BIN, exe(name)), args, { stdio: 'inherit', ...opts });
const isRunning = () =>
  existsSync(DATA) && spawnSync(join(BIN, exe('pg_ctl')), ['-D', DATA, 'status'], { stdio: 'ignore' }).status === 0;

function start() {
  if (!existsSync(DATA)) throw new Error('No local database yet. Run: npm run localdb:setup');
  if (isRunning()) return console.log(`Local database already running on localhost:${PORT}`);
  run('pg_ctl', ['-D', DATA, '-l', LOG, '-w', 'start']);
  console.log(`Local database running on localhost:${PORT}`);
}

function stop() {
  if (!isRunning()) return console.log('Local database is not running.');
  run('pg_ctl', ['-D', DATA, '-m', 'fast', '-w', 'stop']);
}

function pointEnvAtLocalDb() {
  const envPath = join(ROOT, '.env.local');
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (/^DATABASE_URL=/m.test(env)) env = env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${URL_}`);
  else env = `DATABASE_URL=${URL_}\n${env}`;
  if (!/^JWT_SECRET=/m.test(env)) {
    env += `${env.endsWith('\n') || !env ? '' : '\n'}JWT_SECRET=${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')}\n`;
  }
  writeFileSync(envPath, env);
  console.log(`.env.local -> DATABASE_URL=${URL_}`);
}

async function setup() {
  if (existsSync(DATA)) {
    console.log('Local database folder already exists; starting it.');
  } else {
    mkdirSync(join(ROOT, '.local'), { recursive: true });
    const pwfile = join(tmpdir(), `seatlock-pw-${process.pid}`);
    writeFileSync(pwfile, PASSWORD);
    try {
      run('initdb', ['-D', DATA, '-U', USER, `--pwfile=${pwfile}`, '-A', 'scram-sha-256', '-E', 'UTF8', '--no-instructions']);
    } finally {
      rmSync(pwfile, { force: true });
    }
    appendFileSync(
      join(DATA, 'postgresql.conf'),
      `\n# SeatLock local instance\nport = ${PORT}\nlisten_addresses = 'localhost'\nmax_connections = 200\n`
    );
  }
  start();
  const psql = (sql) => run('psql', ['-h', 'localhost', '-p', String(PORT), '-U', USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qtAc', sql], { env: { ...process.env, PGPASSWORD: PASSWORD }, stdio: 'pipe', encoding: 'utf8' });
  if (!String(psql(`SELECT 1 FROM pg_database WHERE datname = 'seatlock'`)).trim()) {
    psql('CREATE DATABASE seatlock');
    console.log('Created database "seatlock".');
  }
  pointEnvAtLocalDb();
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'db-init.mjs'), '--reset'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: URL_ },
  });
  console.log('\nDone. Start the app with:  npm run dev   then open http://localhost:3000');
}

const cmd = process.argv[2];
try {
  if (cmd === 'setup') await setup();
  else if (cmd === 'start') start();
  else if (cmd === 'stop') stop();
  else if (cmd === 'status') console.log(isRunning() ? `running on localhost:${PORT} (${URL_})` : 'not running');
  else console.log('Usage: node scripts/local-db.mjs setup|start|stop|status');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
