// ==============================================================================
// BRUTALIST FAST MARKDOWN & NOTE WASM DRIVER (OOP ARCHITECTURE)
// Native C++ binary core running in WebAssembly linear memory with 
// localized incremental diffing and heading boundary resolution.
// ==============================================================================

/**
 * Incremental Line Diff Engine (Feature 3)
 * Calculates minimal dirty line intervals [startLine, newEndLine]
 * avoiding full-document O(N) reprocessing on single keystrokes.
 */
export class IncrementalDiffEngine {
  findLineDiff(prevLines, newLines) {
    if (!prevLines || !Array.isArray(prevLines) || prevLines.length === 0) {
      return { isFull: true, startLine: 0, oldEndLine: 0, newEndLine: newLines ? newLines.length : 0 };
    }
    if (!newLines || !Array.isArray(newLines)) {
      return { isFull: true, startLine: 0, oldEndLine: prevLines.length, newEndLine: 0 };
    }

    const prevLen = prevLines.length;
    const newLen = newLines.length;

    // 1. Scan common prefix from start
    let p = 0;
    while (p < prevLen && p < newLen && prevLines[p] === newLines[p]) {
      p++;
    }

    // Identical buffers
    if (p === prevLen && p === newLen) {
      return { isFull: false, changed: false, startLine: 0, oldEndLine: 0, newEndLine: 0 };
    }

    // 2. Scan common suffix from end
    let s = 0;
    while (s < (prevLen - p) && s < (newLen - p) && prevLines[prevLen - 1 - s] === newLines[newLen - 1 - s]) {
      s++;
    }

    const oldEndLine = prevLen - s;
    const newEndLine = newLen - s;

    return {
      isFull: false,
      changed: true,
      startLine: p,
      oldEndLine: oldEndLine,
      newEndLine: newEndLine,
      addedLines: newEndLine - p,
      removedLines: oldEndLine - p
    };
  }
}

/**
 * Heading & Fold Boundary Engine (Feature 1)
 * Resolves header hierarchy and fold spans in linear zero-allocation passes.
 */
