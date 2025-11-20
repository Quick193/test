const runBtn = document.getElementById('run-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const autoFixBtn = document.getElementById('autofix-btn');
const saveBtn = document.getElementById('save-btn');
const refreshFilesBtn = document.getElementById('refresh-files-btn');
const logsEl = document.getElementById('logs');
const errorsEl = document.getElementById('errors');
const durationEl = document.getElementById('duration');
const explanationEl = document.getElementById('explanation');
const issuesEl = document.getElementById('issues');
const suggestionsEl = document.getElementById('suggestions');
const stdinEl = document.getElementById('stdin');
const statusBar = document.getElementById('status-bar');
const fileTreeEl = document.getElementById('file-tree');
const newFileBtn = document.getElementById('new-file-btn');
const createFileForm = document.getElementById('create-file-form');
const createFileConfirm = document.getElementById('create-file-confirm');
const createFileCancel = document.getElementById('create-file-cancel');
const newFileName = document.getElementById('new-file-name');
const newFileTemplate = document.getElementById('new-file-template');
const activeTab = document.getElementById('active-file-tab');

let editor;
let currentFilePath = 'main.js';
let currentLanguage = 'javascript';

const requireConfig = {
  paths: {
    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs',
  },
};

if (window.require) {
  window.require.config(requireConfig);
  window.require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(document.getElementById('editor'), {
      value: window.__INITIAL_CODE__ || '',
      language: currentLanguage,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
    });
    bootstrapWorkspace();
  });
} else {
  fallbackEditor();
  bootstrapWorkspace();
}

function fallbackEditor() {
  const textarea = document.createElement('textarea');
  textarea.value = window.__INITIAL_CODE__ || '';
  textarea.className = 'fallback-editor';
  textarea.addEventListener('input', () => {
    textarea.value = textarea.value;
  });
  document.getElementById('editor').appendChild(textarea);
  editor = {
    getValue: () => textarea.value,
    setValue: value => {
      textarea.value = value;
    },
  };
}

runBtn.addEventListener('click', () => runCode());
analyzeBtn.addEventListener('click', () => analyzeCode());
autoFixBtn.addEventListener('click', () => autoFix());
saveBtn.addEventListener('click', () => saveFile());
refreshFilesBtn.addEventListener('click', () => loadFileTree());
newFileBtn.addEventListener('click', () => toggleCreateFile(true));
createFileCancel.addEventListener('click', () => toggleCreateFile(false));
createFileConfirm.addEventListener('click', () => createFile());

