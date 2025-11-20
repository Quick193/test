# Mini IDE

A lightweight, single-node mini IDE that lets you write, execute, analyze, and auto-fix JavaScript, Python, and Java directly in your browser. The editor runs entirely on the server provided in this repository—no external build tooling needed.

## Features

- 🧑‍💻 **VS Code-like editing** powered by the Monaco editor (with a textarea fallback when offline) plus a live file explorer.
- ▶️ **Sandboxed execution** for JavaScript (via Node `vm`), Python, and Java with stdin support (`readLine()` in JS or `input()` / `System.in`).
- 📁 **File tree & templates** to browse, create, and save files (JS, Python, Java, Markdown, text) inside the workspace folder.
- 🤖 **AI-inspired insights** that summarize the code, highlight risky patterns, and recommend improvements across JS, Python, and Java.
- 🛠️ **One-click auto-fix/refactor** tailored to the detected language to smooth indentation, scoping, and logging conventions.

## Getting started

```bash
npm install  # not strictly required, but keeps npm scripts available
npm start    # serves the app on http://localhost:3000
```

Then open `http://localhost:3000` in your browser. Use the explorer to select or create files, then use the header controls to run code, request AI insights, or apply automatic fixes. Provide multi-line program input inside the **Program input** panel; retrieve it inside your code with `readLine()`, `input()`, or Java's stdin utilities.

## Project layout

```
.
├── public
│   ├── index.html   # UI shell + Monaco loader
│   ├── styles.css   # Layout and visual design
│   └── app.js       # Client logic (runs/analysis/autofix wiring)
├── server.js        # HTTP server + sandbox, analysis, and auto-fix endpoints
└── package.json     # npm metadata and start script
```

## Notes

- Java execution expects a `Main` class; templates are provided to get started quickly.
- The "AI" analysis is rule-based so it always works offline while still providing helpful diagnostics.
- Static assets pull fonts and Monaco from public CDNs. When offline, the textarea fallback ensures you can still edit and run code.
