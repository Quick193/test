# Mini IDE

A lightweight, single-node mini IDE that lets you write, execute, analyze, and auto-fix JavaScript directly in your browser. The editor runs entirely on the server provided in this repository—no external build tooling needed.

## Features

- 🧑‍💻 **VS Code-like editing** powered by the Monaco editor (with a textarea fallback when offline).
- ▶️ **Sandboxed execution** using Node's `vm` module with input support via `readLine()` / `getInput()`.
- 🤖 **AI-inspired insights** that summarize the code, highlight risky patterns, and recommend improvements.
- 🛠️ **One-click auto-fix/refactor** that enforces modern JavaScript conventions (strict equality, `let` instead of `var`, indentation cleanup).

## Getting started

```bash
npm install  # not strictly required, but keeps npm scripts available
npm start    # serves the app on http://localhost:3000
```

Then open `http://localhost:3000` in your browser. Use the controls in the header to run code, request AI insights, or apply automatic fixes. Provide multi-line program input inside the **Program input** panel; retrieve it inside your code with `readLine()`.

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

- The sandbox currently targets synchronous JavaScript. Async functions can be authored, but they resolve immediately with a notice.
- The "AI" analysis is rule-based so it always works offline while still providing helpful diagnostics.
- Static assets pull fonts and Monaco from public CDNs. When offline, the textarea fallback ensures you can still edit and run code.