async function runCode() {
  toggleBusy(runBtn, true);
  setStatus(`Executing ${currentFilePath}...`, '');
  try {
    const payload = {
      code: editor.getValue(),
      input: stdinEl.value,
      path: currentFilePath,
      language: currentLanguage,
    };
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Execution failed');
    renderExecution(data);
    setStatus(`Executed ${currentLanguage.toUpperCase()} successfully.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    toggleBusy(runBtn, false);
  }
}

async function analyzeCode() {
  toggleBusy(analyzeBtn, true);
  setStatus('Generating explanations and suggestions...', '');
  try {
    const payload = { code: editor.getValue(), path: currentFilePath, language: currentLanguage };
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed');
    renderAnalysis(data);
    setStatus('Analysis ready.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    toggleBusy(analyzeBtn, false);
  }
}

async function autoFix() {
  toggleBusy(autoFixBtn, true);
  setStatus('Applying automated fixes...', '');
  try {
    const response = await fetch('/api/autofix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: editor.getValue(), path: currentFilePath, language: currentLanguage }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Auto fix failed');
    editor.setValue(data.code);
    renderAnalysis({ explanation: 'Code refreshed with automatic fixes.', issues: [], suggestions: data.summary || [] });
    setStatus('Auto-fix applied.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    toggleBusy(autoFixBtn, false);
  }
}

function renderExecution(data) {
  logsEl.textContent = (data.logs || []).join('\n') || 'No logs produced.';
  errorsEl.textContent = (data.errors || []).join('\n') || 'No runtime errors.';
  durationEl.textContent = data.duration ? `${data.duration}ms` : '—';
}

function renderAnalysis(data) {
  explanationEl.textContent = data.explanation || 'No explanation available yet.';
  populateList(issuesEl, data.issues, 'No issues detected.');
  populateList(suggestionsEl, data.suggestions, 'No suggestions available.');
}

function populateList(listEl, items = [], emptyText) {
  listEl.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = emptyText;
    li.className = 'muted';
    listEl.appendChild(li);
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function toggleBusy(button, isBusy) {
  button.disabled = isBusy;
  button.classList.toggle('loading', isBusy);
}

function setStatus(message, state) {
  statusBar.textContent = message || '';
  statusBar.className = `status-bar${state ? ` ${state}` : ''}`;
}

function toggleCreateFile(show) {
  createFileForm.hidden = !show;
  if (show) {
    newFileName.focus();
  } else {
    newFileName.value = '';
  }
}

async function createFile() {
  if (!newFileName.value.trim()) {
    setStatus('Provide a file name.', 'error');
    return;
  }
  const template = newFileTemplate.value;
  const starter = getTemplate(template);
  const payload = { path: newFileName.value.trim(), content: starter };
  toggleBusy(createFileConfirm, true);
  try {
    const response = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to create file');
    toggleCreateFile(false);
    await loadFileTree();
    await openFile(payload.path);
    setStatus(`Created ${payload.path}`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    toggleBusy(createFileConfirm, false);
  }
}

async function loadFileTree() {
  fileTreeEl.innerHTML = '<li class="muted">Loading...</li>';
  try {
    const response = await fetch('/api/files');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load files');
    renderTree(data.files || []);
  } catch (error) {
    fileTreeEl.innerHTML = `<li class="muted">${error.message}</li>`;
  }
}

function renderTree(nodes = []) {
  fileTreeEl.innerHTML = '';
  nodes.forEach(node => {
    const el = buildNode(node, 0);
    fileTreeEl.appendChild(el);
  });
}

function buildNode(node, depth) {
  const li = document.createElement('li');
  li.style.paddingLeft = `${depth * 12}px`;
  li.dataset.path = node.path;
  li.className = node.type === 'dir' ? 'dir' : node.path === currentFilePath ? 'active-file' : '';
  const label = document.createElement('span');
  label.textContent = `${node.type === 'dir' ? '📁' : '📄'} ${node.name}`;
  label.addEventListener('click', () => {
    if (node.type === 'file') {
      openFile(node.path);
    }
  });
  li.appendChild(label);

  if (node.children && node.children.length) {
    node.children.forEach(child => li.appendChild(buildNode(child, depth + 1)));
  }
  return li;
}

async function openFile(path) {
  setStatus(`Opening ${path}...`, '');
  try {
    const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to read file');
    currentFilePath = data.path;
    currentLanguage = languageFromPath(currentFilePath);
    setEditorLanguage(currentLanguage);
    editor.setValue(data.content || '');
    activeTab.textContent = currentFilePath;
    highlightActiveFile();
    setStatus(`Loaded ${currentFilePath}`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function highlightActiveFile() {
  [...fileTreeEl.querySelectorAll('li')].forEach(li => {
    li.classList.toggle('active-file', li.dataset.path === currentFilePath);
  });
}

async function saveFile() {
  if (!currentFilePath) return setStatus('No active file to save.', 'error');
  toggleBusy(saveBtn, true);
  try {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFilePath, content: editor.getValue() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Save failed');
    setStatus(`Saved ${currentFilePath}`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    toggleBusy(saveBtn, false);
  }
}

function getTemplate(type) {
  switch (type) {
    case 'python':
      return 'def main():\n    name = input() or "world"\n    print(f"Hello, {name}!")\n\nif __name__ == "__main__":\n    main()\n';
    case 'java':
      return 'public class Main {\n  public static void main(String[] args) throws Exception {\n    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));\n    String name = reader.readLine();\n    if (name == null || name.isBlank()) name = "world";\n    System.out.println("Hello, " + name + "!");\n  }\n}\n';
    case 'markdown':
      return '# New Note\n\nDocument your ideas here.\n';
    case 'text':
      return '';
    default:
      return '"use strict";\n\nconst name = readLine();\nconsole.log(`Hello, ${name}!`);\n';
  }
}

function languageFromPath(pathname = '') {
  if (pathname.endsWith('.py')) return 'python';
  if (pathname.endsWith('.java')) return 'java';
  if (pathname.endsWith('.md')) return 'markdown';
  return 'javascript';
}

function setEditorLanguage(language) {
  if (window.monaco && editor.getModel) {
    monaco.editor.setModelLanguage(editor.getModel(), language === 'markdown' ? 'markdown' : language);
  }
}

function bootstrapWorkspace() {
  loadFileTree().then(() => {
    const firstFile = fileTreeEl.querySelector('li[data-path]:not(.dir)');
    const target = firstFile ? firstFile.dataset.path : currentFilePath;
    openFile(target);
  });
}
