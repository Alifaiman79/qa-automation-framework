'use strict';

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4179;
const MAX_BODY_BYTES = 16 * 1024;
const items = new Map();

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteCount = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });

    request.on('error', reject);
    request.on('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, 'Request body is too large'));
        return;
      }

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!body) throw new Error('Request body is empty');
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, 'Request body must be valid JSON'));
      }
    });
  });
}

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Integration Items</title>
  </head>
  <body>
    <main>
      <h1>Items</h1>
      <p id="load-status" role="status">Loading items</p>
      <ul id="items" aria-label="Items"></ul>
    </main>
    <script>
      async function loadItems() {
        const list = document.getElementById('items');
        const status = document.getElementById('load-status');

        try {
          const response = await fetch('/api/items');
          if (!response.ok) throw new Error('Items could not be loaded');
          const result = await response.json();

          list.replaceChildren();
          for (const item of result.items) {
            const listItem = document.createElement('li');
            listItem.dataset.itemId = item.id;
            listItem.textContent = item.name;
            list.append(listItem);
          }
          status.textContent = 'Items loaded';
        } catch {
          status.textContent = 'Items could not be loaded';
        }
      }

      loadItems();
    </script>
  </body>
</html>`;

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${HOST}`);
  const pathname = url.pathname;

  if (pathname === '/') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(page);
    return;
  }

  if (pathname === '/api/items') {
    if (request.method === 'GET') {
      sendJson(response, 200, { items: [...items.values()] });
      return;
    }

    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
      return;
    }

    const contentType = (request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      sendJson(response, 400, { error: 'Content-Type must be application/json' });
      return;
    }

    const body = await readJsonBody(request);
    if (typeof body !== 'object' || body === null || Array.isArray(body)
      || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
      sendJson(response, 400, { error: 'Item name must be a non-empty string of at most 200 characters' });
      return;
    }

    const item = { id: randomUUID(), name: body.name };
    items.set(item.id, item);
    sendJson(response, 201, item, { Location: `/api/items/${item.id}` });
    return;
  }

  const itemPath = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (itemPath) {
    if (request.method !== 'DELETE') {
      sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'DELETE' });
      return;
    }

    let id;
    try {
      id = decodeURIComponent(itemPath[1]);
    } catch {
      sendJson(response, 400, { error: 'Item ID is invalid' });
      return;
    }

    if (!items.delete(id)) {
      sendJson(response, 404, { error: 'Item not found' });
      return;
    }

    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { error: 'Route not found' });
}

const configuredPort = process.env.INTEGRATION_PORT || String(DEFAULT_PORT);
const port = Number(configuredPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('INTEGRATION_PORT must be an integer between 1 and 65535.');
  process.exit(1);
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
  console.error(`Integration application failed to start (${code}).`);
  process.exitCode = 1;
});

server.listen(port, HOST);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close((error) => {
    if (error) {
      console.error('Integration application did not shut down cleanly.');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
