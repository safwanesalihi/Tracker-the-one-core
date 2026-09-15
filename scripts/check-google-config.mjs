import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(file)) process.loadEnvFile(file);
const required = ['AUTH_URL', 'AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'];
const missing = required.filter((key) => !process.env[key]);
let validUrl = false;
try {
  const url = new URL(process.env.AUTH_URL);
  validUrl = !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' &&
    !url.hostname.endsWith('.chatgpt.site') &&
    (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  if (validUrl) console.log('Google callback URI:', url.origin + '/api/auth/callback/google');
} catch { /* Print only the key below, never a malformed URL containing secrets. */ }
if (missing.length) console.log('Missing values:', missing.join(', '));
const invalid = [];
if (!validUrl) invalid.push('AUTH_URL');
if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) invalid.push('AUTH_SECRET');
if (process.env.AUTH_GOOGLE_ID && !process.env.AUTH_GOOGLE_ID.endsWith('.apps.googleusercontent.com')) invalid.push('AUTH_GOOGLE_ID');
if (invalid.length) console.log('Invalid values:', invalid.join(', '));
if (existsSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)))) {
  console.log('A .dev.vars file exists and takes precedence over .env. Reconcile them before testing.');
  process.exitCode = 1;
}
if (missing.length || invalid.length) process.exitCode = 1;
else if (!process.exitCode) console.log('Configuration format is ready. Restart the preview and test with a real Google account; credentials have not been verified remotely.');
