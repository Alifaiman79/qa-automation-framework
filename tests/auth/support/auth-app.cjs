'use strict';

// Disposable, synthetic fixture only. Supply synthetic passwords through
// AUTH_ADMIN_PASSWORD and AUTH_STANDARD_PASSWORD; never use real credentials.
// Local HTTP cannot provide the transport security of production HTTPS cookies.
// API contract (all responses are JSON; no response body contains a token):
// POST /api/login 200 {user:{id,role}} + cookie; 401 {error:'Invalid credentials'}.
// GET /api/me 200 {user:{id,role}}; 401 {error:'Authentication required'}.
// GET /api/admin 200 {message:'Admin access granted'}; 401 unauthenticated;
//   403 {error:'Access denied'} for the standard role.
// POST /api/logout 200 {message:'Logged out'} for any session, clears the cookie.
// Login rejects wrong media types with 415, malformed JSON or input types with 400,
// and bodies over 16 KiB with 413. Known routes reject other methods with 405.
// UI: GET /login (200); POST /login (303 to /dashboard or 401 login page);
// GET /dashboard (200 or 401); GET /admin (200, 401, or 403);
// POST /logout (200 logged-out page). Protected denials render an access-denied page.
const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4180;
const MAX_BODY_BYTES = 16 * 1024;
const COOKIE_NAME = 'auth_session';
const sessions = new Map();

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const port = Number(process.env.AUTH_PORT || DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('AUTH_PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
const standardPassword = process.env.AUTH_STANDARD_PASSWORD;
if (!adminPassword || !standardPassword || adminPassword === standardPassword) {
  console.error('Distinct synthetic AUTH_ADMIN_PASSWORD and AUTH_STANDARD_PASSWORD values are required.');
  process.exit(1);
}

function digest(value) {
  return createHash('sha256').update(value).digest();
}

const accounts = new Map([
  ['fixture-admin', { id: 'fixture-admin', role: 'admin', passwordHash: digest(adminPassword) }],
  ['fixture-standard', { id: 'fixture-standard', role: 'standard', passwordHash: digest(standardPassword) }],
]);

function headers(contentType, additional = {}) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...additional,
  };
}

function sendJson(response, statusCode, body, additional = {}) {
  response.writeHead(statusCode, headers('application/json; charset=utf-8', additional));
  response.end(JSON.stringify(body));
}

function sendHtml(response, statusCode, body, additional = {}) {
  response.writeHead(statusCode, headers('text/html; charset=utf-8', {
    'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'",
    ...additional,
  }));
  response.end(body);
}

function redirect(response, location, additional = {}) {
  response.writeHead(303, headers('text/plain; charset=utf-8', {
    Location: location,
    ...additional,
  }));
  response.end('See Other');
}

function methodNotAllowed(response, allowed) {
  sendJson(response, 405, { error: 'Method not allowed' }, { Allow: allowed });
}

function contentType(request) {
  return String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
}

function requireContentType(request, expected) {
  if (contentType(request) !== expected) {
    throw new HttpError(415, `Content-Type must be ${expected}`);
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteCount = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on('error', reject);
    request.on('aborted', () => reject(new HttpError(400, 'Request aborted')));
    request.on('end', () => {
      if (tooLarge) reject(new HttpError(413, 'Request body is too large'));
      else resolve(Buffer.concat(chunks));
    });
  });
}

function validCredentials(username, password) {
  const account = accounts.get(username);
  if (!account) return null;
  const suppliedHash = digest(password);
  return timingSafeEqual(suppliedHash, account.passwordHash) ? account : null;
}

function publicUser(account) {
  return { id: account.id, role: account.role };
}

