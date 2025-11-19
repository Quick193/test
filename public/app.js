const runBtn = document.getElementById('run-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const autoFixBtn = document.getElementById('autofix-btn');
const logsEl = document.getElementById('logs');
const errorsEl = document.getElementById('errors');
const durationEl = document.getElementById('duration');
const explanationEl = document.getElementById('explanation');
const issuesEl = document.getElementById('issues');
const suggestionsEl = document.getElementById('suggestions');
const stdinEl = document.getElementById('stdin');
const statusBar = document.getElementById('status-bar');

let editor;

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
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
    });
  });
} else {
  fallbackEditor();
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

async function runCode() {
  toggleBusy(runBtn, true);
  setStatus('Executing in sandbox...', '');
  try {
    const payload = {
      code: editor.getValue(),
      input: stdinEl.value,
    };
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Execution failed');
    renderExecution(data);
    setStatus('Execution completed successfully.', 'success');
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
    const payload = { code: editor.getValue() };
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
      body: JSON.stringify({ code: editor.getValue() }),
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
