/* Wonky Boy - tools/build-apk.js
 * ---------------------------------------------------------------------------
 * Builds the Android APK.
 *
 * WHY THIS IS NOT JUST `gradlew assembleDebug`:
 *
 * The project lives at  H:\!!GARRY\! GK WORK\Claude\wonky-boy  and Gradle on
 * Windows cannot cope with that path. The exclamation marks are the fatal
 * part - `!` is the JAR-URL separator in Java, so any path containing one
 * breaks dependency resolution - and the spaces do not help either. Capacitor
 * makes this unavoidable by pointing the Gradle build at
 * `../node_modules/@capacitor/android/capacitor`, dragging the whole path in.
 * The failure is an unhelpful:
 *
 *     java.io.IOException: The filename, directory name, or volume label
 *     syntax is incorrect
 *
 * So: mirror everything Gradle needs into a short, boring path, build there,
 * and copy the APK back. Node has no trouble with the real path, only Java
 * does, so every other step still runs in place.
 *
 * Run: node tools/build-apk.js [--release]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp',
  'Temp', 'wonkyboy-build');
const DIST = path.join(ROOT, 'dist');

/* --release  signed release APK, for side-loading a production build
 * --bundle   signed .aab, which is what Play actually accepts
 * neither    debug APK for the phone                                       */
const bundle = process.argv.includes('--bundle');
const release = bundle || process.argv.includes('--release');
const task = bundle ? 'bundleRelease' : (release ? 'assembleRelease' : 'assembleDebug');

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd: cwd || ROOT, stdio: 'inherit', shell: true });
}

/* Anything Gradle reads must be mirrored. Nothing else should be. */
const MIRROR = ['android', 'node_modules', 'capacitor.config.json', 'package.json'];

console.log('1/4  building www/');
run('node', ['tools/build-web.js']);

console.log('2/4  syncing the web assets into the Android project');
run('npx', ['cap', 'sync', 'android']);

console.log('3/4  mirroring to a Gradle-safe path');
console.log('     ' + BUILD);
fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
for (const item of MIRROR) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(BUILD, item), { recursive: true });
}
/* local.properties is machine-specific and must point at the real SDK. */
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
fs.writeFileSync(path.join(BUILD, 'android', 'local.properties'),
  'sdk.dir=' + sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n');

console.log('4/4  gradle ' + task);
/* Absolute path: cmd.exe does not reliably resolve a wrapper from the cwd. */
const gradlew = path.join(BUILD, 'android',
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
run('"' + gradlew + '"', [task, '--no-daemon'], path.join(BUILD, 'android'));

/* Collect the result. */
const outDir = bundle
  ? path.join(BUILD, 'android', 'app', 'build', 'outputs', 'bundle', 'release')
  : path.join(BUILD, 'android', 'app', 'build', 'outputs', 'apk',
      release ? 'release' : 'debug');
const ext = bundle ? '.aab' : '.apk';
const built = fs.existsSync(outDir)
  ? fs.readdirSync(outDir).filter((f) => f.endsWith(ext))
  : [];

if (!built.length) {
  console.error('\nBuild reported success but produced no ' + ext + ' in ' + outDir);
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });
for (const artifact of built) {
  const dest = path.join(DIST, artifact);
  fs.copyFileSync(path.join(outDir, artifact), dest);
  const mb = (fs.statSync(dest).size / 1048576).toFixed(2);
  console.log('\n  dist/' + artifact + '  (' + mb + ' MB)');
  if (artifact.includes('unsigned')) {
    console.log('\n  UNSIGNED - android/keystore.properties is missing, so this');
    console.log('  cannot be installed or uploaded. See PLAY-STORE.md section 3.');
  }
}

console.log('\nversion: ' +
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version +
  '  (bump it in package.json before each Play upload)');