export class HeadingFoldEngine {
  getHeadingLevel(line) {
    if (!line) return 0;
    const match = line.match(/^(\s*#{1,6})\s+/);
    return match ? match[1].trim().length : 0;
  }

  getFoldRange(lines, lineIndex) {
    if (!lines || lineIndex < 0 || lineIndex >= lines.length) return null;
    const headerLine = lines[lineIndex];
    const level = this.getHeadingLevel(headerLine);
    if (level === 0) return null;

    let endIndex = lineIndex + 1;
    const total = lines.length;
    while (endIndex < total) {
      const nextLine = lines[endIndex];
      const nextLevel = this.getHeadingLevel(nextLine);
      if (nextLevel > 0 && nextLevel <= level) {
        break;
      }
      endIndex++;
    }

    const foldLinesCount = endIndex - (lineIndex + 1);
    return {
      startIndex: lineIndex + 1,
      endIndex: endIndex,
      count: foldLinesCount,
      isFoldable: foldLinesCount > 0
    };
  }

  isFoldMarker(line) {
    if (!line) return false;
    const trimmed = line.trim();
    return trimmed.startsWith('<!--') && trimmed.includes('FOLD:') && trimmed.endsWith('-->');
  }
}

/**
 * Fast Tokenizer (Feature 4)
 * High speed lexical scanner for inline tokens and styling.
 */
export class FastTokenizer {
  tokenizeLine(line) {
    if (!line) return [];
    const tokens = [];
    const len = line.length;
    let i = 0;

    while (i < len) {
      // Wikilink [[note]]
      if (line[i] === '[' && i + 1 < len && line[i + 1] === '[') {
        const closeIdx = line.indexOf(']]', i + 2);
        if (closeIdx !== -1) {
          tokens.push({ type: 'wikilink', start: i, end: closeIdx + 2, raw: line.substring(i, closeIdx + 2) });
          i = closeIdx + 2;
          continue;
        }
      }
      // Color macro [color=#...]
      if (line[i] === '[' && line.startsWith('[color=', i)) {
        const closeIdx = line.indexOf(']', i + 7);
        if (closeIdx !== -1) {
          tokens.push({ type: 'color_macro', start: i, end: closeIdx + 1, raw: line.substring(i, closeIdx + 1) });
          i = closeIdx + 1;
          continue;
        }
      }
      // Fold marker
      if (line[i] === '<' && line.startsWith('<!--', i) && line.includes('FOLD:', i)) {
        const closeIdx = line.indexOf('-->', i + 4);
        if (closeIdx !== -1) {
          tokens.push({ type: 'fold_marker', start: i, end: closeIdx + 3, raw: line.substring(i, closeIdx + 3) });
          i = closeIdx + 3;
          continue;
        }
      }
      i++;
    }
    return tokens;
  }
}

// Prebuilt embedded binary fallback (ensures 100% offline & local file:// support)
const PREBUILT_WASM_BASE64 = "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IAtKDQAgESAUai0AAEHjAEcNACAQQQJqLQAAQe8ARw0AIBBBA2otAABB7ABHDQAgEEEEai0AAEHvAEcNACAQQQVqLQAAQfIARw0AIBBBBmotAABBPUcNACANIAtODQAgESANai0AAEEjRw0AQQAhDQJAAkACQCAAQQhqIhcgC0gNAEEAIRQMAQsgCiAXaiEYIBUgAGshGUEAIRRBACENAkADQAJAIBggFGpBgIiAgABqLQAAIhZBUGoiEEH/AXFBCU0NAAJAIBZBn39qQf8BcUEFSw0AIBZBqX9qIRAMAQsgFkG/f2pB/wFxQQVLDQIgFkFJaiEQCyAQQQBIDQEgECANQQR0ciANIBRBBkkbIQ0gGSAUQQFqIhRHDQALIAsgAGshECALIRcMAgsgFyAUaiEXCyAXIABrIRACQCAXIAtODQAgESAXai0AAEHdAEcNACAXQQFqIRcgEEEBaiEQCyAUIRkLAkAgBEH//wBKDQAgBEEYbCIUQZSIgIMAaiAZRTYCACAUQZCIgIMAaiANNgIAIBRBjIiAgwBqIAA2AgAgFEGIiICDAGogAzYCACAUQYSIgIMAaiAQNgIAIBRBgIiAgwBqIAAgCmo2AgAgBEEBaiEECwJAIAwNACAZQQNJDQAgDiANNgIAQQEhDCATQQE2AgALIBdBf2ohAAsgAEEBaiIAIAtIDQALCyADQQFqIQMLIAlBAWoiCSEKCyAJIAJHDQALQQAgBjYCkIiagwBBACAENgKMiJqDAEEAIAE2AoiImoMAQQAgBTYChIiagwBBACADNgKAiJqDACADC20BBH9BACECAkBBACgCjIiagwAiA0EBSA0AQYiIgIMAIQQDQAJAIAQoAgAgAEcNACAEQQRqKAIAIgUgAUoNACAFIARBfGooAgBqQQJqIAFIDQAgAg8LIARBGGohBCADIAJBAWoiAkcNAAsLQX8LxwIBA39BACEEAkAgAkEBSA0AIAAgAkgNACAAIAJrQQFqIQUCQCADRQ0AIAFBgIiAgABqIQFBACEDQQAhBANAQQAhAAJAA0AgAyAAakGAiICAAGotAAAgASAAai0AAEcNASACIABBAWoiAEcNAAsgBEGAwABODQMgBEECdEGAiJiDAGogAzYCACAEQQFqIQQLIANBAWoiAyAFRw0ADAILCyABQYCIgIAAaiEGQQAhAUEAIQQDQEEAIQACQANAIAEgAGpBgIiAgABqLQAAIgNBIGogAyADQb9/akH/AXFBGkkbQf8BcSAGIABqLQAAIgNBIGogAyADQb9/akH/AXFBGkkbQf8BcUcNASACIABBAWoiAEcNAAsgBEGAwABODQIgBEECdEGAiJiDAGogATYCACAEQQFqIQQLIAFBAWoiASAFRw0ACwsgBAsA9wEEbmFtZQHbAQoAEV9fd2FzbV9jYWxsX2N0b3JzARR3YXNtX2dldF90ZXh0X2J1ZmZlcgIWd2FzbV9nZXRfbWF4X3RleHRfc2l6ZQMUd2FzbV9nZXRfbGluZXNfdGFibGUEFXdhc21fZ2V0X21hY3Jvc190YWJsZQUXd2FzbV9nZXRfc2VhcmNoX21hdGNoZXMGDndhc21fZ2V0X3N0YXRzBxV3YXNtX2FuYWx5emVfZG9jdW1lbnQIGHdhc21fZmluZF9tYWNyb19hdF9wb2ludAkQd2FzbV9zZWFyY2hfdGV4dAcSAQAPX19zdGFja19wb2ludGVyAC0JcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBDERlYmlhbiBjbGFuZwYxNC4wLjY=";

export class WasmEngine {
  constructor() {
    this.ready = false;
    this.instance = null;
    this.exports = null;
    this.memory = null;
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder("utf-8");

    // Memory pointers
    this.textBufferPtr = 0;
    this.maxTextSize = 0;
    this.linesTablePtr = 0;
    this.macrosTablePtr = 0;
    this.searchMatchesPtr = 0;
    this.statsPtr = 0;

    // Fast views
    this.u8View = null;
    this.i32View = null;

    this.lastAnalyzedText = null;
    this.lastAnalyzedLength = 0;

    // Sub-engines (OOP architecture)
    this.diffEngine = new IncrementalDiffEngine();
    this.foldEngine = new HeadingFoldEngine();
    this.tokenizer = new FastTokenizer();

    // User setting toggle
    const stored = localStorage.getItem('caveman-native-engine-enabled');
    this.enabled = stored !== null ? stored === 'true' : true;
  }

  setNativeEngineEnabled(val) {
    this.enabled = Boolean(val);
    localStorage.setItem('caveman-native-engine-enabled', this.enabled ? 'true' : 'false');
  }

  isNativeEngineEnabled() {
    return this.enabled && this.ready;
  }

  async init() {
    if (this.ready) return true;

    try {
      // 1. Try streaming from static asset
      if (typeof fetch !== "undefined") {
        try {
          const resp = await fetch("/wasm/engine.wasm");
          if (resp.ok) {
            const { instance } = await (WebAssembly.instantiateStreaming 
              ? WebAssembly.instantiateStreaming(resp) 
              : resp.arrayBuffer().then(buf => WebAssembly.instantiate(buf)));
            this._setupInstance(instance);
            return true;
          }
        } catch (fetchErr) {
          // Fall back to prebuilt base64
        }
      }

      // 2. Embedded prebuilt binary fallback
      const binaryString = atob(PREBUILT_WASM_BASE64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const { instance } = await WebAssembly.instantiate(bytes);
      this._setupInstance(instance);
      return true;
    } catch (err) {
      console.warn("[WASM Engine] WebAssembly initialization fallback:", err);
      return false;
    }
  }

  _setupInstance(instance) {
    this.instance = instance;
    this.exports = instance.exports;
    this.memory = this.exports.memory;

    this.textBufferPtr = this.exports.wasm_get_text_buffer();
    this.maxTextSize = this.exports.wasm_get_max_text_size();
    this.linesTablePtr = this.exports.wasm_get_lines_table();
    this.macrosTablePtr = this.exports.wasm_get_macros_table();
    this.searchMatchesPtr = this.exports.wasm_get_search_matches();
    this.statsPtr = this.exports.wasm_get_stats();

    this.u8View = new Uint8Array(this.memory.buffer);
    this.i32View = new Int32Array(this.memory.buffer);
    this.ready = true;
  }

  _refreshViews() {
    if (!this.memory) return;
    if (this.u8View.buffer !== this.memory.buffer) {
      this.u8View = new Uint8Array(this.memory.buffer);
      this.i32View = new Int32Array(this.memory.buffer);
    }
  }

  analyze(text) {
    if (!this.ready) return null;
    if (text === this.lastAnalyzedText) {
      return this.getStats();
    }

    this._refreshViews();

    // Fast encode into WASM buffer
    const textBytes = this.textEncoder.encode(text);
    const byteLen = Math.min(textBytes.length, this.maxTextSize);
    
    this.u8View.set(textBytes.subarray(0, byteLen), this.textBufferPtr);
    this.lastAnalyzedLength = byteLen;
    this.lastAnalyzedText = text;

    this.exports.wasm_analyze_document(byteLen);
    return this.getStats();
  }

  getStats() {
    if (!this.ready) return { totalLines: 0, totalWords: 0, totalChars: 0, totalMacros: 0, codeBlocks: 0 };
    this._refreshViews();

    const base = this.statsPtr >> 2;
    return {
      totalLines: this.i32View[base],
      totalWords: this.i32View[base + 1],
      totalChars: this.i32View[base + 2],
      totalMacros: this.i32View[base + 3],
      codeBlocks: this.i32View[base + 4]
    };
  }

  getLineCount() {
    if (!this.ready) return 0;
    this._refreshViews();
    return this.i32View[this.statsPtr >> 2];
  }

  getLine(lineIdx) {
    if (!this.ready) return null;
    this._refreshViews();

    // LineEntry struct: 8 x 4 bytes = 32 bytes (start, len, type, has_fold, has_color, hex_color, has_wikilink, has_formatting)
    const base = (this.linesTablePtr >> 2) + lineIdx * 8;
    const hexVal = this.i32View[base + 5] >>> 0;
    const hexStr = hexVal ? "#" + hexVal.toString(16).padStart(6, "0") : null;

    return {
      start: this.i32View[base],
      length: this.i32View[base + 1],
      type: this.i32View[base + 2],
      hasFold: this.i32View[base + 3] === 1,
      hasColor: this.i32View[base + 4] === 1,
      hexColor: hexVal,
      hexStr: hexStr,
      hasWikilink: this.i32View[base + 6] === 1,
      hasFormatting: this.i32View[base + 7] === 1
    };
  }

  getMacros() {
    if (!this.ready) return [];
    this._refreshViews();

    const count = this.i32View[(this.statsPtr >> 2) + 3];
    const macros = [];
    const basePtr = this.macrosTablePtr >> 2;

    for (let i = 0; i < count; i++) {
      const offset = basePtr + i * 6; // start, len, line, col, hex, is_empty
      const hexVal = this.i32View[offset + 4] >>> 0;
      const hexStr = hexVal ? "#" + hexVal.toString(16).padStart(6, "0") : "";
      
      macros.push({
        id: "cm-" + this.i32View[offset],
        start: this.i32View[offset],
        length: this.i32View[offset + 1],
        lineIndex: this.i32View[offset + 2],
        colIndex: this.i32View[offset + 3],
        hexColor: hexVal,
        hex: hexStr,
        isEmpty: this.i32View[offset + 5] === 1
      });
    }

    return macros;
  }

  findMacroAtPoint(lineIdx, colIdx) {
    if (!this.ready) return -1;
    return this.exports.wasm_find_macro_at_point(lineIdx, colIdx);
  }

  search(query, caseSensitive = false) {
    if (!this.ready || !query) return [];
    this._refreshViews();

    const queryBytes = this.textEncoder.encode(query);
    if (queryBytes.length === 0) return [];

    // Place query right after text in buffer
    const queryPtr = this.textBufferPtr + this.lastAnalyzedLength + 16;
    this.u8View.set(queryBytes, queryPtr);

    const matchCount = this.exports.wasm_search_text(
      this.lastAnalyzedLength,
      this.lastAnalyzedLength + 16,
      queryBytes.length,
      caseSensitive ? 1 : 0
    );

    const matches = [];
    const basePtr = this.searchMatchesPtr >> 2;
    for (let i = 0; i < matchCount; i++) {
      matches.push(this.i32View[basePtr + i]);
    }
    return matches;
  }
}

export const wasmEngine = new WasmEngine();

