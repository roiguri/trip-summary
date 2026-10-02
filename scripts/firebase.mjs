// Runs the Firebase CLI at a pinned version, kept out of package.json so its large dependency tree
// (and its audit findings) never enter the app's lockfile. The emulators need Java 21+: JAVA_HOME
// wins, else a user-local JDK in ~/.local/jdk-21, else whatever `java` is on PATH.
//   node scripts/firebase.mjs <firebase args...>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const FIREBASE_TOOLS = 'firebase-tools@15.32.1';
const env = { ...process.env };
const localJdk = path.join(homedir(), '.local', 'jdk-21');
if (!env.JAVA_HOME && existsSync(path.join(localJdk, 'bin', 'java'))) env.JAVA_HOME = localJdk;
if (env.JAVA_HOME) env.PATH = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${env.PATH}`;

const r = spawnSync('npx', ['-y', FIREBASE_TOOLS, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(r.status ?? 1);