function sessionToken(request) {
  const cookieHeader = request.headers.cookie || '';
  const values = cookieHeader.split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function currentAccount(request) {
  const token = sessionToken(request);
  return token ? sessions.get(token) || null : null;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/`;
}

const clearedCookie = `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

function logIn(request, account) {
  const previousToken = sessionToken(request);
  if (previousToken) sessions.delete(previousToken);
  const token = randomBytes(32).toString('hex');
  sessions.set(token, publicUser(account));
  return sessionCookie(token);
}

function logOut(request) {
  const token = sessionToken(request);
  if (token) sessions.delete(token);
  return clearedCookie;
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} | Auth Fixture</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      ${content}
    </main>
  </body>
</html>`;
}

function loginPage(error = false) {
  return page('Login', `${error ? '<p role="alert">Invalid credentials</p>' : ''}
      <form method="post" action="/login">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Log in</button>
      </form>`);
}

function protectedPage(title, account) {
  const adminLink = account.role === 'admin' ? '<p><a href="/admin">Admin resource</a></p>' : '';
  return page(title, `<p>Signed in as ${account.id}</p>
      <p>Role: ${account.role}</p>
      ${adminLink}
      <form method="post" action="/logout"><button type="submit">Log out</button></form>`);
}

function deniedPage(statusCode) {
  const message = statusCode === 401 ? 'Authentication required' : 'Access denied';
  return page('Access denied', `<p role="alert">${message}</p><a href="/login">Login</a>`);
}

function parseJsonLogin(body) {
  let value;
  try {
    value = JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2
    || typeof value.username !== 'string' || typeof value.password !== 'string') {
    throw new HttpError(400, 'Username and password must be strings');
  }
  return value;
}

function parseFormLogin(body) {
  const form = new URLSearchParams(body.toString('utf8'));
  if ([...form.keys()].length !== 2
    || form.getAll('username').length !== 1 || form.getAll('password').length !== 1) {
    throw new HttpError(400, 'Username and password are required');
  }
  return { username: form.get('username'), password: form.get('password') };
}

function checkRequestOrigin(request) {
  const expected = `http://${HOST}:${port}`;
  if (request.headers.host !== `${HOST}:${port}`
    || (request.headers.origin && request.headers.origin !== expected)) {
    throw new HttpError(403, 'Request origin is not allowed');
  }
}

async function handleRequest(request, response) {
  const pathname = new URL(request.url, `http://${HOST}:${port}`).pathname;
  checkRequestOrigin(request);

  if (pathname === '/') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    return redirect(response, '/login');
  }

  if (pathname === '/login') {
    if (request.method === 'GET') return sendHtml(response, 200, loginPage());
    if (request.method !== 'POST') return methodNotAllowed(response, 'GET, POST');
    requireContentType(request, 'application/x-www-form-urlencoded');
    const { username, password } = parseFormLogin(await readBody(request));
    const account = validCredentials(username, password);
    if (!account) return sendHtml(response, 401, loginPage(true));
    return redirect(response, '/dashboard', { 'Set-Cookie': logIn(request, account) });
  }

  if (pathname === '/api/login') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    requireContentType(request, 'application/json');
    const { username, password } = parseJsonLogin(await readBody(request));
    const account = validCredentials(username, password);
    if (!account) return sendJson(response, 401, { error: 'Invalid credentials' });
    return sendJson(response, 200, { user: publicUser(account) },
      { 'Set-Cookie': logIn(request, account) });
  }

  if (pathname === '/api/me' || pathname === '/api/admin') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    const account = currentAccount(request);
    if (!account) return sendJson(response, 401, { error: 'Authentication required' });
    if (pathname === '/api/admin' && account.role !== 'admin') {
      return sendJson(response, 403, { error: 'Access denied' });
    }
    if (pathname === '/api/me') return sendJson(response, 200, { user: publicUser(account) });
    return sendJson(response, 200, { message: 'Admin access granted' });
  }

  if (pathname === '/dashboard' || pathname === '/admin') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
    const account = currentAccount(request);
    if (!account) return sendHtml(response, 401, deniedPage(401));
    if (pathname === '/admin' && account.role !== 'admin') {
      return sendHtml(response, 403, deniedPage(403));
    }
    return sendHtml(response, 200,
      protectedPage(pathname === '/admin' ? 'Admin resource' : 'Dashboard', account));
  }

  if (pathname === '/api/logout' || pathname === '/logout') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
    if (pathname === '/logout') requireContentType(request, 'application/x-www-form-urlencoded');
    if (pathname === '/api/logout' && contentType(request)
      && contentType(request) !== 'application/json') {
      throw new HttpError(415, 'Content-Type must be application/json');
    }
    if ((await readBody(request)).length !== 0) {
      throw new HttpError(400, 'Logout request body must be empty');
    }
    const cookie = logOut(request);
    if (pathname === '/api/logout') {
      return sendJson(response, 200, { message: 'Logged out' }, { 'Set-Cookie': cookie });
    }
    return sendHtml(response, 200, page('Logged out', '<a href="/login">Login</a>'),
      { 'Set-Cookie': cookie });
  }

  return sendJson(response, 404, { error: 'Route not found' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (response.headersSent || response.destroyed) return;
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof HttpError ? error.message : 'Internal server error';
    sendJson(response, statusCode, { error: message });
  });
});

server.on('error', (error) => {
  const code = typeof error.code === 'string' ? error.code : 'unknown';
  console.error(`Authentication fixture failed to start (${code}).`);
  process.exitCode = 1;
});

server.listen(port, HOST);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close((error) => {
    if (error) {
      console.error('Authentication fixture did not shut down cleanly.');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
