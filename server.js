import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import vm from 'vm';
import { spawn, exec as execCb } from 'child_process';
import os from 'os';

const exec = (command, options = {}) =>
  new Promise((resolve, reject) => {
    execCb(command, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const workspaceDir = path.join(__dirname, 'workspace');

bootstrapWorkspace();

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = normalizePath(parsedUrl.pathname);

  if (req.method === 'POST' && pathname === '/api/run') {
    return handleRun(req, res);
  }
  if (req.method === 'POST' && pathname === '/api/analyze') {
    return handleAnalyze(req, res);
  }
  if (req.method === 'POST' && pathname === '/api/autofix') {
    return handleAutoFix(req, res);
  }
  if (req.method === 'GET' && pathname === '/api/files') {
    return handleListFiles(res);
  }
  if (req.method === 'GET' && pathname === '/api/file') {
    return handleReadFile(parsedUrl, res);
  }
  if (req.method === 'POST' && pathname === '/api/files') {
    return handleCreateFile(req, res);
  }
  if (req.method === 'POST' && pathname === '/api/save') {
    return handleSaveFile(req, res);
  }
  if (pathname.startsWith('/api')) {
    return json(res, 404, { error: 'Not found' });
  }
  serveStatic(req, parsedUrl, res);
});

server.listen(PORT, () => {
  console.log(`Mini IDE server running on http://localhost:${PORT}`);
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
    const { code = '', input = '', path: filePath, language } = JSON.parse(body || '{}');
    const result = await executeCode({ code, input, filePath, language });
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = await collectBody(req);
    const { code = '', language, path: filePath } = JSON.parse(body || '{}');
    const analysis = analyzeCode(code, language || detectLanguage(filePath));
    json(res, 200, analysis);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

async function handleAutoFix(req, res) {
  try {
    const body = await collectBody(req);
    const { code = '', language, path: filePath } = JSON.parse(body || '{}');
    const lang = language || detectLanguage(filePath);
    const result = autoFixCode(code, lang);
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

function handleListFiles(res) {
  json(res, 200, { root: path.basename(workspaceDir), files: readTree(workspaceDir) });
}

function handleReadFile(parsedUrl, res) {
  const filePath = parsedUrl.searchParams.get('path');
  if (!filePath) {
    return json(res, 400, { error: 'Missing file path' });
  }
  const diskPath = toWorkspacePath(filePath);
  fs.readFile(diskPath, 'utf8', (err, content) => {
    if (err) return json(res, 404, { error: 'File not found' });
    json(res, 200, { path: filePath, content });
  });
}

async function handleCreateFile(req, res) {
  try {
    const body = await collectBody(req);
    if (!body) return json(res, 400, { error: 'Missing request body' });
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return json(res, 400, { error: 'Invalid JSON payload' });
    }
    const { path: filePath, content = '' } = payload || {};
    if (!filePath) return json(res, 400, { error: 'Missing file path' });
    const diskPath = toWorkspacePath(filePath);
    await fs.promises.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.promises.writeFile(diskPath, content, 'utf8');
    json(res, 201, { message: 'File created', path: filePath });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

async function handleSaveFile(req, res) {
  try {
    const body = await collectBody(req);
    if (!body) return json(res, 400, { error: 'Missing request body' });
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return json(res, 400, { error: 'Invalid JSON payload' });
    }
    const { path: filePath, content = '' } = payload || {};
    if (!filePath) return json(res, 400, { error: 'Missing file path' });
    const diskPath = toWorkspacePath(filePath);
    await fs.promises.writeFile(diskPath, content, 'utf8');
    json(res, 200, { message: 'Saved', path: filePath });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

function serveStatic(req, parsedUrl, res) {
  let filePath = path.join(publicDir, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  if (!filePath.startsWith(publicDir)) {
    if (wantsJson(req)) return json(res, 403, { error: 'Forbidden' });
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
      if (wantsJson(req)) return json(res, 404, { error: 'Not found' });
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function executeCode({ code, input, filePath, language }) {
  const logs = [];
  const errors = [];
  const start = Date.now();
  const lang = language || detectLanguage(filePath);

  if (lang === 'python') {
    const { stdout, stderr } = await runPython(code, input);
    logs.push(...splitLines(stdout));
    if (stderr) errors.push(...splitLines(stderr));
    return { logs, errors, duration: Date.now() - start, language: lang };
  }

  if (lang === 'java') {
    const { stdout, stderr } = await runJava(code, input);
    logs.push(...splitLines(stdout));
    if (stderr) errors.push(...splitLines(stderr));
    return { logs, errors, duration: Date.now() - start, language: lang };
  }

  return await runJavaScript(code, input, { logs, errors, start, language: lang });
}

function analyzeCode(code, language = 'javascript') {
  const lines = code.split(/\r?\n/);
  const functions = [];
  const issues = [];
  const suggestions = [];
  const languageLabel = (language || 'javascript').toLowerCase();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (languageLabel === 'javascript') {
      const fnMatch = trimmed.match(/function\s+(\w+)/);
      if (fnMatch) functions.push(`${fnMatch[1]} (line ${index + 1})`);
      const arrowMatch = trimmed.match(/const\s+(\w+)\s*=\s*\(/);
      if (arrowMatch) functions.push(`${arrowMatch[1]} (line ${index + 1})`);
      if (/==[^=]/.test(trimmed)) suggestions.push(`Line ${index + 1}: use strict equality (===) instead of ==.`);
      if (/eval\s*\(/.test(trimmed)) issues.push(`Avoid eval usage on line ${index + 1}.`);
      if (/console\.log\(/.test(trimmed) && !/DEBUG/.test(trimmed)) {
        suggestions.push(`Line ${index + 1}: gate console.log behind debug flags.`);
      }
    }

    if (languageLabel === 'python') {
      const pyFn = trimmed.match(/def\s+(\w+)/);
      if (pyFn) functions.push(`def ${pyFn[1]} (line ${index + 1})`);
      if (/print\(/.test(trimmed)) suggestions.push(`Line ${index + 1}: replace debug prints with logging.`);
      if (/except\s*:\s*$/.test(trimmed)) issues.push(`Line ${index + 1}: catch specific exceptions instead of bare except.`);
      if (/while\s+True\s*:/.test(trimmed)) issues.push(`Potential infinite loop on line ${index + 1}`);
    }

    if (languageLabel === 'java') {
      const javaMethod = trimmed.match(/void\s+(main|\w+)\s*\(/);
      if (javaMethod) functions.push(`Method ${javaMethod[1]} (line ${index + 1})`);
      if (/System\.out\.println/.test(trimmed)) suggestions.push(`Line ${index + 1}: replace println with a logger.`);
      if (/catch\s*\(Exception/.test(trimmed)) issues.push(`Line ${index + 1}: avoid catching base Exception; catch precise types.`);
    }

    if (/while\s*\(true\)/i.test(trimmed)) issues.push(`Potential infinite loop on line ${index + 1}`);
    if (/TODO|FIXME/.test(trimmed)) suggestions.push(`Line ${index + 1}: resolve TODO/FIXME comments.`);
    if (/\bconsole\.error\(|throw\s+new\s+Error/.test(trimmed)) {
      suggestions.push(`Line ${index + 1}: ensure errors are surfaced with context and metrics.`);
    }
    if (/^\s{8,}\S/.test(line)) {
      suggestions.push(`Line ${index + 1}: consider reducing nesting depth for readability.`);
    }
  });

  if (languageLabel === 'javascript' && !/use\s+strict/.test(code)) {
    suggestions.push('Enable strict mode for safer JavaScript execution.');
  }

  if (languageLabel === 'python' && !/if __name__ == ['"]__main__['"]:/.test(code)) {
    suggestions.push('Guard entrypoint with if __name__ == "__main__" for script usage.');
  }

  if (languageLabel === 'java' && !/public class/.test(code)) {
    suggestions.push('Ensure the file declares a public class matching the filename.');
  }

  const explanation = functions.length
    ? `Detected ${functions.length} routine(s): ${functions.join(', ')}.`
    : `No named routines detected in ${languageLabel} file; consider modularizing for clarity.`;

  const lintedSuggestions = suggestions.filter(Boolean);
  return { explanation, issues, suggestions: lintedSuggestions, language: languageLabel };
}

function autoFixCode(code, language = 'javascript') {
  const lang = (language || 'javascript').toLowerCase();
  if (lang === 'python') return autoFixPython(code);
  if (lang === 'java') return autoFixJava(code);
  return autoFixJavaScript(code);
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

function wantsJson(req) {
  const accept = req.headers['accept'] || '';
  return accept.includes('application/json') || req.url.startsWith('/api');
}

function normalizePath(pathname = '') {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '');
  }
  return pathname || '/';
}

function toWorkspacePath(relativePath) {
  const sanitized = relativePath.replace(/^\/+/, '');
  const full = path.join(workspaceDir, sanitized);
  if (!full.startsWith(workspaceDir)) {
    throw new Error('Invalid file path');
  }
  return full;
}

function readTree(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.map(entry => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return { type: 'dir', name: entry.name, path: path.relative(workspaceDir, fullPath), children: readTree(fullPath) };
    }
    return { type: 'file', name: entry.name, path: path.relative(workspaceDir, fullPath) };
  });
}

function detectLanguage(filePath = '') {
  if (filePath.endsWith('.py')) return 'python';
  if (filePath.endsWith('.java')) return 'java';
  if (filePath.endsWith('.md')) return 'markdown';
  return 'javascript';
}

function splitLines(text = '') {
  return text.trim().length ? text.trimEnd().split(/\r?\n/) : [];
}

async function runJavaScript(code, input, { logs, errors, start, language }) {
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
  try {
    const result = script.runInContext(context, { timeout: 1000 });
    if (result && typeof result.then === 'function') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      await Promise.race([result, new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Execution timeout'))))]);
      clearTimeout(timeout);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return { logs, errors, duration: Date.now() - start, language: language || 'javascript' };
}

async function runPython(code, input) {
  const tempFile = path.join(os.tmpdir(), `mini-ide-${Date.now()}.py`);
  await fs.promises.writeFile(tempFile, code, 'utf8');
  const proc = spawn('python3', [tempFile]);
  const output = { stdout: '', stderr: '' };
  let errored = false;
  proc.on('error', err => {
    errored = true;
    output.stderr += err.message;
  });
  proc.stdin.write(input);
  proc.stdin.end();
  proc.stdout.on('data', chunk => (output.stdout += chunk.toString()));
  proc.stderr.on('data', chunk => (output.stderr += chunk.toString()));
  const exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(-1);
    }, 3000);
    proc.on('close', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if ((exitCode !== 0 || errored) && output.stderr.trim().length === 0) {
    output.stderr = 'Process terminated or exited with errors.';
  }
  return output;
}

async function runJava(code, input) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mini-ide-java-'));
  const javaFile = path.join(tempDir, 'Main.java');
  await fs.promises.writeFile(javaFile, code, 'utf8');
  try {
    await exec(`javac Main.java`, { cwd: tempDir, timeout: 3000 });
  } catch (error) {
    return { stdout: '', stderr: `Compilation failed:\n${error.stderr || error.message}` };
  }

  const proc = spawn('java', ['-cp', tempDir, 'Main'], { cwd: tempDir });
  const output = { stdout: '', stderr: '' };
  let errored = false;
  proc.on('error', err => {
    errored = true;
    output.stderr += err.message;
  });
  proc.stdin.write(input);
  proc.stdin.end();
  proc.stdout.on('data', chunk => (output.stdout += chunk.toString()));
  proc.stderr.on('data', chunk => (output.stderr += chunk.toString()));
  const exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve(-1);
    }, 4000);
    proc.on('close', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if ((exitCode !== 0 || errored) && output.stderr.trim().length === 0) {
    output.stderr = 'Process terminated or exited with errors.';
  }
  return output;
}

function autoFixJavaScript(code) {
  let updated = code.replace(/\bvar\b/g, 'let');
  updated = updated
    .replace(/([^!<>=])==([^=])/g, (match, left, right) => `${left} === ${right.trimStart()}`)
    .replace(/!=([^=])/g, (match, right) => `!== ${right.trimStart()}`)
    .replace(/console\.log\(/g, '// console.log(');

  const lines = updated.split(/\r?\n/);
  let indent = 0;
  const formatted = lines
    .map(line => {
      let trimmed = line.trim();
      if (/^[}\])]/.test(trimmed)) indent = Math.max(indent - 1, 0);
      const padded = '  '.repeat(indent) + trimmed;
      if (/[{[(]\s*$/.test(trimmed)) indent += 1;
      if (trimmed && !/[;{[(]$/.test(trimmed) && !/^(if|for|while|else|switch|return|class)\b/.test(trimmed)) {
        return padded + ';';
      }
      return padded;
    })
    .join('\n');

  const summary = [];
  if (code.includes('var ')) summary.push('Replaced var with let for block scoping.');
  if (/==[^=]/.test(code)) summary.push('Enforced strict equality.');
  summary.push('Applied light formatting and silenced console logs.');

  return { code: formatted.trimEnd() + '\n', summary };
}

function autoFixPython(code) {
  const lines = code.split(/\r?\n/);
  const fixed = lines
    .map(line => line.replace(/\t/g, '    '))
    .map(line => (/print\(/.test(line) ? `# DEBUG: ${line}` : line))
    .join('\n');
  const summary = ['Converted tabs to spaces.', 'Prefixed debug prints for clarity.'];
  if (!/if __name__ == ['"]__main__['"]:/.test(code)) {
    summary.push('Consider adding a __main__ guard for script entrypoints.');
  }
  return { code: fixed.trimEnd() + '\n', summary };
}

function autoFixJava(code) {
  const lines = code.split(/\r?\n/);
  const fixed = lines
    .map(line => line.replace(/System\.out\.println/g, 'System.out.printf'))
    .map(line => line.replace(/\t/g, '  '))
    .join('\n');
  const summary = ['Replaced println with printf for structured output.', 'Normalized indentation.'];
  if (!/public class/.test(code)) summary.push('Add a public class named Main for execution.');
  return { code: fixed.trimEnd() + '\n', summary };
}

function bootstrapWorkspace() {
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }
  const seeds = [
    {
      path: 'main.js',
      content: `"use strict";\n\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconst input = readLine();\nconsole.log(greet(input || 'world'));\n`,
    },
    {
      path: 'main.py',
      content: `def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nif __name__ == "__main__":\n    import sys\n    name = sys.stdin.readline().strip() or "world"\n    print(greet(name))\n`,
    },
    {
      path: 'Main.java',
      content: `public class Main {\n  public static String greet(String name) {\n    return "Hello, " + name + "!";\n  }\n\n  public static void main(String[] args) throws Exception {\n    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));\n    String name = reader.readLine();\n    if (name == null || name.isBlank()) name = "world";\n    System.out.println(greet(name));\n  }\n}\n`,
    },
  ];

  seeds.forEach(seed => {
    const seedPath = path.join(workspaceDir, seed.path);
    if (!fs.existsSync(seedPath)) {
      fs.mkdirSync(path.dirname(seedPath), { recursive: true });
      fs.writeFileSync(seedPath, seed.content, 'utf8');
    }
  });
}
