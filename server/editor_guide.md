# THE MASTER'S GUIDE TO THE CAVEMAN EDITOR
Behold, the secrets of the interface. This scroll documents the tools, formatting syntax, and architectural capabilities at your disposal.

[line]

## 📁 Folders as Paths
The **FOLDER/** field is more than a name; it is the path to your knowledge.
- Use `/` to create deep folder hierarchies (e.g., `GAMES/ZOMBOID/MODS` or `PROJECTS/ENGINE/WASM`).
- Folders are **case-insensitive**. `Work` resolves to the same path as `WORK`.
- Typing a new path automatically creates the nested folders in your sidebar.

[line]

## ✒️ Typography: Bold, Italic & Clean Headers
Brutalist typography is sharp and intentional:
- **Bold**: Wrap text with `**bold**` or `__bold__`. Bold text has crisp weight with **no bottom line**.
- **Italic**: Wrap text with `*italic*` or `_italic_`.
- **Both**: Combine both with `***bold italic***` or `_**bold italic**_`.
- **Headers**: Use `# H1`, `## H2`, `### H3`, etc.
  - Headers are **clean by default**: no automatic bottom borders or underlines clutter your text.

[line]

## 📏 Explicit Liners & Underline
Liners and underlines are strictly opt-in:
- **Section Liners**: Use `[liner]`, `[line]`, `[divider]`, or standard markdown `---` on an empty line.
- **Header Liners**: To attach a bottom liner to a header, add `[liner]` at the end of the line:
  `## Section Title [liner]`
- **Text Underline**: When you explicitly want an underline, use `[u]underlined text[/u]` or `<u>underlined text</u>`.

[line]

## 🔍 Simple Text Sizing: [size=...]
Change font sizes directly without writing verbose HTML or CSS:
- `[size=20]20px Text[/size]`
- `[size=14]Small notes and annotations[/size]`
- `[size=28]Large bold statement[/size]`
- Also supports units: `[size=1.5em]Relative scaling[/size]`, `[size=24px]Explicit pixels[/size]`.
- Unclosed size tags at the end of a line automatically apply to the line end without breaking the document.

[line]

## 🎨 Interactive Color Macros
Highlight text with vibrant accents:
- Syntax: `[color=#ff7800]Golden text[/color]`
- **Clickable Color Swatch**: Whenever a `[color=...]` tag appears in the editor, an interactive color swatch appears directly inline. Click it to open the real-time palette and fine-tune your hexadecimal color!

[line]

## 📐 Vector Sketches & Canvas Blocks
Embed vector drawings directly between your paragraphs:
- Syntax: `[sketch:diagram 500 300]` (width 500px, height 300px).
- **Interactive Sketch Tools**: Pencil, straight lines, rectangles, ellipses, eraser, color choices, undo (`Ctrl+Z`), redo (`Ctrl+Y`), and clear.
- **Line Calculation Engine**: Sketches accurately calculate the exact number of blank spacer lines needed (e.g. 100px = 7 lines, 300px = 15 lines, 500px = 24 lines).
- **Fast Navigation**:
  - Press `↓ ArrowDown` on a sketch tag or hidden line to jump past the sketch directly to the text below.
  - Press `↑ ArrowUp` from below to jump directly back to the sketch tag.
  - Use the widget header buttons: `[100]`, `[300]`, `[500]` for 1-click height presets, and `▲ Tag` / `▼ Text` for instant jumping.

[line]

## 🔽 Section Folding & Outlining
Keep massive documents compact and readable:
- Click the chevron arrow in the editor gutter next to any `# Header` to collapse its entire subsection.
- Click again or use the fold marker to expand it.

[line]

## 💻 Code Blocks & Syntax Highlighting
Fenced code blocks are styled with rich syntax coloring:
```javascript
// Supports javascript, typescript, python, css, html, json, lua, diff, markdown
function activateEngine() {
  console.log("C++ WASM Core active!");
}
```

[line]

## 🧮 Math & KaTeX Formulae
Typeset mathematical formulas with LaTeX syntax:
- **Inline**: `$E = mc^2$`
- **Display Block**:
  $$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$

[line]

## 🔗 Bidirectional Links & Knowledge Graph
- Link notes using `[[Note Title]]`.
- In **View Mode**, click any link to travel to that note. If it doesn't exist, you'll be prompted to create it.
- Click **GRAPH** in the top navigation bar to inspect your note network in 2D space.

[line]

## 🎨 Canvas Mode & Visual Maps
Switch to **CANVAS** in the top bar for visual node mapping:
- **Double-click** anywhere to plant a node.
- **Drag the small handle** on any box to link it to another node with an arrow.
- **Peek**: Click the eye icon on a linked card to view note contents without leaving the canvas.

[line]

## ⚙️ Running Scripts & HTML
- **HTML & CSS**: You can freely use standard HTML tags (`<div>`, `<span>`, `<table>`, `<details>`, `<kbd>`) and inline styles in your notes.
- **JavaScript Scripts**: Raw `<script>` tags inside notes do not run in the document view. This follows standard HTML5 security rules (`innerHTML` script prevention) so that notes remain deterministic and cannot inject infinite loops or corrupt the editor state.
- **Code Fences**: Code blocks with ````js` provide syntax-highlighted code display for reading, copying, and archiving scripts.

[line]

## 🛡️ The Native Engine & Architecture
- **Incremental Line Diffing**: The native C++ / WASM engine computes linear diff intervals, ensuring the editor remains responsive even on 80,000-word scrolls.
- **Zero-Bloat**: Built entirely with pure standard HTML, CSS, and modern JavaScript—no framework overhead.

[line]

*Keep your flint sharp, your knowledge structured, and your scrolls organized.*
