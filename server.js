import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import vm from 'vm';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && parsedUrl.pathname === '/api/run') {
    return handleRun(req, res);
  }
  if (req.method === 'POST' && parsedUrl.pathname === '/api/analyze') {
    return handleAnalyze(req, res);
  }
  if (req.method === 'POST' && parsedUrl.pathname === '/api/autofix') {
    return handleAutoFix(req, res);
  }
  serveStatic(parsedUrl, res);
});

server.listen(3000, () => {
  console.log('Mini IDE server running on http://localhost:3000');
});

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleRun(req, res) {
  try {
    const body = await collectBody(req);
    const { code = '', input = '' } = JSON.parse(body || '{}');
    const result = await executeCode(code, input);
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = await collectBody(req);
    const { code = '' } = JSON.parse(body || '{}');
    const analysis = analyzeCode(code);
    json(res, 200, analysis);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

async function handleAutoFix(req, res) {
  try {
    const body = await collectBody(req);
    const { code = '' } = JSON.parse(body || '{}');
    const result = autoFixCode(code);
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

function serveStatic(parsedUrl, res) {
  let filePath = path.join(publicDir, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
  }[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function executeCode(code, input) {
  const logs = [];
  const errors = [];
  const inputLines = input.split(/\r?\n/);
  let inputIndex = 0;
  const getInput = () => {
    if (inputIndex < inputLines.length) {
      return inputLines[inputIndex++];
    }
    throw new Error('No more input available.');
  };

  const consoleProxy = {
    log: (...args) => logs.push(args.join(' ')),
    error: (...args) => errors.push(args.join(' ')),
    warn: (...args) => logs.push('WARN: ' + args.join(' ')),
    info: (...args) => logs.push('INFO: ' + args.join(' ')),
  };

  const sandbox = {
    console: consoleProxy,
    getInput,
    readLine: getInput,
    prompt: message => {
      logs.push(`PROMPT: ${message}`);
      return getInput();
    },
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Math,
    Date,
    String,
    Number,
    Boolean,
  };

  const context = vm.createContext(sandbox);
  const wrappedCode = `(async () => {\n${code}\n})()`;
  const script = new vm.Script(wrappedCode, { timeout: 1000 });
  const start = Date.now();
  try {
    const result = script.runInContext(context, { timeout: 1000 });
    if (result && typeof result.then === 'function') {
      await result;
    }
  } catch (error) {
    errors.push(error.message);
  }
  const duration = Date.now() - start;
  return {
    logs,
    errors,
    duration,
  };
}

function analyzeCode(code) {
  const lines = code.split(/\r?\n/);
  const functions = [];
  const issues = [];
  const suggestions = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const fnMatch = trimmed.match(/function\s+(\w+)/);
    if (fnMatch) {
      functions.push(`${fnMatch[1]} (line ${index + 1})`);
    }
    const arrowMatch = trimmed.match(/const\s+(\w+)\s*=\s*\(/);
    if (arrowMatch) {
      functions.push(`${arrowMatch[1]} (line ${index + 1})`);
    }
    if (/while\s*\(true\)/.test(trimmed)) {
      issues.push(`Potential infinite loop on line ${index + 1}`);
    }
    if (/console\.log\(/.test(trimmed) && !/DEBUG/.test(trimmed)) {
      suggestions.push(`Line ${index + 1}: remove or gate console.log in production.`);
    }
    if (/==[^=]/.test(trimmed)) {
      suggestions.push(`Line ${index + 1}: use strict equality (===) instead of ==.`);
    }
    if (/eval\s*\(/.test(trimmed)) {
      issues.push(`Avoid eval usage on line ${index + 1}.`);
    }
  });

  const explanation = functions.length
    ? `Detected ${functions.length} function(s): ${functions.join(', ')}.`
    : 'No named functions detected; consider modularizing your code for readability.';

  if (!/use\s+strict/.test(code)) {
    suggestions.push('Enable strict mode for safer JavaScript execution.');
  }

  if (!/try\s*\{/.test(code) && /(fetch|await|JSON\.parse)/.test(code)) {
    suggestions.push('Wrap asynchronous or parsing logic in try/catch blocks.');
  }

  return {
    explanation,
    issues,
    suggestions,
  };
}

function autoFixCode(code) {
  let updated = code.replace(/\bvar\b/g, 'let');
  updated = updated
    .replace(/([^!<>=])==([^=])/g, (match, left, right) => `${left} === ${right.trimStart()}`)
    .replace(/!=([^=])/g, (match, right) => `!== ${right.trimStart()}`);
  const lines = updated.split(/\r?\n/);
  let indent = 0;
  const formatted = lines
    .map(line => {
      let trimmed = line.trim();
      if (trimmed.startsWith('}') || trimmed.startsWith('];') || trimmed.startsWith('),')) {
        indent = Math.max(indent - 1, 0);
      }
      const padded = '  '.repeat(indent) + trimmed;
      if (trimmed.endsWith('{')) {
        indent += 1;
      }
      return padded;
    })
    .join('\n');

  const summary = [];
  if (code.includes('var ')) {
    summary.push('Replaced var with let for block scoping.');
  }
  if (/==[^=]/.test(code)) {
    summary.push('Enforced strict equality.');
  }

  return {
    code: formatted.trimEnd() + '\n',
    summary: summary.length ? summary : ['Formatted code for consistency.'],
  };
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}
