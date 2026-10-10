import { Vault } from './db.js';
import { Editor } from './editor.js';
import { GraphModule } from './graph.js';
import { ExportMenu } from './export.js';
import { ColorPicker } from './color-picker.js';
import { SketchManager } from './sketch.js';
import { wasmEngine } from './wasm-engine.js';

class CavemanApp {
  constructor() {
    window.app = this;
    this.vault = new Vault();
    this.editorModule = new Editor(this.vault);
    this.graphModule = new GraphModule(this);
    this.exportMenu = new ExportMenu(this);
    this.notes = [];
    this.currentNote = null;
    this.viewMode = null; // 'preview', 'editor', 'canvas'

    // Elements
    this.noteListEl = document.getElementById('note-list');
    this.editorEl = document.getElementById('editor');
    this.editorWrapper = document.getElementById('editor-wrapper');
    this.lineNumbersEl = document.getElementById('line-numbers');
    this.previewEl = document.getElementById('preview');
    this.canvasPanel = document.getElementById('canvas-panel');
    this.titleInput = document.getElementById('note-title');
    this.folderInput = document.getElementById('note-folder');
    this.newNoteBtn = document.getElementById('new-note');
    this.newFolderBtn = document.getElementById('new-folder-btn');
    this.sidebarEl = document.getElementById('sidebar');
    this.togglePreviewBtn = document.getElementById('toggle-preview');
    this.canvasModeBtn = document.getElementById('canvas-mode-btn');
    this.unfoldAllBtn = document.getElementById('unfold-all-btn');
    this.deleteNoteBtn = document.getElementById('delete-note');
    this.exportBtn = document.getElementById('export-btn');
    this.exportNoteBtn = document.getElementById('download-pdf-btn');
    this.importInput = document.getElementById('import-vault');
    this.charCountEl = document.getElementById('char-count');
    this.lastSavedEl = document.getElementById('last-saved');
    this.searchInput = document.getElementById('search-notes');
    this.themeToggle = document.getElementById('theme-control');
    this.viewBtn = document.getElementById('view-btn');
    this.viewMenu = document.getElementById('view-menu');
    this.printBackgroundCheck = document.getElementById('print-background-check');
    this.printContinuousCheck = document.getElementById('print-continuous-check');
    this.dbBtn = document.getElementById('db-btn');
    this.graphBtn = document.getElementById('graph-btn');
    this.dbMenu = document.getElementById('db-menu');
    this.graphMenu = document.getElementById('graph-menu');
    this.statusResizer = document.getElementById('status-resizer');
    this.closeOverlayBtns = document.querySelectorAll('.close-overlay');
    this.collapsedFolders = JSON.parse(localStorage.getItem('caveman-collapsed-folders') || '[]');
    this.customFolders = JSON.parse(localStorage.getItem('caveman-custom-folders') || '[]');
    this.activeContextMenu = null;
    this.imageCache = new Map(); // Memory cache to prevent flash
    this.historyStack = new Map(); // noteId -> { undo: [], redo: [] }
    this.historyTimer = null;
    this.editorFoldMap = new Map();
    this.foldIdCounter = 1;
    this.measureEl = null;
    this.renamingFolder = null;
    this.renamingNoteId = null;
    this.lastFolderClick = { time: 0, path: null };
    this.lastNoteClick = { time: 0, id: null };
    this.FAST_DBL_CLICK_THRESHOLD = 250;
    this.dblClickRenaming = localStorage.getItem('caveman-dbl-click-rename') !== 'false';
    this.folderSettings = JSON.parse(localStorage.getItem('caveman-folder-settings') || '{}');
    this.activePopover = null;
    this.DEFAULT_PALETTE = [
      '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff',
      '#a0c4ff', '#bdb2ff', '#ffc6ff', '#fffffc'
    ];
    this.tintPalette = JSON.parse(localStorage.getItem('caveman-tint-palette') || JSON.stringify(this.DEFAULT_PALETTE));
    this.paletteGridEl = document.getElementById('settings-palette-grid');
    this.showEditorHighlights = localStorage.getItem('caveman-show-editor-highlights') !== 'false';

    // Search Widget Elements
    this.editorSearchWidget = document.getElementById('editor-search-widget');
    this.editorSearchInput = document.getElementById('editor-search-input');
    this.editorSearchResults = document.getElementById('editor-search-results');
    this.editorSearchNext = document.getElementById('editor-search-next');
    this.editorSearchPrev = document.getElementById('editor-search-prev');
    this.editorSearchClose = document.getElementById('editor-search-close');
    this.editorSearchMatches = [];
    this.currentSearchMatchIndex = -1;
    this.editorHighlightsEl = document.getElementById('editor-highlights');
    this.searchMarksEl = document.getElementById('search-marks');
    this.editorColorWidgets = document.getElementById('editor-color-widgets');
    this.editorSketchWidgets = document.getElementById('editor-sketch-widgets');
    this.editorScrollbar = document.getElementById('editor-scrollbar');
    this.editorScrollbarTrack = document.getElementById('editor-scrollbar-track');
    this.editorScrollbarThumb = document.getElementById('editor-scrollbar-thumb');
    this._isScrollbarDragging = false;
    this.colorPicker = new ColorPicker();
    this.sketchManager = new SketchManager(this);
    this.wasmEngine = wasmEngine;

    this.initLazyLoader();
    this.initCustomScrollbar();
    this.init();

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        this.cachedCharWidth = null;
        this.cachedLineHeight = null;
        this.handleEditorResize();
      });
    }
  }

  initLazyLoader() {
    this.imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadLazyImage(entry.target);
          this.imageObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px' });
  }

  async loadLazyImage(imgEl) {
    const imgId = imgEl.dataset.imgId;
    if (!imgId) return;

    if (this.imageCache.has(imgId)) {
      imgEl.src = this.imageCache.get(imgId);
      imgEl.classList.remove('lazy-vault-img');
      return;
    }

    const dataUrl = await this.vault.getImage(imgId);
    if (dataUrl) {
      this.imageCache.set(imgId, dataUrl);
      imgEl.src = dataUrl;
      imgEl.classList.remove('lazy-vault-img');
    }
  }

  initCustomScrollbar() {
    if (!this.editorScrollbarThumb || !this.editorScrollbarTrack) return;

    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const clientH = this.editorEl.clientHeight;
      const scrollH = this.editorEl.scrollHeight;
      const maxScroll = Math.max(0, scrollH - clientH);
      if (maxScroll <= 0) return;

      const trackH = this.editorScrollbarTrack.clientHeight || clientH;
      const thumbH = Math.max(24, Math.round((clientH / scrollH) * trackH));
      const availTrack = Math.max(1, trackH - thumbH);

      const deltaY = e.clientY - startY;
      const scrollDelta = (deltaY / availTrack) * maxScroll;
      const targetScroll = Math.max(0, Math.min(maxScroll, Math.round(startScrollTop + scrollDelta)));

      if (this._scrollAnimRaf) {
        cancelAnimationFrame(this._scrollAnimRaf);
        this._scrollAnimRaf = null;
      }
      this._targetScrollTop = targetScroll;
      this.editorEl.scrollTop = targetScroll;
      this.syncAllEditorScrolls();
      this.updateLineNumbers(false);
      this.renderVisibleHighlights();
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      this._isScrollbarDragging = false;
      this.editorScrollbarThumb.classList.remove('dragging');
      try {
        if (typeof this.editorScrollbarThumb.releasePointerCapture === 'function') {
          this.editorScrollbarThumb.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    this.editorScrollbarThumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      this._isScrollbarDragging = true;
      startY = e.clientY;
      startScrollTop = this.editorEl.scrollTop;
      this.editorScrollbarThumb.classList.add('dragging');
      try {
        if (typeof this.editorScrollbarThumb.setPointerCapture === 'function') {
          this.editorScrollbarThumb.setPointerCapture(e.pointerId);
        }
      } catch (_) {}
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });

    this.editorScrollbarTrack.addEventListener('pointerdown', (e) => {
      if (e.target === this.editorScrollbarThumb) return;
      const rect = this.editorScrollbarTrack.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const clientH = this.editorEl.clientHeight;
      const scrollH = this.editorEl.scrollHeight;
      const maxScroll = Math.max(0, scrollH - clientH);
      if (maxScroll <= 0) return;

      const trackH = rect.height;
      const thumbH = Math.max(24, Math.round((clientH / scrollH) * trackH));
      const availTrack = Math.max(1, trackH - thumbH);
      const targetThumbTop = Math.max(0, Math.min(availTrack, clickY - thumbH / 2));
      const targetScroll = Math.round((targetThumbTop / availTrack) * maxScroll);

      if (this._scrollAnimRaf) {
        cancelAnimationFrame(this._scrollAnimRaf);
        this._scrollAnimRaf = null;
      }
      this._targetScrollTop = targetScroll;
      this.editorEl.scrollTop = targetScroll;
      this.syncAllEditorScrolls();
      this.updateLineNumbers(false);
      this.renderVisibleHighlights();
    });
  }

  updateCustomScrollbar() {
    if (!this.editorScrollbarThumb || !this.editorScrollbarTrack || !this.editorEl) return;
    const clientH = this.editorEl.clientHeight;
    const scrollH = this.editorEl.scrollHeight;
    if (scrollH <= clientH || clientH <= 0) {
      this.editorScrollbarThumb.style.display = 'none';
      return;
    }
    this.editorScrollbarThumb.style.display = 'block';
    const trackH = this.editorScrollbarTrack.clientHeight || clientH;
    const thumbH = Math.max(24, Math.round((clientH / scrollH) * trackH));
    const availTrack = Math.max(1, trackH - thumbH);
    const maxScroll = Math.max(1, scrollH - clientH);
    const currScroll = Math.max(0, Math.min(maxScroll, this.editorEl.scrollTop));
    const top = Math.round((currScroll / maxScroll) * availTrack);
    this.editorScrollbarThumb.style.height = `${thumbH}px`;
    this.editorScrollbarThumb.style.transform = `translateY(${top}px)`;
  }

  async init() {
    try {
      // 0. Initialize WebAssembly Engine
      await this.wasmEngine.init();

      // 0. Theme First (Immediate Caveman Comfort)
      const savedNightMode = localStorage.getItem('caveman-night-mode');
      if (savedNightMode === 'true') {
        this.isNightMode = true;
        document.body.classList.add('night-mode');
        document.documentElement.classList.add('night-mode');
      }
      this.updatePrismTheme();

      // Explicitly wait for vault before proceeding to UI binding
      await this.vault.init();
      
      // 1. Initial Load (Local Vault First)
      this.publicNotes = [];
      await this.loadNotes();
      
      // Initialize settings elements
      this.dblClickRenameCheck = document.getElementById('dbl-click-rename-check');
      if (this.dblClickRenameCheck) {
        this.dblClickRenameCheck.checked = this.dblClickRenaming;
      }

      // 2. Restore Last Session OR Create New (Critical: Await this before listeners)
      if (this.notes.length > 0) {
        const lastNoteId = localStorage.getItem('caveman-last-note-id');
        const lastNote = this.notes.find(n => String(n.id) === String(lastNoteId));
        if (lastNote) {
          await this.selectNote(lastNote);
        } else {
          await this.selectNote(this.notes[0]);
        }
      } else {
        await this.createNewNote();
      }

      this.renderPaletteInSettings();
      
      // Initialize Highlights Toggle
      this.showHighlightsCheck = document.getElementById('show-editor-highlights-check');
      if (this.showHighlightsCheck) {
        this.showHighlightsCheck.checked = this.showEditorHighlights;
        document.body.classList.toggle('no-highlights', !this.showEditorHighlights);
      }

      // Initialize Native Engine / C++ WASM Acceleration Toggle
      this.nativeEngineCheck = document.getElementById('native-engine-check');
      if (this.nativeEngineCheck && this.wasmEngine) {
        this.nativeEngineCheck.checked = this.wasmEngine.isNativeEngineEnabled();
        this.nativeEngineCheck.addEventListener('change', () => {
          this.wasmEngine.setNativeEngineEnabled(this.nativeEngineCheck.checked);
          this.cachedLines = null; // Force fresh highlight pass
          this.renderHighlights();
        });
      }

      // 3. Attach Listeners ONLY after initial state is set
      this.attachEventListeners();

      // 4. Background Load Ancient Scrolls (Public Tutorial)
      this.loadPublicNotes().then(() => {
        this.loadNotes(); // Update registry with public notes when ready
      }).catch(err => console.warn("Scroll acquisition failed", err));

    } catch (err) {
      console.error("CRITICAL: Ancient monolith failed to activate.", err);
      // Fallback: Notify user or attempt one retry?
    }
  }

  attachEventListeners() {
    window.addEventListener('beforeunload', () => {
      if (this.currentNote && this.saveTimeout) {
        this.vault.saveNote(this.currentNote);
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.activeContextMenu && !this.activeContextMenu.contains(e.target)) {
        this.closeContextMenu();
      }
      if (this.activePopover && !this.activePopover.contains(e.target)) {
        this.activePopover.remove();
        this.activePopover = null;
        this.renderNoteList(); 
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.activeContextMenu) {
          this.closeContextMenu();
        }
      }
    });

    if (this.sidebarEl) {
      this.sidebarEl.addEventListener('contextmenu', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
          return;
        }
        this.openContextMenu(e);
      });
    }

    if (this.newFolderBtn) {
      this.newFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.createNewFolder('');
      });
    }

    if (this.dblClickRenameCheck) {
      this.dblClickRenameCheck.addEventListener('change', () => {
        this.dblClickRenaming = this.dblClickRenameCheck.checked;
        localStorage.setItem('caveman-dbl-click-rename', this.dblClickRenaming);
      });
    }

    if (this.showHighlightsCheck) {
      this.showHighlightsCheck.addEventListener('change', () => {
        this.showEditorHighlights = this.showHighlightsCheck.checked;
        localStorage.setItem('caveman-show-editor-highlights', this.showEditorHighlights);
        document.body.classList.toggle('no-highlights', !this.showEditorHighlights);
        this.renderHighlights(); // Re-render if enabled
      });
    }

    // New Note logic
    let newNoteTimer;
    let longPressTriggered = false;

    this.newNoteBtn.addEventListener('pointerdown', () => {
      longPressTriggered = false;
      newNoteTimer = setTimeout(() => {
        this.createCustodesNote();
        longPressTriggered = true;
        this.newNoteBtn.classList.add('easter-egg-trigger');
        setTimeout(() => this.newNoteBtn.classList.remove('easter-egg-trigger'), 500);
      }, 2500);
    });

    const release = () => {
      if (newNoteTimer) {
        clearTimeout(newNoteTimer);
        newNoteTimer = null;
      }
    };

    this.newNoteBtn.addEventListener('pointerup', release);
    this.newNoteBtn.addEventListener('pointerleave', release);

    this.newNoteBtn.addEventListener('click', (e) => {
      if (longPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this.createNewNote();
    });
    
    this.editorEl.addEventListener('input', () => {
      if (this.sketchManager) this.sketchManager.bakeAll();
      let text = this.editorEl.value;
      let cursor = this.editorEl.selectionStart;

      // Reconcile sketch blocks like flexbox (adjust heights, expand/collapse spacers, clean orphans)
      const reconciled = this.reconcileSketchSpacers(text, cursor);
      if (reconciled.modified) {
        text = reconciled.text;
        cursor = reconciled.cursor;
        this.editorEl.value = text;
        this.editorEl.setSelectionRange(cursor, cursor);
      }

      // 1. Instant background highlight patch (<0.05ms)
      this.renderHighlightsFast(text, cursor);

      // 2. Fast input state handling
      this.handleInput();

      // 3. Debounced stats (300ms) to avoid blocking main thread on 80k WASM analysis
      clearTimeout(this._statsDebounceTimer);
      this._statsDebounceTimer = setTimeout(() => this.updateStats(), 300);

      // 4. Update line numbers immediately on next frame with forced metrics check for wrapped lines
      this.requestFastLineNumbers(true);

      // 5. Debounced search update if search widget is open (150ms)
      if (!this.editorSearchWidget.classList.contains('hidden')) {
        clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => this.performSearch(false), 150);
      }
    });

    // Auto-bake active sketch widget when clicking into editor textarea
    this.editorEl.addEventListener('pointerdown', () => {
      if (this.sketchManager && this.sketchManager.activeWidget) {
        this.sketchManager.bakeAll();
      }
    });

    // Auto-bake when clicking anywhere outside sketches
    document.addEventListener('pointerdown', (e) => {
      if (!this.sketchManager || !this.sketchManager.activeWidget) return;
      const target = e.target;
      if (target && target.closest && (target.closest('.sketch-widget-block') || target.closest('.sketch-wheel-popover'))) {
        return;
      }
      this.sketchManager.bakeAll();
    });

    this.editorSearchInput.addEventListener('input', () => this.performSearch());
    this.editorSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this.goToPrevMatch();
        else this.goToNextMatch();
      }
      if (e.key === 'Escape') this.hideSearch();
    });
    this.editorSearchNext.addEventListener('click', () => this.goToNextMatch());
    this.editorSearchPrev.addEventListener('click', () => this.goToPrevMatch());
    this.editorSearchClose.addEventListener('click', () => this.hideSearch());
    this.lineNumbersEl.addEventListener('click', (e) => {
      const indicator = e.target.closest('.fold-indicator');
      if (indicator) {
        const lineIndex = parseInt(indicator.dataset.lineIndex, 10);
        const foldId = indicator.dataset.foldId || null;
        if (indicator.classList.contains('collapsed')) {
          this.unfoldHeading(lineIndex, foldId);
        } else {
          this.foldHeading(lineIndex);
        }
        return;
      }
      const foldRow = e.target.closest('.line-number-row.has-fold');
      if (foldRow) {
        const ind = foldRow.querySelector('.fold-indicator');
        if (ind) {
          const lineIndex = parseInt(ind.dataset.lineIndex, 10);
          const foldId = ind.dataset.foldId || null;
          if (ind.classList.contains('collapsed')) {
            this.unfoldHeading(lineIndex, foldId);
          } else {
            this.foldHeading(lineIndex);
          }
        }
      }
    });
    // =========================================================================
    // Unified Smooth Scrolling Controller for Edit Mode
    // Unifies mouse wheel & trackpad scrolling across the entire editor:
    // Text, Line numbers gutter, and Sketches (whether 300, 500, or any height).
    // Completely eliminates speed discrepancies, stutter, and jumpiness.
    // =========================================================================
    this._targetScrollTop = 0;
    this._targetScrollLeft = 0;
    this._scrollAnimRaf = null;

    const clampTarget = () => {
      const maxScrollY = Math.max(0, this.editorEl.scrollHeight - this.editorEl.clientHeight);
      const maxScrollX = Math.max(0, this.editorEl.scrollWidth - this.editorEl.clientWidth);
      this._targetScrollTop = Math.max(0, Math.min(maxScrollY, this._targetScrollTop));
      this._targetScrollLeft = Math.max(0, Math.min(maxScrollX, this._targetScrollLeft));
    };

    const animateScroll = () => {
      const currTop = this.editorEl.scrollTop;
      const currLeft = this.editorEl.scrollLeft;
      const diffY = this._targetScrollTop - currTop;
      const diffX = this._targetScrollLeft - currLeft;

      if (Math.abs(diffY) <= 1 && Math.abs(diffX) <= 1) {
        this.editorEl.scrollTop = this._targetScrollTop;
        this.editorEl.scrollLeft = this._targetScrollLeft;
        this._scrollAnimRaf = null;
        return;
      }

      this.editorEl.scrollTop = Math.round(currTop + diffY * 0.35);
      this.editorEl.scrollLeft = Math.round(currLeft + diffX * 0.35);

      this._scrollAnimRaf = requestAnimationFrame(animateScroll);
    };

    this.editorEl.addEventListener('scroll', () => {
      if (this._isScrollbarDragging) {
        if (this._scrollAnimRaf) {
          cancelAnimationFrame(this._scrollAnimRaf);
          this._scrollAnimRaf = null;
        }
        this._targetScrollTop = this.editorEl.scrollTop;
        this._targetScrollLeft = this.editorEl.scrollLeft;
      } else if (!this._scrollAnimRaf) {
        this._targetScrollTop = this.editorEl.scrollTop;
        this._targetScrollLeft = this.editorEl.scrollLeft;
      }
      this.syncAllEditorScrolls();
      this.onEditorScroll();
    });

    if (this.editorWrapper) {
      this.editorWrapper.addEventListener('wheel', (e) => {
        if (!this.editorEl || this.viewMode !== 'editor' || this._isScrollbarDragging) return;

        let deltaY = e.deltaY;
        let deltaX = e.deltaX;

        if (e.deltaMode === 1) { // Lines
          const lh = this.getLineHeight ? this.getLineHeight() : 24;
          deltaY *= lh;
          deltaX *= lh;
        } else if (e.deltaMode === 2) { // Pages
          deltaY *= (this.editorEl.clientHeight || 400);
          deltaX *= (this.editorEl.clientWidth || 600);
        }

        if (!this._scrollAnimRaf) {
          this._targetScrollTop = this.editorEl.scrollTop;
          this._targetScrollLeft = this.editorEl.scrollLeft;
        }

        this._targetScrollTop += deltaY;
        this._targetScrollLeft += deltaX;
        clampTarget();

        if (!this._scrollAnimRaf) {
          this._scrollAnimRaf = requestAnimationFrame(animateScroll);
        }

        e.preventDefault();
      }, { passive: false });
    }
    window.addEventListener('resize', () => {
      this.handleEditorResize();
    });

    if (typeof ResizeObserver !== 'undefined' && this.editorEl) {
      this._editorResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newWidth = Math.round(entry.contentRect.width);
          if (this._lastObservedEditorWidth !== undefined && this._lastObservedEditorWidth !== newWidth) {
            this.handleEditorResize();
          }
          this._lastObservedEditorWidth = newWidth;
        }
      });
      this._editorResizeObserver.observe(this.editorEl);
    }
    this.editorEl.addEventListener('click', (e) => {
      this.preventCaretInSketchSpacers();
      // 1. Direct hit-test for actual swatch or color box element ONLY
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const sw = elements.find(el => el.classList && (el.classList.contains('macro-inline-swatch') || el.classList.contains('editor-swatch-box') || el.classList.contains('macro-color-box-slot')));

      // Strict dormancy: only show full picker when user presses directly on the square
      if (!sw) {
        if (this.sketchManager) this.sketchManager.bakeAll();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const text = this.editorEl.value;
      const lines = text.split('\n');

      let targetLineIdx = -1;
      if (sw.hasAttribute('data-line-index')) {
        targetLineIdx = parseInt(sw.getAttribute('data-line-index'), 10);
      } else if (sw.getAttribute('data-macro-id')) {
        const mId = sw.getAttribute('data-macro-id');
        const numMatch = mId.match(/\d+/g);
        if (numMatch) targetLineIdx = parseInt(numMatch[0], 10);
      }

      if (targetLineIdx >= 0 && targetLineIdx < lines.length) {
        const lineText = lines[targetLineIdx];
        const macroMatch = lineText.match(/(?:\[|<)color\s*=\s*(?:#([0-9a-fA-F]*))?(?:\]|>)?/i);
        if (macroMatch) {
          const initialHex = macroMatch[1] ? (macroMatch[1].startsWith('#') ? macroMatch[1] : '#' + macroMatch[1]) : '';
          this.openColorPickerForMacro(targetLineIdx, sw, initialHex);
        }
      }
    });
    this.editorEl.addEventListener('mousemove', (e) => {
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const sw = elements.find(el => el.classList && (el.classList.contains('macro-inline-swatch') || el.classList.contains('editor-swatch-box') || el.classList.contains('macro-color-box-slot')));
      if (sw) {
        if (this.lastHoveredSwatch !== sw) {
          if (this.lastHoveredSwatch) this.lastHoveredSwatch.classList.remove('hovered');
          this.lastHoveredSwatch = sw;
          sw.classList.add('hovered');
        }
        this.editorEl.style.cursor = 'pointer';
      } else {
        if (this.lastHoveredSwatch) {
          this.lastHoveredSwatch.classList.remove('hovered');
          this.lastHoveredSwatch = null;
        }
        this.editorEl.style.cursor = 'text';
      }
    });
    this.editorEl.addEventListener('keyup', (e) => {
      if (e.key && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageDown' || e.key === 'PageUp')) {
        this.preventCaretInSketchSpacers();
      }
    });

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.editorEl) {
        this.preventCaretInSketchSpacers();
      }
    });

    this.titleInput.addEventListener('input', () => this.handleInput());
    this.folderInput.addEventListener('input', () => this.handleInput());
    this.togglePreviewBtn.addEventListener('click', () => this.toggleEditorMode());
    this.canvasModeBtn.addEventListener('click', () => this.toggleCanvasMode());
    if (this.unfoldAllBtn) this.unfoldAllBtn.addEventListener('click', () => this.unfoldAllHeadings());
    this.deleteNoteBtn.addEventListener('click', () => this.deleteCurrentNote());

    // Arrow navigation & Sketch Block Auto-expansion
    this.editorEl.addEventListener('keydown', (e) => {
      // Unfold all / Fold all shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        this.unfoldAllHeadings();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.foldAllHeadings();
        return;
      }

      // Active sketch shortcut interception inside textarea
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        if (this.sketchManager && this.sketchManager.activeWidget && !this.sketchManager.activeWidget.isBaked) {
          e.preventDefault();
          if (e.key.toLowerCase() === 'y' || e.shiftKey) {
            this.sketchManager.activeWidget.redo();
          } else {
            this.sketchManager.activeWidget.undo();
          }
          return;
        }
      }

      // Fast single-arrow jump across sketch blocks
      if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const text = this.editorEl.value;
        const selStart = this.editorEl.selectionStart;
        const selEnd = this.editorEl.selectionEnd;
        if (selStart === selEnd) {
          const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
          const lineEnd = text.indexOf('\n', selStart);
          const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
          const currentLine = text.slice(lineStart, actualLineEnd);

          const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(currentLine) : null;
          if (parsed) {
            const spacerCount = this.getSketchSpacerCount(parsed.height);
            const lines = text.split('\n');
            const currentLineIdx = text.slice(0, lineStart).split('\n').length - 1;
            
            let actualSpacers = 0;
            while (currentLineIdx + 1 + actualSpacers < lines.length && lines[currentLineIdx + 1 + actualSpacers].trim() === '' && actualSpacers < spacerCount) {
              actualSpacers++;
            }
            const targetLineIdx = currentLineIdx + actualSpacers + 1;

            let targetOffset = 0;
            for (let i = 0; i < Math.min(lines.length, targetLineIdx); i++) {
              targetOffset += lines[i].length + 1;
            }
            if (targetLineIdx >= lines.length) {
              targetOffset = text.length;
            }
            e.preventDefault();
            this.editorEl.setSelectionRange(targetOffset, targetOffset);
            this.updateLineNumbers();
            return;
          }
        }
      }

      if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const text = this.editorEl.value;
        const selStart = this.editorEl.selectionStart;
        const selEnd = this.editorEl.selectionEnd;
        if (selStart === selEnd) {
          const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
          const lines = text.split('\n');
          const currentLineIdx = text.slice(0, lineStart).split('\n').length - 1;

          if (currentLineIdx > 0) {
            let sketchLineIdx = -1;
            for (let checkIdx = currentLineIdx - 1; checkIdx >= Math.max(0, currentLineIdx - 60); checkIdx--) {
              const checkLine = lines[checkIdx] || '';
              const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(checkLine) : null;
              if (parsed) {
                const spacerCount = this.getSketchSpacerCount(parsed.height);
                if (currentLineIdx <= checkIdx + spacerCount + 1) {
                  sketchLineIdx = checkIdx;
                }
                break;
              }
              if (checkLine.trim() !== '') break;
            }

            if (sketchLineIdx !== -1) {
              let targetOffset = 0;
              for (let i = 0; i < sketchLineIdx; i++) {
                targetOffset += lines[i].length + 1;
              }
              targetOffset += lines[sketchLineIdx].length;
              e.preventDefault();
              this.editorEl.setSelectionRange(targetOffset, targetOffset);
              this.updateLineNumbers();
              return;
            }
          }
        }
      }

      // Backspace guard: when at beginning of line below a sketch opening, jump to sketch tag instead of deleting single spacer line
      if (e.key === 'Backspace' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const text = this.editorEl.value;
        const selStart = this.editorEl.selectionStart;
        const selEnd = this.editorEl.selectionEnd;
        if (selStart === selEnd) {
          const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
          if (selStart === lineStart && selStart > 0) {
            const lines = text.split('\n');
            const currentLineIdx = text.slice(0, lineStart).split('\n').length - 1;
            if (currentLineIdx > 0) {
              let sketchLineIdx = -1;
              for (let checkIdx = currentLineIdx - 1; checkIdx >= Math.max(0, currentLineIdx - 60); checkIdx--) {
                const checkLine = lines[checkIdx] || '';
                const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(checkLine) : null;
                if (parsed) {
                  const spacerCount = this.getSketchSpacerCount(parsed.height);
                  if (currentLineIdx <= checkIdx + spacerCount + 1) {
                    sketchLineIdx = checkIdx;
                  }
                  break;
                }
                if (checkLine.trim() !== '') break;
              }

              if (sketchLineIdx !== -1) {
                e.preventDefault();
                let targetOffset = 0;
                for (let i = 0; i < sketchLineIdx; i++) {
                  targetOffset += lines[i].length + 1;
                }
                targetOffset += lines[sketchLineIdx].length;
                this.editorEl.setSelectionRange(targetOffset, targetOffset);
                this.updateLineNumbers();
                return;
              }
            }
          }
        }
      }

      if (e.key === 'Enter') {
        const selStart = this.editorEl.selectionStart;
        const text = this.editorEl.value;
        const lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
        const lineEnd = text.indexOf('\n', selStart);
        const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
        const currentLine = text.slice(lineStart, actualLineEnd);

        const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(currentLine) : null;
        if (parsed) {
          e.preventDefault();
          this.pushHistory();

          // If cursor is at the beginning of the sketch tag line: insert 1 line ABOVE the sketch
          if (selStart === lineStart) {
            const newText = text.slice(0, lineStart) + '\n' + text.slice(lineStart);
            this.editorEl.value = newText;
            this.editorEl.setSelectionRange(lineStart, lineStart);
            this.cachedLines = null;
            this.cachedHighlightedLines = null;
            this.lastRenderedText = null;
            this._gutterLines = null;
            this.editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            this.renderHighlightsImmediate();
            this.updateLineNumbers(true);
            return;
          }

          // Otherwise, user is on the sketch tag line (at end or within):
          // Insert EXACTLY ONE new line BELOW the sketch widget and its spacer block (at Line 6)!
          const neededSpacers = this.getSketchSpacerCount(parsed.height);
          const lines = text.split('\n');
          const currentLineIdx = text.slice(0, lineStart).split('\n').length - 1;

          // Count existing spacer lines directly following the sketch tag
          let existingSpacers = 0;
          while (currentLineIdx + 1 + existingSpacers < lines.length &&
                 existingSpacers < neededSpacers &&
                 lines[currentLineIdx + 1 + existingSpacers].trim() === '') {
            existingSpacers++;
          }

          const missingSpacers = neededSpacers - existingSpacers;
          const insertLineIdx = currentLineIdx + 1 + existingSpacers;

          let insertOffset = 0;
          for (let i = 0; i < Math.min(insertLineIdx, lines.length); i++) {
            insertOffset += lines[i].length + 1;
          }

          // Insert missing spacers (if any) PLUS the 1 new empty line directly below the sketch!
          const newText = text.slice(0, insertOffset) + '\n'.repeat(missingSpacers + 1) + text.slice(insertOffset);
          this.editorEl.value = newText;

          // Cursor lands on the injected empty line directly below the sketch
          const targetCursor = insertOffset + missingSpacers;
          this.editorEl.setSelectionRange(targetCursor, targetCursor);

          this.cachedLines = null;
          this.cachedHighlightedLines = null;
          this.lastRenderedText = null;
          this._gutterLines = null;

          // Dispatch input event so all subsystems (highlights, state, gutter, sketch widgets) update synchronously!
          this.editorEl.dispatchEvent(new Event('input', { bubbles: true }));
          this.renderHighlightsImmediate();
          this.updateLineNumbers(true);
          return;
        }
      }
    });

    this.editorEl.addEventListener('paste', (e) => {
      // Snapshot state immediately prior to paste for clean undo
      this.pushHistory();
      this.handlePaste(e);
      // Ensure post-paste text is rendered cleanly and recorded
      setTimeout(() => {
        const text = this.editorEl.value;
        const cursor = this.editorEl.selectionStart;
        const res = this.reconcileSketchSpacers(text, cursor);
        if (res.modified) {
          this.editorEl.value = res.text;
          this.editorEl.setSelectionRange(res.cursor, res.cursor);
        }
        this.pushHistory();
        this.cachedLines = null;
        this.cachedHighlightedLines = null;
        this.lastRenderedText = null;
        this._gutterLines = null;
        this.renderHighlightsImmediate();
        this.updateLineNumbers(true);
      }, 0);
    });
    this.exportBtn.addEventListener('click', () => this.exportVault());
    this.exportNoteBtn.addEventListener('click', () => {
      if (this.viewMode === 'canvas') {
        this.exportMenu.open();
      } else {
        this.exportNoteAsPDF();
      }
    });
    this.importInput.addEventListener('change', (e) => this.importVault(e));
    this.searchInput.addEventListener('input', () => this.renderNoteList());
    this.themeToggle.addEventListener('click', () => this.toggleTheme());

    // Status resizer logic
    const savedFolderWidth = localStorage.getItem('caveman-folder-width') || '80';
    this.folderInput.style.width = `${savedFolderWidth}px`;
    this.isResizingStatus = false;

    this.statusResizer.addEventListener('mousedown', (e) => {
      this.isResizingStatus = true;
      document.body.style.cursor = 'ew-resize';
      this.statusResizer.classList.add('active');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isResizingStatus) return;
      const rect = this.folderInput.getBoundingClientRect();
      const newWidth = Math.max(40, Math.min(600, e.clientX - rect.left));
      this.folderInput.style.width = `${newWidth}px`;
      localStorage.setItem('caveman-folder-width', newWidth);
    });

    window.addEventListener('mouseup', () => {
      if (this.isResizingStatus) {
        this.isResizingStatus = false;
        document.body.style.cursor = '';
        this.statusResizer.classList.remove('active');
      }
    });

    window.addEventListener('resize', () => {
      this.handleEditorResize();
    });

    this.previewEl.addEventListener('click', (e) => this.handlePreviewClick(e));

    this.viewBtn.addEventListener('click', () => this.openViewMenu());
    this.printBackgroundCheck.addEventListener('change', () => {
      const checked = this.printBackgroundCheck.checked;
      localStorage.setItem('caveman-print-bg', checked);
      document.body.classList.toggle('print-with-background', checked);
      document.documentElement.classList.toggle('print-with-background', checked);
    });
    this.printContinuousCheck.addEventListener('change', () => {
      const checked = this.printContinuousCheck.checked;
      localStorage.setItem('caveman-print-continuous', checked);
      document.body.classList.toggle('print-continuous', checked);
    });

    this.dblClickRenameCheck.addEventListener('change', () => {
      this.dblClickRenaming = this.dblClickRenameCheck.checked;
      localStorage.setItem('caveman-dbl-click-rename', this.dblClickRenaming);
    });

    this.dbBtn.addEventListener('click', () => this.openDatabaseMenu());
    this.graphBtn.addEventListener('click', () => {
      this.closeOverlays();
      this.graphBtn.classList.add('active');
      this.graphModule.open();
    });
    
    this.closeOverlayBtns.forEach(btn => btn.addEventListener('click', () => {
      this.closeOverlays();
      this.graphModule.close();
    }));
    
    document.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.setZoom(e.target.dataset.size));
    });

    const savedZoom = localStorage.getItem('caveman-zoom') || '14';
    this.setZoom(savedZoom);

    const savedPrintBg = localStorage.getItem('caveman-print-bg') === 'true';
    this.printBackgroundCheck.checked = savedPrintBg;
    document.body.classList.toggle('print-with-background', savedPrintBg);
    document.documentElement.classList.toggle('print-with-background', savedPrintBg);

    const savedPrintContinuous = localStorage.getItem('caveman-print-continuous') === 'true';
    this.printContinuousCheck.checked = savedPrintContinuous;
    document.body.classList.toggle('print-continuous', savedPrintContinuous);

    window.addEventListener('beforeprint', () => {
      if (this.currentNote && this.currentNote.title) {
        document.title = this.currentNote.title;
      }
      if (document.body.classList.contains('print-continuous')) {
        const previewHeight = this.previewEl.scrollHeight;
        const heightCm = Math.ceil(previewHeight / 37.8) + 2; 
        
        const style = document.createElement('style');
        style.id = 'continuous-print-style';
        style.innerHTML = `
          @page {
            size: 21cm ${heightCm}cm !important;
            margin: 0 !important;
          }
        `;
        document.head.appendChild(style);
      }
    });

    window.addEventListener('afterprint', () => {
      if (this.currentNote && this.currentNote.title) {
        document.title = `${this.currentNote.title} - Fri-ren Notes`;
      } else {
        document.title = 'Fri-ren Notes';
      }
      const style = document.getElementById('continuous-print-style');
      if (style) style.remove();
    });

    document.getElementById('toggle-sidebar-btn').addEventListener('click', () => this.toggleSidebar());
    document.getElementById('purge-vault-btn').addEventListener('click', () => this.purgeVault());
    document.getElementById('purge-images-btn').addEventListener('click', () => this.purgeUnusedImages());

    // Shortcuts
    document.addEventListener('keydown', (e) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const keyLower = e.key ? e.key.toLowerCase() : '';

      if (isCtrlOrMeta && (keyLower === 'p' || e.key === ']')) {
        e.preventDefault();
        this.toggleEditorMode();
      }
      if (isCtrlOrMeta && keyLower === 'k') {
        e.preventDefault();
        this.toggleCanvasMode();
      }
      if (isCtrlOrMeta && e.key === '[') {
        e.preventDefault();
        this.toggleSidebar();
      }
      if (isCtrlOrMeta && keyLower === 'f') {
        e.preventDefault();
        this.showSearch();
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (this.editorSearchWidget.classList.contains('hidden')) {
          this.showSearch();
        } else {
          if (e.shiftKey) {
            this.goToPrevMatch();
          } else {
            this.goToNextMatch();
          }
        }
      }
      if (e.key === 'Escape') {
        this.closeOverlays();
        this.graphModule.close();
        this.hideSearch();
      }
      
      // Undo/Redo
      if (isCtrlOrMeta && keyLower === 'z') {
        e.preventDefault();
        // If an active sketch widget is currently focused/active, route Undo to the sketch
        if (this.sketchManager && this.sketchManager.activeWidget && !this.sketchManager.activeWidget.isBaked) {
          if (e.shiftKey) {
            this.sketchManager.activeWidget.redo();
          } else {
            this.sketchManager.activeWidget.undo();
          }
          return;
        }

        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      }
      if (isCtrlOrMeta && keyLower === 'y') {
        e.preventDefault();
        if (this.sketchManager && this.sketchManager.activeWidget && !this.sketchManager.activeWidget.isBaked) {
          this.sketchManager.activeWidget.redo();
          return;
        }
        this.redo();
      }
    });
  }

  toggleTheme() {
    document.body.classList.toggle('night-mode');
    document.documentElement.classList.toggle('night-mode');
    const isNight = document.body.classList.contains('night-mode');
    this.isNightMode = isNight;
    localStorage.setItem('caveman-night-mode', isNight ? 'true' : 'false');
    this.updatePrismTheme();
    if (isNight) {
      console.log("%cBONFIRE LIT", "color: #c0a062; font-size: 40px; font-weight: bold; font-family: serif; font-style: italic;");
    }
    if (this.sketchManager) {
      this.sketchManager.updateTheme(isNight);
    }
    if (this.canvasModule) {
      this.canvasModule.render();
    }
  }

  updatePrismTheme() {
    const isNight = document.body.classList.contains('night-mode');
    const prismTheme = document.getElementById('prism-theme');
    if (prismTheme) {
      prismTheme.href = isNight 
        ? './lib/prism-tomorrow.min.css'
        : './lib/prism.min.css';
    }
  }

  toggleFolder(folderName) {
    const name = folderName.toUpperCase();
    if (this.collapsedFolders.includes(name)) {
      this.collapsedFolders = this.collapsedFolders.filter(f => f !== name);
    } else {
      this.collapsedFolders.push(name);
    }
    localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
    this.renderNoteList();
  }

  async loadPublicNotes() {
    try {
      const response = await fetch(`./server/server.json?_t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      this.publicNotes = [];
      
      for (const p of data.public_notes) {
        const md = await fetch(`./server/${p.file}?_t=${Date.now()}`, { cache: 'no-store' });
        const content = await md.text();
        this.publicNotes.push({
          ...p,
          id: `public:${p.file}`,
          content,
          rawContent: content,
          updatedAt: Date.now(),
          isPublic: true
        });
      }
    } catch (e) {
      console.warn("Ancient vault unreachable.");
    }
  }

  async renameFolder(oldFolderPath, newFolderName) {
    if (!newFolderName || !oldFolderPath) return;
    
    const parts = oldFolderPath.split('/');
    const newPathParts = [...parts];
    newPathParts[newPathParts.length - 1] = newFolderName.toUpperCase();
    const newFolderPath = newPathParts.join('/');

    if (oldFolderPath === newFolderPath) {
      this.renamingFolder = null;
      this.renderNoteList();
      return;
    }

    if (this.customFolders) {
      this.customFolders = this.customFolders.map(f => {
        if (f === oldFolderPath) return newFolderPath;
        if (f.startsWith(oldFolderPath + '/')) return newFolderPath + f.slice(oldFolderPath.length);
        return f;
      });
      this.customFolders = [...new Set(this.customFolders)];
      localStorage.setItem('caveman-custom-folders', JSON.stringify(this.customFolders));
    }

    if (this.collapsedFolders) {
      this.collapsedFolders = this.collapsedFolders.map(f => {
        if (f === oldFolderPath) return newFolderPath;
        if (f.startsWith(oldFolderPath + '/')) return newFolderPath + f.slice(oldFolderPath.length);
        return f;
      });
      localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
    }

    if (this.folderSettings && this.folderSettings[oldFolderPath]) {
      this.folderSettings[newFolderPath] = this.folderSettings[oldFolderPath];
      delete this.folderSettings[oldFolderPath];
      this.saveFolderSettings();
    }

    const updates = this.notes
      .filter(note => !note.isPublic)
      .filter(note => {
        const folder = (note.folder || '').toUpperCase();
        return folder === oldFolderPath || folder.startsWith(oldFolderPath + '/');
      })
      .map(async note => {
        const folder = note.folder || '';
        const folderUpper = folder.toUpperCase();
        
        let updatedFolder;
        if (folderUpper === oldFolderPath) {
          updatedFolder = newFolderPath;
        } else {
          updatedFolder = newFolderPath + folder.slice(oldFolderPath.length);
        }
        
        note.folder = updatedFolder;
        note.updatedAt = Date.now();
        await this.vault.saveNote(note);
      });

    await Promise.all(updates);
    this.renamingFolder = null;
    await this.loadNotes();
    
    if (this.currentNote) {
       this.folderInput.value = this.currentNote.folder || '';
    }
  }

  async deleteFolder(folderPath) {
    if (!folderPath) return;

    if (this.customFolders) {
      this.customFolders = this.customFolders.filter(f => f !== folderPath && !f.startsWith(folderPath + '/'));
      localStorage.setItem('caveman-custom-folders', JSON.stringify(this.customFolders));
    }

    if (this.collapsedFolders) {
      this.collapsedFolders = this.collapsedFolders.filter(f => f !== folderPath && !f.startsWith(folderPath + '/'));
      localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
    }

    if (this.folderSettings) {
      delete this.folderSettings[folderPath];
      this.saveFolderSettings();
    }

    // Move any notes inside this folder to parent folder or root
    const parentFolder = folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) : '';
    const notesInFolder = this.notes.filter(note => !note.isPublic && ((note.folder || '').toUpperCase() === folderPath || (note.folder || '').toUpperCase().startsWith(folderPath + '/')));

    for (const note of notesInFolder) {
      note.folder = parentFolder;
      note.updatedAt = Date.now();
      await this.vault.saveNote(note);
    }

    if (this.currentNote && (this.currentNote.folder || '').toUpperCase().startsWith(folderPath)) {
      this.currentNote.folder = parentFolder;
      this.folderInput.value = parentFolder;
    }

    this.statusMessenger(`Folder deleted.`, "info");
    await this.loadNotes();
  }

  createNewFolder(parentPath = '') {
    let baseName = 'NEW_FOLDER';
    let candidateName = baseName;
    let counter = 1;

    const existingUpper = new Set([
      ...(this.customFolders || []).map(f => f.toUpperCase()),
      ...this.notes.map(n => (n.folder || '').toUpperCase())
    ]);

    let fullPath = parentPath ? `${parentPath}/${candidateName}`.toUpperCase() : candidateName;
    while (existingUpper.has(fullPath)) {
      candidateName = `${baseName}_${counter++}`;
      fullPath = parentPath ? `${parentPath}/${candidateName}`.toUpperCase() : candidateName;
    }

    if (!this.customFolders) this.customFolders = [];
    if (!this.customFolders.includes(fullPath)) {
      this.customFolders.push(fullPath);
      localStorage.setItem('caveman-custom-folders', JSON.stringify(this.customFolders));
    }

    // Uncollapse parent folders so the new folder is visible
    if (parentPath) {
      const parts = parentPath.split('/');
      let acc = '';
      parts.forEach(p => {
        acc = acc ? `${acc}/${p}` : p;
        this.collapsedFolders = this.collapsedFolders.filter(f => f !== acc);
      });
      localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
    }

    this.renamingFolder = fullPath;
    this.renderNoteList();
  }

  async createNewNoteInFolder(folderPath = '') {
    await this.handleInput(false, false, true);
    const note = {
      title: '',
      folder: folderPath,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    note._searchIndex = `${note.folder}  `.toLowerCase();
    const id = await this.vault.saveNote(note);
    note.id = id;
    this.notes.push(note);

    if (folderPath) {
      const parts = folderPath.split('/');
      let acc = '';
      parts.forEach(p => {
        acc = acc ? `${acc}/${p}` : p;
        this.collapsedFolders = this.collapsedFolders.filter(f => f !== acc);
      });
      localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
    }

    await this.selectNote(note);
    if (this.viewMode === 'editor') {
      this.updateLineNumbers();
    }
    this.titleInput.focus();
  }

  async duplicateNote(note) {
    if (!note) return;
    const dupTitle = note.title ? `${note.title} (COPY)` : 'Untitled (COPY)';
    const dup = {
      title: dupTitle,
      folder: note.folder || '',
      content: note.content || '',
      rawContent: note.rawContent || note.content || '',
      sketches: note.sketches ? JSON.parse(JSON.stringify(note.sketches)) : {},
      foldMap: note.foldMap ? JSON.parse(JSON.stringify(note.foldMap)) : {},
      canvasData: note.canvasData ? JSON.parse(JSON.stringify(note.canvasData)) : null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    dup._searchIndex = `${dup.folder} ${dup.title} ${dup.content}`.toLowerCase();
    const id = await this.vault.saveNote(dup);
    dup.id = id;
    this.notes.push(dup);
    await this.selectNote(dup);
  }

  createContextHeader(text) {
    const header = document.createElement('div');
    header.className = 'brutalist-context-header';
    header.textContent = text;
    return header;
  }

  closeContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.remove();
      this.activeContextMenu = null;
    }
  }

  collectAllFolderPaths(out = []) {
    const set = new Set();
    (this.customFolders || []).forEach(f => {
      const parts = f.split('/');
      let acc = '';
      parts.forEach(p => {
        acc = acc ? `${acc}/${p}` : p;
        set.add(acc);
      });
    });
    this.notes.forEach(n => {
      if (!n.folder) return;
      const parts = n.folder.toUpperCase().split('/');
      let acc = '';
      parts.forEach(p => {
        acc = acc ? `${acc}/${p}` : p;
        set.add(acc);
      });
    });
    set.forEach(p => out.push(p));
    return out;
  }

  openContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();

    this.closeContextMenu();
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
    }

    const folderEl = e.target.closest('.sidebar-folder-label');
    const noteEl = e.target.closest('.note-item');

    let contextType = 'root';
    let targetFolder = '';
    let targetNote = null;

    if (folderEl && folderEl.dataset.folderPath) {
      contextType = 'folder';
      targetFolder = folderEl.dataset.folderPath;
    } else if (noteEl && noteEl.dataset.noteId) {
      contextType = 'note';
      targetNote = this.notes.find(n => n.id.toString() === noteEl.dataset.noteId.toString());
      if (targetNote) {
        targetFolder = targetNote.folder || '';
      }
    }

    const menu = document.createElement('div');
    menu.className = 'brutalist-context-menu';

    const items = [];

    if (contextType === 'folder') {
      const folderName = targetFolder.split('/').pop();
      menu.appendChild(this.createContextHeader(`FOLDER: ${folderName}`));

      items.push({
        label: '+ Create Document',
        icon: '📄',
        action: () => this.createNewNoteInFolder(targetFolder)
      });
      items.push({
        label: '+ Create Folder',
        icon: '📁',
        action: () => this.createNewFolder(targetFolder)
      });
      items.push({
        label: 'Rename Folder',
        icon: '✎',
        action: () => {
          this.renamingFolder = targetFolder;
          this.renderNoteList();
        }
      });
      items.push({
        label: 'Folder Icon & Tint',
        icon: '🎨',
        action: () => {
          this.openFolderSettings(targetFolder, folderEl);
        }
      });
      const isCol = this.collapsedFolders.includes(targetFolder);
      items.push({
        label: isCol ? 'Expand Folder' : 'Collapse Folder',
        icon: isCol ? '▼' : '▶',
        action: () => this.toggleFolder(targetFolder)
      });
      items.push({
        label: 'Delete Folder',
        icon: '✕',
        danger: true,
        action: () => this.deleteFolder(targetFolder)
      });

    } else if (contextType === 'note') {
      const noteTitle = (targetNote && targetNote.title) ? targetNote.title : 'Untitled';
      menu.appendChild(this.createContextHeader(`DOC: ${noteTitle}`));

      items.push({
        label: '+ Create Document',
        icon: '📄',
        action: () => this.createNewNoteInFolder(targetFolder)
      });
      items.push({
        label: '+ Create Folder',
        icon: '📁',
        action: () => this.createNewFolder(targetFolder)
      });
      if (targetNote && !targetNote.isPublic) {
        items.push({
          label: 'Rename Document',
          icon: '✎',
          action: () => {
            this.renamingNoteId = targetNote.id;
            this.renderNoteList();
          }
        });
        items.push({
          label: 'Duplicate Document',
          icon: '⧉',
          action: () => this.duplicateNote(targetNote)
        });
        items.push({
          label: 'Delete Document',
          icon: '✕',
          danger: true,
          action: async () => {
            await this.vault.deleteNote(targetNote.id);
            await this.loadNotes();
            if (this.currentNote && this.currentNote.id === targetNote.id) {
              if (this.notes.length > 0) this.selectNote(this.notes[0]);
              else this.createNewNote();
            }
          }
        });
      }
    } else {
      // Root sidebar / empty space context
      menu.appendChild(this.createContextHeader('PROJECT EXPLORER'));

      items.push({
        label: '+ Create Document',
        icon: '📄',
        action: () => this.createNewNoteInFolder('')
      });
      items.push({
        label: '+ Create Folder',
        icon: '📁',
        action: () => this.createNewFolder('')
      });
      items.push({
        label: 'Expand All Folders',
        icon: '▼',
        action: () => {
          this.collapsedFolders = [];
          localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
          this.renderNoteList();
        }
      });
      items.push({
        label: 'Collapse All Folders',
        icon: '▶',
        action: () => {
          const allFolderPaths = [];
          this.collectAllFolderPaths(allFolderPaths);
          this.collapsedFolders = allFolderPaths;
          localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
          this.renderNoteList();
        }
      });
    }

    items.forEach(item => {
      const btn = document.createElement('div');
      btn.className = `brutalist-context-item ${item.danger ? 'danger' : ''}`;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'context-item-icon';
      iconSpan.textContent = item.icon || '';
      btn.appendChild(iconSpan);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'context-item-label';
      labelSpan.textContent = item.label;
      btn.appendChild(labelSpan);

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.closeContextMenu();
        item.action();
      });

      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    this.activeContextMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuRect.width > window.innerWidth) {
      posX = window.innerWidth - menuRect.width - 8;
    }
    if (posY + menuRect.height > window.innerHeight) {
      posY = window.innerHeight - menuRect.height - 8;
    }
    posX = Math.max(8, posX);
    posY = Math.max(8, posY);

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
  }

  async renameNote(noteId, newTitle) {
    if (!newTitle) return;
    const note = this.notes.find(n => n.id === noteId);
    if (!note || note.isPublic) return;
    
    if (note.title === newTitle) {
      this.renamingNoteId = null;
      this.renderNoteList();
      return;
    }

    note.title = note.isPublic ? note.title : newTitle;
    if (!note.isPublic) {
      note.updatedAt = Date.now();
      await this.vault.saveNote(note);
    }
    this.renamingNoteId = null;
    await this.loadNotes();
    
    if (this.currentNote && this.currentNote.id === noteId) {
      this.titleInput.value = note.title;
    }
  }

  async moveNoteToFolder(noteId, folderPath) {
    const note = this.notes.find(n => n.id.toString() === noteId.toString());
    if (!note || note.isPublic) return;

    if (note.folder === folderPath) return;

    note.folder = folderPath;
    note.updatedAt = Date.now();
    await this.vault.saveNote(note);
    await this.loadNotes();
    
    if (this.currentNote && this.currentNote.id.toString() === noteId.toString()) {
      this.folderInput.value = folderPath;
    }
  }

  openFolderSettings(folderPath, triggerEl) {
    if (this.activePopover) {
      this.activePopover.remove();
    }

    const rect = triggerEl.getBoundingClientRect();
    const popover = document.createElement('div');
    popover.className = 'folder-settings-popover';
    popover.style.top = `${rect.bottom + 5}px`;
    popover.style.left = `${Math.max(10, rect.left)}px`;

    const settings = this.folderSettings[folderPath] || { color: '#fffffc', emoji: '' };

    // Emoji Picker
    const emojiTitle = document.createElement('div');
    emojiTitle.className = 'popover-title';
    emojiTitle.textContent = 'FOLDER ICON';
    popover.appendChild(emojiTitle);

    const emojiField = document.createElement('div');
    emojiField.className = 'emoji-picker-field';
    const emojiInput = document.createElement('input');
    emojiInput.type = 'text';
    emojiInput.className = 'emoji-picker-input';
    emojiInput.placeholder = 'Emoji...';
    emojiInput.value = settings.emoji || '';
    emojiField.appendChild(emojiInput);
    popover.appendChild(emojiField);

    // Color Picker
    const colorTitle = document.createElement('div');
    colorTitle.className = 'popover-title';
    colorTitle.textContent = 'TINT COLOR';
    popover.appendChild(colorTitle);

    const colorGrid = document.createElement('div');
    colorGrid.className = 'color-grid';
    const colors = [...this.tintPalette, ''];

    colors.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch ${settings.color === c ? 'active' : ''}`;
      if (!c) swatch.classList.add('empty');
      if (c) swatch.style.backgroundColor = c;
      swatch.onclick = () => {
        settings.color = c;
        this.folderSettings[folderPath] = { ...settings };
        this.saveFolderSettings();
        this.renderNoteList();
        popover.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      };
      colorGrid.appendChild(swatch);
    });
    popover.appendChild(colorGrid);

    emojiInput.oninput = () => {
      settings.emoji = emojiInput.value.trim().slice(0, 2);
      this.folderSettings[folderPath] = { ...settings };
      this.saveFolderSettings();
      this.renderNoteList(); 
    };

    emojiInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        this.renderNoteList();
        popover.remove();
        this.activePopover = null;
      }
    };

    document.body.appendChild(popover);
    this.activePopover = popover;
  }

  saveFolderSettings() {
    localStorage.setItem('caveman-folder-settings', JSON.stringify(this.folderSettings));
  }
  
  savePalette() {
    localStorage.setItem('caveman-tint-palette', JSON.stringify(this.tintPalette));
  }

  renderPaletteInSettings() {
    if (!this.paletteGridEl) return;
    this.paletteGridEl.innerHTML = '';
    this.tintPalette.forEach((color, index) => {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.style.backgroundColor = color;
      
      const input = document.createElement('input');
      input.type = 'color';
      input.value = color;
      input.oninput = (e) => {
        const newColor = e.target.value;
        this.tintPalette[index] = newColor;
        item.style.backgroundColor = newColor;
        this.savePalette();
        this.renderNoteList(); 
      };
      
      item.appendChild(input);
      this.paletteGridEl.appendChild(item);
    });
  }

  async loadNotes() {
    await this.loadPublicNotes();
    const localNotes = await this.vault.getNotes();
    const publicNotes = this.publicNotes || [];
    
    // Deduplicate: hide public notes if a local note with the same path exists
    const filteredPublic = publicNotes.filter(pn => {
      const pnPath = ((pn.folder || '').toUpperCase()) + '/' + pn.title;
      return !localNotes.some(ln => (((ln.folder || '').toUpperCase()) + '/' + ln.title) === pnPath);
    });

    this.notes = [...filteredPublic, ...localNotes].map(note => ({
      ...note,
      _searchIndex: `${note.folder || ''} ${note.title} ${note.content}`.toLowerCase()
    }));

    if (this.currentNote) {
      const found = this.notes.find(n => n.id.toString() === this.currentNote.id.toString());
      if (found) {
        this.currentNote = found;
      }
    }

    this.renderNoteList();
  }

  renderNoteList() {
    const query = this.searchInput.value.toLowerCase();
    this.noteListEl.innerHTML = '';
    
    // ROOT DROP TARGET (for moving notes out of folders)
    this.noteListEl.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.noteListEl.classList.add('drag-over-root');
    };
    this.noteListEl.ondragleave = () => {
      this.noteListEl.classList.remove('drag-over-root');
    };
    this.noteListEl.ondrop = async (e) => {
      // Only trigger if we dropped on the actual list container, not children
      if (e.target !== this.noteListEl) return;
      e.preventDefault();
      this.noteListEl.classList.remove('drag-over-root');
      const noteId = e.dataTransfer.getData('text/plain');
      if (noteId) {
        await this.moveNoteToFolder(noteId, '');
      }
    };

    const filtered = this.notes
      .sort((a,b) => (a.title || '').localeCompare(b.title || ''))
      .filter(note => {
        if (!query) return true;
        return note._searchIndex.includes(query);
      });

    // Build hierarchical tree
    const root = { folders: {}, notes: [] };

    // 1. Populate custom/empty folders so user-created folders appear even before adding notes
    (this.customFolders || []).forEach(folderPath => {
      if (!folderPath) return;
      if (query && !folderPath.toLowerCase().includes(query)) return;
      const parts = folderPath.split('/').filter(p => p.length > 0);
      let current = root;
      parts.forEach(part => {
        const key = part.toUpperCase();
        if (!current.folders[key]) {
          current.folders[key] = { folders: {}, notes: [], path: (current.path ? current.path + '/' : '') + key };
        }
        current = current.folders[key];
      });
    });

    // 2. Populate folders and notes from notes list
    filtered.forEach(note => {
      const parts = (note.folder || '').split('/').filter(p => p.length > 0);
      let current = root;
      parts.forEach(part => {
        const key = part.toUpperCase();
        if (!current.folders[key]) {
          current.folders[key] = { folders: {}, notes: [], path: (current.path ? current.path + '/' : '') + key };
        }
        current = current.folders[key];
      });
      current.notes.push(note);
    });

    this.renderTree(root, this.noteListEl, 0);
  }

  renderTree(node, container, depth) {
    // Sort and render subfolders
    Object.keys(node.folders).sort().forEach(name => {
      const folder = node.folders[name];
      const isCollapsed = this.collapsedFolders.includes(folder.path);
      const isRenaming = this.renamingFolder === folder.path;
      
      const header = document.createElement('div');
      header.className = `sidebar-folder-label ${isCollapsed ? 'collapsed' : ''} ${isRenaming ? 'renaming' : ''}`;
      header.dataset.folderPath = folder.path;
      header.style.paddingLeft = '4px'; // Almost hugging the left wall
      
      if (isRenaming) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'folder-rename-input';
        input.style.marginLeft = `${depth * 12}px`;
        input.value = name;
        header.appendChild(input);
        
        // Timeout to focus because browser might not have attached it yet
        setTimeout(() => {
          input.focus();
          input.select();
        }, 10);

        const handleRename = async () => {
          const newName = input.value.trim().toUpperCase();
          if (newName && newName !== name) {
            await this.renameFolder(folder.path, newName);
          } else {
            this.renamingFolder = null;
            this.renderNoteList();
          }
        };

        input.onkeydown = (e) => {
          if (e.key === 'Enter') handleRename();
          if (e.key === 'Escape') {
            this.renamingFolder = null;
            if (this.customFolders && this.customFolders.includes(folder.path)) {
              const hasNotes = this.notes.some(n => {
                const f = (n.folder || '').toUpperCase();
                return f === folder.path || f.startsWith(folder.path + '/');
              });
              if (!hasNotes && (name.startsWith('NEW_FOLDER') || name === '')) {
                this.customFolders = this.customFolders.filter(f => f !== folder.path);
                localStorage.setItem('caveman-custom-folders', JSON.stringify(this.customFolders));
              }
            }
            this.renderNoteList();
          }
        };
        input.onblur = handleRename;
        input.onclick = (e) => e.stopPropagation();
      } else {
        const settings = this.folderSettings[folder.path] || {};
        const tint = settings.color || '';
        if (tint) {
          header.style.backgroundColor = `${tint}33`; // 33 hex is roughly 20% alpha
        } else {
          header.style.backgroundColor = '';
        }

        const configTrigger = document.createElement('div');
        configTrigger.className = 'folder-config-trigger';
        configTrigger.textContent = settings.emoji || '⋮';
        configTrigger.onclick = (e) => {
          e.stopPropagation();
          this.openFolderSettings(folder.path, configTrigger);
        };
        header.appendChild(configTrigger);

        const labelText = document.createElement('span');
        labelText.className = 'folder-label-text';
        labelText.textContent = name.toUpperCase();
        labelText.style.paddingLeft = `${depth * 12}px`;
        header.appendChild(labelText);

        header.onclick = (e) => {
          e.stopPropagation();
          const now = Date.now();
          if (this.dblClickRenaming && now - this.lastFolderClick.time < this.FAST_DBL_CLICK_THRESHOLD && this.lastFolderClick.path === folder.path) {
            this.renamingFolder = folder.path;
            this.renderNoteList();
          } else {
            this.toggleFolder(folder.path);
          }
          this.lastFolderClick = { time: now, path: folder.path };
        };

        // DRAG AND DROP: FOLDER DROP TARGET
        header.ondragover = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          header.classList.add('drag-over');
        };
        header.ondragleave = () => {
          header.classList.remove('drag-over');
        };
        header.ondrop = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          header.classList.remove('drag-over');
          const noteId = e.dataTransfer.getData('text/plain');
          if (noteId) {
            await this.moveNoteToFolder(noteId, folder.path);
          }
        };
      }

      container.appendChild(header);

      if (!isCollapsed && !isRenaming) {
        const folderContent = document.createElement('div');
        folderContent.className = 'folder-content';
        this.renderTree(folder, folderContent, depth + 1);
        container.appendChild(folderContent);
      }
    });

    // Render notes in this folder
    node.notes.forEach(note => {
      const isRenaming = this.renamingNoteId === note.id;
      const el = document.createElement('div');
      el.className = `note-item ${this.currentNote && this.currentNote.id === note.id ? 'active' : ''} ${isRenaming ? 'renaming' : ''}`;
      el.dataset.noteId = note.id;
      el.style.paddingLeft = `${depth > 0 ? 16 + (depth * 12) : 16}px`;

      if (isRenaming) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'note-rename-input';
        input.value = note.title;
        el.appendChild(input);

        setTimeout(() => {
          input.focus();
          input.select();
        }, 10);

        const handleRename = async () => {
          const newTitle = input.value.trim();
          if (newTitle && newTitle !== note.title) {
            await this.renameNote(note.id, newTitle);
          } else {
            this.renamingNoteId = null;
            this.renderNoteList();
          }
        };

        input.onkeydown = (e) => {
          if (e.key === 'Enter') handleRename();
          if (e.key === 'Escape') {
            this.renamingNoteId = null;
            this.renderNoteList();
          }
        };
        input.onblur = handleRename;
        input.onclick = (e) => e.stopPropagation();
      } else {
        const titleSpan = document.createElement('span');
        titleSpan.textContent = note.title || 'Untitled';
        if (note.isPublic) el.classList.add('note-public');
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'opacity-60';
        timeSpan.style.fontSize = '9px';
        timeSpan.style.marginLeft = '8px';
        timeSpan.textContent = this.formatRelativeTime(note.updatedAt);
        
        el.appendChild(titleSpan);
        el.appendChild(timeSpan);
        
        el.onclick = () => {
          const now = Date.now();
          if (this.dblClickRenaming && now - this.lastNoteClick.time < this.FAST_DBL_CLICK_THRESHOLD && this.lastNoteClick.id === note.id) {
            if (!note.isPublic) {
              this.renamingNoteId = note.id;
              this.renderNoteList();
            }
          } else {
            this.selectNote(note);
          }
          this.lastNoteClick = { time: now, id: note.id };
        };

        // DRAG AND DROP: NOTE DRAGGABLE
        if (!note.isPublic) {
          el.draggable = true;
          el.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', note.id.toString());
            e.dataTransfer.effectAllowed = 'move';
            el.style.opacity = '0.5';
          };
          el.ondragend = () => {
            el.style.opacity = '1';
          };
        }
      }

      container.appendChild(el);
    });
  }

  formatRelativeTime(ts) {
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'NOW';
    if (diff < 3600) return `${Math.floor(diff/60)}M`;
    if (diff < 86400) return `${Math.floor(diff/3600)}H`;
    return `${Math.floor(diff/86400)}D`;
  }

  async createCustodesNote() {
    await this.handleInput(false, false, true);
    const content = `<div class="imperial-records-container">
  <div class="imperial-header">
    <img src="./server/adeptus_custodes_icon_330x192.png" class="imperial-seal" alt="Adeptus Custodes Seal" />
    <div class="header-data">
      <div>++++ TRANSMITTED: +[REDACTED]+ ++++</div>
      <div>++++ RECEIVED: +SOL SYSTEM+ ++++</div>
      <br/>
      <div>++++ FROM: ADEPTUS CUSTODES // TALONS OF THE EMPEROR ++++</div>
      <div>++++ TO: ALL LOYAL SUBJECTS OF THE IMPERIUM ++++</div>
    </div>
  </div>

  <div class="imperial-titles">
    <h1 class="imperial-title-main">✠ ADEPTUS CUSTODES ✠</h1>
    <h2 class="imperial-title-sub">✵ OFFICIAL NOTIFICATION ✵</h2>
    <h3 class="imperial-title-will">BY THE WILL OF THE IMMORTAL EMPEROR OF MANKIND</h3>
  </div>

  <hr class="imperial-hr" />

  | Squad Designation | Regiment Name | Logistics Rating | Information |
  | :--- | :--- | :--- | :--- |
  | **THE GILDED HOST** | 1st Guard | **EXTREMIS** | SECTOR SECURED |

  <hr class="imperial-hr" />

  <h3 class="imperial-section-header">PERSONNEL STATUS RECORD</h3>

  | NAME | STATUS | DEMEANOUR | CAUSE OF DEATH |
  | :--- | :--- | :--- | :--- |
  | **Shield-Captain Tyvar** | ACTIVE | RESOLUTE | - |
  | **Custode Valerian** | ACTIVE | STOIC | - |
  | **Sister Aleya** | ACTIVE | SILENT | - |
  | **Venerable Contemptor** | DORMANT | ANCIENT | - |

  <hr class="imperial-hr" />

  <blockquote class="imperial-quote">
    <strong>"THOUGHT FOR THE DAY: Wisdom is the beginning of fear."</strong>
  </blockquote>

  <hr class="imperial-hr" />

  <div class="imperial-footer">
    <p><em>Verified by the Inquisition.</em></p>
    <p class="final-seal"><strong>✠ IN THE EMPEROR'S NAME ✠</strong></p>
  </div>
</div>`;

    const note = {
      title: 'ADEPTUS CUSTODES - OFFICIAL NOTICE',
      folder: 'IMPERIAL RECORDS',
      content: content,
      lastViewMode: 'preview',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    note._searchIndex = `${note.folder} ${note.title} ${note.content}`.toLowerCase();
    
    const id = await this.vault.saveNote(note);
    note.id = id;
    this.notes.push(note);
    this.selectNote(note);
    this.switchView('preview');
    
    if (this.isNightMode) {
       console.log("%cFOR THE EMPEROR", "color: #ffd700; font-size: 30px; font-weight: bold; text-shadow: 2px 2px #000;");
    }
  }

  async createNewNote() {
    await this.handleInput(false, false, true);
    const note = {
      title: '',
      folder: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    note._searchIndex = '  '; // empty folder + empty title + empty content
    const id = await this.vault.saveNote(note);
    note.id = id;
    this.notes.push(note);
    this.selectNote(note);
    if (this.viewMode === 'editor') {
       this.updateLineNumbers();
    }
  }

  async selectNote(note) {
    this.hideSearch();
    if (this.currentNote && !this.currentNote.isPublic) {
      // Ensure we await the save before switching context to avoid clobbering data
      await this.handleInput(true, false, true); 
    }
    this.editorScrollResetNeeded = true;
    this.lastRenderedText = null;
    this.lastRenderedQuery = null;
    this.lastSearchWidgetHidden = null;
    this.lastRenderedMatchIndex = null;
    this.cachedLines = null;
    this.cachedHighlightedLines = null;
    this.lastRenderedLineCount = null;
    this.lastRenderedEditorWidth = null;
    this._gutterLineTops = null;
    this._gutterLineHeights = null;
    this._lastGutterStart = null;
    this._lastGutterEnd = null;
    if (this.sketchManager) {
      this.sketchManager.bakeAll();
      this.sketchManager.clearWidgets();
    }
    if (note.isPublic && note.file) {
      try {
        const res = await fetch(`./server/${note.file}?_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const fresh = await res.text();
          note.content = fresh;
          note.rawContent = fresh;
        }
      } catch (err) {
        console.warn("Could not fetch fresh public note:", err);
      }
    }
    this.currentNote = note;
    this.titleInput.value = note.title;
    document.title = note.title ? `${note.title} - Fri-ren Notes` : 'Fri-ren Notes';
    this.folderInput.value = note.folder || '';
    if (this._lastKnownSketches) this._lastKnownSketches.clear();
    let noteContent = note.rawContent || note.content || '';
    if (this.reconcileSketchSpacers) {
      const res = this.reconcileSketchSpacers(noteContent, -1);
      noteContent = res.text;
    }

    this.editorFoldMap.clear();

    if (note.foldMap && typeof note.foldMap === 'object') {
      for (const [k, v] of Object.entries(note.foldMap)) {
        this.editorFoldMap.set(k, v);
      }
    } else if (note.folds && typeof note.folds === 'object') {
      for (const [k, v] of Object.entries(note.folds)) {
        this.editorFoldMap.set(k, v);
      }
    }

    // Auto-heal duplicate fold marker IDs if corrupted from previous sessions
    if (noteContent && noteContent.includes('<!-- FOLD:')) {
      const seenFolds = new Set();
      let healed = false;
      const healedLines = noteContent.split('\n').map(line => {
        const m = line.match(/^<!--\s*FOLD:(.*?)\s*-->$/);
        if (m) {
          const fid = m[1].trim();
          if (seenFolds.has(fid)) {
            // Collision detected! Re-assign to a guaranteed unique ID
            const newId = `f_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
            const oldContent = this.editorFoldMap.get(fid) || '';
            this.editorFoldMap.set(newId, oldContent);
            seenFolds.add(newId);
            healed = true;
            return `<!-- FOLD:${newId} -->`;
          }
          seenFolds.add(fid);
        }
        return line;
      });

      if (healed) {
        noteContent = healedLines.join('\n');
        note.rawContent = noteContent;
        note.foldMap = Object.fromEntries(this.editorFoldMap);
        this.vault.saveNote(note).catch(() => {});
      }
    }

    this.editorEl.value = noteContent;
    
    if (this.viewMode === 'editor') {
      this.updateLineNumbers();
    }
    
    // Initialize history for this note if it doesn't exist
    if (!this.historyStack.has(note.id)) {
      this.historyStack.set(note.id, {
        undo: [{ 
          content: note.rawContent || note.content, 
          start: 0, 
          end: 0,
          sketches: note.sketches ? JSON.parse(JSON.stringify(note.sketches)) : {}
        }],
        redo: []
      });
    }
    
    // Save last opened
    localStorage.setItem('caveman-last-note-id', note.id);
    
    // Reset delete confirmation
    this.confirmDelete = false;
    this.deleteNoteBtn.textContent = 'Delete';
    this.deleteNoteBtn.classList.remove('btn-danger');
    if (this.deleteTimeout) clearTimeout(this.deleteTimeout);
 
    // Disable delete for public notes
    this.deleteNoteBtn.style.display = note.isPublic ? 'none' : 'block';
 
    this.renderNoteList();
    
    // Sync Canvas
    if (!this.canvasModule) {
      this.canvasModule = new window.CanvasLite('canvas-lite-root', (data) => this.handleCanvasChange(data));
    }
    this.canvasModule.setData(note.canvasData);
 
    // Per-note view mode persistence
    const lastMode = note.lastViewMode || 'preview';
    this.switchView(lastMode);
    
    if (lastMode === 'preview') this.updatePreview();
    if (lastMode === 'editor') this.updateLineNumbers();
    this.updateStats();

    // Final scroll reset to ensure we are at the top regardless of previous note's state
    if (this._scrollAnimRaf) {
      cancelAnimationFrame(this._scrollAnimRaf);
      this._scrollAnimRaf = null;
    }
    this._targetScrollTop = 0;
    this._targetScrollLeft = 0;
    this.editorEl.scrollTop = 0;
    this.editorEl.scrollLeft = 0;
    this.previewEl.scrollTop = 0;
    this.lineNumbersEl.scrollTop = 0;
    this.editorHighlightsEl.scrollTop = 0;
    this.editorHighlightsEl.scrollLeft = 0;
    this.searchMarksEl.scrollTop = 0;
    this.searchMarksEl.scrollLeft = 0;
    this.renderHighlights();
  }

  async handlePreviewClick(e) {
    const target = e.target;
    const wikilink = target.closest('.wikilink');

    // 1. Handle Wikilinks [[Note Title]]
    if (wikilink) {
      const title = wikilink.dataset.target;
      await this.navigateToNote(title);
      return;
    }

    // 2. Handle Checkboxes (Task Lists)
    if (target.tagName === 'INPUT' && target.type === 'checkbox') {
      // Find which checkbox we clicked relative to others in the same preview
      const allCheckboxes = Array.from(this.previewEl.querySelectorAll('input[type="checkbox"]'));
      const targetIndex = allCheckboxes.indexOf(target);

      if (targetIndex === -1) return;

      const isChecked = target.checked;
      const content = this.editorEl.value;
      const lines = content.split('\n');
      let currentCheckboxIndex = 0;
      
      // We iterate line by line to accurately find the checkbox.
      // This is more reliable than a global replace which might miss or double-count.
      const taskPattern = /^(\s*([-*+•]|\d+\.)\s+)\[([ xX])\]/;
      
      const newLines = lines.map(line => {
        const match = line.match(taskPattern);
        if (match) {
          if (currentCheckboxIndex === targetIndex) {
            currentCheckboxIndex++;
            const prefix = match[1];
            return `${prefix}[${isChecked ? 'x' : ' '}]${line.slice(match[0].length)}`;
          }
          currentCheckboxIndex++;
        }
        return line;
      });

      const newContent = newLines.join('\n');

      if (newContent !== content) {
        this.editorEl.value = newContent;
        await this.handleInput(true, false, true); // Persists but skips re-render to avoid flashing
        this.renderHighlights();
      }
    }
  }

  async handleInput(skipPreview = false, skipHistory = false, forceSave = false) {
    if (!this.currentNote) return;

    const newTitle = this.titleInput.value;
    document.title = newTitle ? `${newTitle} - Fri-ren Notes` : 'Fri-ren Notes';
    const newFolder = this.folderInput.value;
    const rawContent = this.editorEl.value;
    
    if (this.currentNote.title === newTitle && 
        this.currentNote.folder === newFolder && 
        (this.currentNote.rawContent === rawContent || (!this.currentNote.rawContent && this.currentNote.content === rawContent))) {
      if (!skipPreview && this.viewMode === 'preview') this.updatePreview();
      return;
    }

    if (!skipHistory) {
      clearTimeout(this.historyTimer);
      this.historyTimer = setTimeout(() => this.pushHistory(), 400);
    }

    // If editing a public note, fork it into a local one first
    if (this.currentNote.isPublic) {
      const newContent = this.getCleanMarkdown(rawContent);
      const newNote = {
        title: this.titleInput.value,
        folder: this.folderInput.value,
        content: newContent,
        rawContent: rawContent,
        foldMap: Object.fromEntries(this.editorFoldMap),
        canvasData: this.currentNote.canvasData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const newId = await this.vault.saveNote(newNote);
      newNote.id = newId;
      
      // Update notes list
      await this.loadNotes();
      await this.selectNote(newNote);
      return;
    }

    this.pruneFoldMap();
    this.currentNote.title = newTitle;
    this.currentNote.folder = newFolder;
    this.currentNote.rawContent = rawContent;
    this.currentNote.foldMap = Object.fromEntries(this.editorFoldMap);
    this.currentNote.updatedAt = Date.now();
    
    this.saveFoldedHeadingsState();
    
    if (this.viewMode === 'preview' && skipPreview !== true) this.updatePreview();

    if (forceSave) {
      clearTimeout(this.saveTimeout);
      this.pruneFoldMap();
      const newContent = this.getCleanMarkdown(rawContent);
      this.currentNote.content = newContent;
      this.currentNote.foldMap = Object.fromEntries(this.editorFoldMap);
      this.currentNote._searchIndex = `${this.currentNote.folder || ''} ${this.currentNote.title} ${this.currentNote.content}`.toLowerCase();
      await this.vault.saveNote(this.currentNote);
      this.renderNoteList();
      this.updateStats();
      this.lastSavedEl.textContent = `Saved: ${new Date().toLocaleTimeString()}`;
    } else {
      clearTimeout(this.saveTimeout);
      this.lastSavedEl.textContent = 'Saving...';
      this.saveTimeout = setTimeout(async () => {
        if (this.currentNote) {
          const currentRaw = this.editorEl ? this.editorEl.value : this.currentNote.rawContent;
          this.pruneFoldMap();
          this.currentNote.rawContent = currentRaw;
          this.currentNote.content = this.getCleanMarkdown(currentRaw);
          this.currentNote.foldMap = Object.fromEntries(this.editorFoldMap);
          this.currentNote._searchIndex = `${this.currentNote.folder || ''} ${this.currentNote.title} ${this.currentNote.content}`.toLowerCase();
          await this.vault.saveNote(this.currentNote);
          if (this._lastSavedTitle !== this.currentNote.title || this._lastSavedFolder !== this.currentNote.folder) {
            this._lastSavedTitle = this.currentNote.title;
            this._lastSavedFolder = this.currentNote.folder;
            this.renderNoteList();
          }
          this.updateStats();
          this.lastSavedEl.textContent = `Saved: ${new Date().toLocaleTimeString()}`;
        }
      }, 800);
    }
  }

  pushHistory() {
    if (!this.currentNote) return;
    const history = this.historyStack.get(this.currentNote.id);
    if (!history) return;

    clearTimeout(this.historyTimer);
    this.historyTimer = null;

    const content = this.editorEl.value;
    const sketches = this.currentNote.sketches ? JSON.parse(JSON.stringify(this.currentNote.sketches)) : {};
    const last = history.undo[history.undo.length - 1];
    
    if (last && last.content === content && JSON.stringify(last.sketches || {}) === JSON.stringify(sketches)) return;

    history.undo.push({
      content,
      start: this.editorEl.selectionStart,
      end: this.editorEl.selectionEnd,
      sketches,
      foldMap: Object.fromEntries(this.editorFoldMap)
    });

    if (history.undo.length > 100) history.undo.shift();
    history.redo = []; // Clear redo on new manual input
  }

  undo() {
    if (!this.currentNote) return;
    const history = this.historyStack.get(this.currentNote.id);
    if (!history) return;

    clearTimeout(this.historyTimer);
    this.historyTimer = null;

    const currentText = this.editorEl.value;
    const currentStart = this.editorEl.selectionStart;
    const currentEnd = this.editorEl.selectionEnd;
    const currentSketches = this.currentNote.sketches ? JSON.parse(JSON.stringify(this.currentNote.sketches)) : {};

    // Ensure the top of the undo stack accurately captures what was in the editor before undoing
    const lastUndo = history.undo[history.undo.length - 1];
    if (lastUndo && (lastUndo.content !== currentText || JSON.stringify(lastUndo.sketches || {}) !== JSON.stringify(currentSketches))) {
      history.undo.push({
        content: currentText,
        start: currentStart,
        end: currentEnd,
        sketches: currentSketches,
        foldMap: Object.fromEntries(this.editorFoldMap)
      });
    }

    if (history.undo.length <= 1) return;

    const current = history.undo.pop();
    history.redo.push(current);
    
    const prev = history.undo[history.undo.length - 1];
    if (prev.sketches) {
      this.currentNote.sketches = {
        ...(this.currentNote.sketches || {}),
        ...JSON.parse(JSON.stringify(prev.sketches))
      };
    }
    if (prev.foldMap) {
      this.editorFoldMap = new Map(Object.entries(prev.foldMap));
    }
    this.editorEl.value = prev.content;
    this.editorEl.setSelectionRange(prev.start, prev.end);
    
    // Clear diff cache to avoid any flash of stale highlighting
    this.cachedLines = null;
    this.cachedHighlightedLines = null;
    this.lastRenderedText = null;
    this.handleInput(false, true); // true = skip history push
    this.renderHighlightsImmediate();
    this.updateLineNumbers(true);
    this.editorEl.focus();
  }

  redo() {
    if (!this.currentNote) return;
    const history = this.historyStack.get(this.currentNote.id);
    if (!history || history.redo.length === 0) return;

    clearTimeout(this.historyTimer);
    this.historyTimer = null;

    const next = history.redo.pop();
    history.undo.push(next);
    
    if (next.sketches) {
      this.currentNote.sketches = {
        ...(this.currentNote.sketches || {}),
        ...JSON.parse(JSON.stringify(next.sketches))
      };
    }
    if (next.foldMap) {
      this.editorFoldMap = new Map(Object.entries(next.foldMap));
    }
    this.editorEl.value = next.content;
    this.editorEl.setSelectionRange(next.start, next.end);
    
    // Clear diff cache to avoid any flash of stale highlighting
    this.cachedLines = null;
    this.cachedHighlightedLines = null;
    this.lastRenderedText = null;
    this.handleInput(false, true); // true = skip history push
    this.renderHighlightsImmediate();
    this.updateLineNumbers(true);
    this.editorEl.focus();
  }

  async handleCanvasChange(data) {
    if (!this.currentNote) return;
    
    // If it's a public note, fork it
    if (this.currentNote.isPublic) {
      const newNote = {
        title: this.titleInput.value,
        folder: this.folderInput.value,
        content: this.editorEl.value,
        canvasData: data,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const newId = await this.vault.saveNote(newNote);
      newNote.id = newId;
      await this.loadNotes();
      this.selectNote(newNote);
      return;
    }

    this.currentNote.canvasData = data;
    this.currentNote.updatedAt = Date.now();
    await this.vault.saveNote(this.currentNote);
    this.lastSavedEl.textContent = `Saved: ${new Date().toLocaleTimeString()}`;
  }

  preventCaretInSketchSpacers() {
    if (!this.editorEl) return;
    const selStart = this.editorEl.selectionStart;
    const selEnd = this.editorEl.selectionEnd;
    if (typeof selStart !== 'number' || selStart !== selEnd) return;

    const text = this.editorEl.value;
    if (!text.includes('[sketch')) return;

    const lines = text.split('\n');
    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length;
      const lineEnd = currentOffset + lineLen;
      const trimmed = lines[i].trim();

      if (/^\[sketch(?::([a-zA-Z0-9_-]+))?(?:\s+([a-zA-Z0-9_-]+))?(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+([a-zA-Z0-9_-]+))?\]$/i.test(trimmed)) {
        const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(trimmed) : null;
        const spacerCount = parsed ? this.getSketchSpacerCount(parsed.height) : 15;
        
        // Spacer region is strictly the blank lines following the sketch line
        const spacerStart = lineEnd + 1;
        let spacerEnd = spacerStart;
        let spacersFound = 0;
        
        while (i + 1 + spacersFound < lines.length && spacersFound < spacerCount && lines[i + 1 + spacersFound].trim() === '') {
          spacerEnd += lines[i + 1 + spacersFound].length + 1;
          spacersFound++;
        }
        
        // If caret is strictly inside the hidden spacer lines, snap directly to start of content line below
        if (selStart >= spacerStart && selStart < spacerEnd) {
          this.editorEl.setSelectionRange(spacerEnd, spacerEnd);
          return;
        }
        i += spacersFound;
        currentOffset = spacerEnd;
        continue;
      }

      currentOffset += lineLen + 1;
    }
  }

  getSketchSpacerCount(height) {
    const lh = this.getLineHeight ? this.getLineHeight() : 24;
    // Header (30px) + Toolbar when active (34px) + Borders/padding (8px) = 72px
    const minHeight = (height || 300) + 72;
    return Math.max(3, Math.ceil(minHeight / lh));
  }

  expandSketchSpacers(text) {
    if (!text || !text.includes('[sketch')) return text;
    return this.reconcileSketchSpacers(text, -1).text;
  }

  updateStats() {
    if (!this.editorEl || !this.charCountEl) return;
    const raw = this.editorEl.value;
    const text = this.getCleanMarkdown(raw);
    if (this.wasmEngine && this.wasmEngine.ready) {
      const stats = this.wasmEngine.analyze(text);
      if (stats) {
        this.charCountEl.textContent = `Chars: ${stats.totalChars} | Words: ${stats.totalWords} | Lines: ${stats.totalLines} [WASM]`;
        return;
      }
    }
    const length = text.length;
    this.charCountEl.textContent = `Chars: ${length}`;
  }

  async navigateToNote(title) {
    // Try to find note by exact title or path (folder/title)
    let targetNote = this.notes.find(n => {
      const fullPath = ((n.folder || '').toUpperCase() ? (n.folder || '').toUpperCase() + '/' : '') + n.title;
      const searchTitle = title.toUpperCase();
      const noteTitle = n.title.toUpperCase();
      const notePath = fullPath.toUpperCase();
      return noteTitle === searchTitle || notePath === searchTitle;
    });

    if (!targetNote) {
      // Case-insensitive search as fallback if not found directly
      targetNote = this.notes.find(n => {
        return n.title.toLowerCase() === title.toLowerCase();
      });
    }

    if (!targetNote) {
      // Brutalist Creation Prompt: Instead of confirm, show in-preview UI
      this.renderMissingNoteUI(title);
      return;
    }

    if (targetNote) {
      await this.selectNote(targetNote);
    }
  }

  renderMissingNoteUI(title) {
    this.previewEl.innerHTML = `
      <div class="missing-note-container">
        <div class="missing-note-card">
          <div class="missing-note-icon">?</div>
          <h1 class="missing-note-title">NOTE NOT FOUND</h1>
          <p class="missing-note-path">Path: <code>${title}</code></p>
          <p>The wisdom you seek has not been inscribed in the vault yet.</p>
          <div class="missing-note-actions">
            <button id="create-missing-note" class="btn btn-brutalist">CREATE IT</button>
            <button id="cancel-missing-note" class="btn">GO BACK</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('create-missing-note').onclick = async () => {
      const parts = title.split('/');
      const newTitle = parts.pop();
      const newFolder = parts.join('/');
      
      const note = {
        title: newTitle,
        folder: newFolder,
        content: `# ${newTitle}\n\nLinked from [[${this.currentNote.title}]]`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const id = await this.vault.saveNote(note);
      note.id = id;
      await this.loadNotes();
      const targetNote = this.notes.find(n => n.id === id);
      if (targetNote) this.selectNote(targetNote);
    };

    document.getElementById('cancel-missing-note').onclick = () => {
      this.updatePreview();
    };
  }

  async updatePreview() {
    if (!this.currentNote) return;

    if (this.currentNote.folder === 'IMPERIAL RECORDS') {
      this.previewEl.classList.add('imperial-records');
    } else {
      this.previewEl.classList.remove('imperial-records');
    }
    
    let html = await this.editorModule.processMarkdown(this.currentNote.content);
    html = this.scopeStyles(html);
    
    // BACKLINKS: Find who links to THIS note
    const backlinks = this.notes.filter(n => {
      if (n.id === this.currentNote.id) return false;
      const mention = `[[${this.currentNote.title}]]`;
      return n.content.includes(mention);
    });

    if (backlinks.length > 0) {
      html += `
        <div class="backlinks-section">
          <h4>LINKED MENTIONS (${backlinks.length})</h4>
          <div class="backlinks-list">
            ${backlinks.map(bn => `
              <div class="backlink-item wikilink" data-target="${bn.title}">
                <span class="bn-title">${bn.title}</span>
                <span class="bn-folder">${bn.folder || 'root'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    this.previewEl.innerHTML = html;
    
    // Detect all-caps headers to apply brutalist mono/sans style as requested
    this.previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
      const text = h.textContent.trim();
      const letters = text.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 0 && letters === letters.toUpperCase()) {
        h.classList.add('header-allcaps');
      }
    });
    
    // Attach lazy loader to images
    this.previewEl.querySelectorAll('.lazy-vault-img').forEach(img => {
      this.imageObserver.observe(img);
    });
  }

  switchView(mode) {
    if (this.colorPicker) this.colorPicker.close();
    if (this.viewMode === mode && this.currentNote?.lastViewMode === mode) return;
    
    this.viewMode = mode;
    if (this.currentNote) {
      this.currentNote.lastViewMode = mode;
      this.vault.saveNote(this.currentNote);
    }
    
    // Hide all
    this.editorWrapper.classList.add('hidden');
    this.previewEl.classList.add('hidden');
    this.canvasPanel.classList.add('hidden');
    
    // Deactivate buttons
    this.togglePreviewBtn.classList.remove('active');
    this.canvasModeBtn.classList.remove('active');
    
    if (mode === 'editor') {
      this.editorWrapper.classList.remove('hidden');
      this.togglePreviewBtn.textContent = 'View';
      
      // Sync editor value if note rawContent was updated
      if (this.currentNote && this.editorEl.value !== (this.currentNote.rawContent || this.currentNote.content)) {
        this.editorEl.value = this.currentNote.rawContent || this.currentNote.content;
      }

      // Force sync scroll elements now that they are visible in the DOM
      this.syncAllEditorScrolls(this.editorScrollResetNeeded);
      this.editorScrollResetNeeded = false;

      this.updateLineNumbers(true);
      if (this.sketchManager) {
        const currentLines = this.editorEl.value.split('\n');
        this.sketchManager.syncWidgets(currentLines, this._gutterLineTops);
        this.sketchManager.syncScroll(this.editorEl.scrollTop, this.editorEl.scrollLeft);
        this.sketchManager.bakeAll();
      }
      setTimeout(() => this.renderHighlights(), 0);

      // Re-measure after next frame when DOM layout geometry has settled
      requestAnimationFrame(() => {
        this.updateLineNumbers(true);
        if (this.sketchManager) {
          const currentLines = this.editorEl.value.split('\n');
          this.sketchManager.syncWidgets(currentLines, this._gutterLineTops);
          this.sketchManager.syncScroll(this.editorEl.scrollTop, this.editorEl.scrollLeft);
        }
        this.renderHighlights();
      });
    } else if (mode === 'preview') {
      if (this.sketchManager) {
        this.sketchManager.bakeAll();
      }
      // CRITICAL: Flush editor value to currentNote so preview displays current sketches & text
      if (this.currentNote && this.editorEl) {
        const rawContent = this.editorEl.value;
        this.currentNote.rawContent = rawContent;
        this.currentNote.content = this.getCleanMarkdown(rawContent);
        this.currentNote.foldMap = Object.fromEntries(this.editorFoldMap);
        this.currentNote.updatedAt = Date.now();
        this.vault.saveNote(this.currentNote);
      }
      this.previewEl.classList.remove('hidden');
      this.previewEl.scrollTop = 0;
      this.togglePreviewBtn.textContent = 'Edit';
      this.togglePreviewBtn.classList.add('active'); // Highlight active mode
      this.updatePreview();
    } else if (mode === 'canvas') {
      if (this.sketchManager) {
        this.sketchManager.bakeAll();
      }
      if (this.currentNote && this.editorEl) {
        const rawContent = this.editorEl.value;
        this.currentNote.rawContent = rawContent;
        this.currentNote.content = this.getCleanMarkdown(rawContent);
        this.currentNote.foldMap = Object.fromEntries(this.editorFoldMap);
        this.currentNote.updatedAt = Date.now();
        this.vault.saveNote(this.currentNote);
      }
      this.canvasPanel.classList.remove('hidden');
      this.canvasModeBtn.classList.add('active');
      
      if (this.canvasModule) {
        this.canvasModule.onResize();
        this.canvasModule.render();
      }
    }
  }

  toggleEditorMode() {
    if (this.viewMode === 'editor') {
      this.switchView('preview');
    } else {
      this.switchView('editor');
    }
  }

  toggleCanvasMode() {
    if (this.viewMode === 'canvas') {
      this.switchView('preview');
    } else {
      this.switchView('canvas');
    }
  }

  async deleteCurrentNote() {
    if (!this.currentNote) return;

    if (!this.confirmDelete) {
      this.confirmDelete = true;
      this.deleteNoteBtn.textContent = 'REALLY?';
      this.deleteNoteBtn.classList.add('btn-danger');
      
      // Reset after 3 seconds if not clicked again
      this.deleteTimeout = setTimeout(() => {
        this.confirmDelete = false;
        this.deleteNoteBtn.textContent = 'Delete';
        this.deleteNoteBtn.classList.remove('btn-danger');
      }, 3000);
      return;
    }

    clearTimeout(this.deleteTimeout);
    this.confirmDelete = false;
    this.deleteNoteBtn.textContent = 'Delete';
    this.deleteNoteBtn.classList.remove('btn-danger');
    
    await this.vault.deleteNote(this.currentNote.id);
    await this.loadNotes();
    if (this.notes.length > 0) {
      await this.selectNote(this.notes[0]);
    } else {
      this.createNewNote();
    }
  }

  async handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const noteIdOnStart = this.currentNote ? this.currentNote.id : null;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = async (event) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1920;
            let width = img.width;
            let height = img.height;
            
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/png');
            const imgId = this.editorModule.generateImageId();
            this.imageCache.set(imgId, dataUrl);
            await this.vault.saveImage(imgId, dataUrl);
            
            const reference = `![[${imgId}]]`;
            
            // Check if we are still on the same note
            if (this.currentNote && this.currentNote.id === noteIdOnStart) {
              const start = this.editorEl.selectionStart;
              const end = this.editorEl.selectionEnd;
              const text = this.editorEl.value;
              
              const newContent = text.slice(0, start) + reference + text.slice(end);
              this.editorEl.value = newContent;
              
              // Restore cursor after the inserted reference
              const newPos = start + reference.length;
              this.editorEl.setSelectionRange(newPos, newPos);
              this.editorEl.focus();

              this.handleInput(false, true); // Save but skip pushing current state to history (we'll push separately if needed)
              this.updateLineNumbers();
              this.renderHighlights();
            } else {
              // Note switched mid-paste. Find original note and update IT on disk.
              const originalNote = this.notes.find(n => n.id === noteIdOnStart);
              if (originalNote) {
                originalNote.content += (originalNote.content ? '\n\n' : '') + reference;
                originalNote.updatedAt = Date.now();
                await this.vault.saveNote(originalNote);
                this.renderNoteList(); // Update sidebar timestamp
              }
            }
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(blob);
      }
    }
  }

  async exportCurrentNote() {
    if (!this.currentNote) return;
    const filename = `${this.currentNote.title || 'untitled'}.md`.replace(/[/\\?%*:|"<>]/g, '-');
    const blob = new Blob([this.currentNote.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

  exportNoteAsPDF() {
    console.log("PDF Export Triggered");
    if (!this.currentNote) {
      console.warn("No current note selected for PDF export.");
      return;
    }
    
    const wasEditing = this.viewMode === 'editor';
    if (wasEditing) this.switchView('preview');
    
    // Check if in iframe
    const inIframe = window.self !== window.top;
    if (inIframe) {
      this.lastSavedEl.textContent = "Open in NEW TAB to print PDF";
      this.lastSavedEl.style.color = "#ff4444";
      setTimeout(() => {
        this.lastSavedEl.textContent = "Ready";
        this.lastSavedEl.style.color = "";
      }, 3000);
    }
    
    setTimeout(() => {
      window.focus();
      try {
        window.print();
      } catch (e) {
        console.error("Print failed:", e);
        this.statusMessenger("Export failed. Opening new tab...", "error");
        setTimeout(() => {
          const win = window.open(window.location.href, '_blank');
          if (!win) {
            this.statusMessenger("Popup blocked!", "error");
          }
        }, 2000);
      }
      
      if (wasEditing) {
        setTimeout(() => this.switchView('editor'), 800);
      }
    }, 600);
  }

  toggleCanvas() {
    this.closeOverlays();
    this.canvasBtn.classList.add('active');
    this.canvasMenu.classList.remove('hidden');
    if (!this.canvasModule && window.CanvasLite) {
      this.canvasModule = new window.CanvasLite('canvas-lite-root');
    } else if (this.canvasModule) {
      this.canvasModule.onResize();
    }
  }

  openViewMenu() {
    this.closeOverlays();
    this.viewMenu.classList.remove('hidden');
    this.viewBtn.classList.add('active');
  }

  async openDatabaseMenu() {
    this.closeOverlays();
    this.dbMenu.classList.remove('hidden');
    this.dbBtn.classList.add('active');
    const notes = await this.vault.getNotes();
    const images = await this.vault.getAllImages();
    
    document.getElementById('stat-count').textContent = notes.length;
    document.getElementById('stat-imgs').textContent = images.length;
    
    let totalSize = 0;
    notes.forEach(n => totalSize += (n.content?.length || 0));
    images.forEach(img => totalSize += (img.data?.length || 0));
    
    document.getElementById('stat-size').textContent = (totalSize / 1024).toFixed(1) + ' KB';
  }

  closeOverlays() {
    this.viewMenu.classList.add('hidden');
    this.dbMenu.classList.add('hidden');
    this.graphMenu.classList.add('hidden');
    this.viewBtn.classList.remove('active');
    this.dbBtn.classList.remove('active');
    this.graphBtn.classList.remove('active');
  }

  handleEditorResize() {
    if (!this.editorEl) return;

    // Invalidate cached font and layout measurements
    this.cachedCharWidth = null;
    this.cachedLineHeight = null;
    this._lastGutterText = null;
    this.lastRenderedEditorWidth = 0;
    this.lastRenderedHighlightWidth = 0;
    this.lastRenderedScrollTop = -1;

    // Refresh char and line height measurements
    this.getCharWidth();
    this.getLineHeight();

    if (this.viewMode === 'editor' && this.currentNote) {
      // 1. Force recalculation of line heights, line tops, visual wrap lines and gutter
      this.updateLineNumbers(true);

      // 2. Re-render visible highlights immediately with the updated line layout
      this.renderVisibleHighlights();

      // 3. Re-render search marks if search is active
      if (this.editorSearchWidget && !this.editorSearchWidget.classList.contains('hidden')) {
        this.performSearch(false);
      }

      // 4. Sync sketch blocks to new line heights and line tops
      if (this.sketchManager) {
        const currentLines = this.editorEl.value.split('\n');
        this.sketchManager.syncWidgets(currentLines, this._gutterLineTops);
        this.sketchManager.syncScroll(this.editorEl.scrollTop, this.editorEl.scrollLeft);
      }

      // 5. Sync all scroll containers & custom scrollbar
      this.syncAllEditorScrolls();
      this.updateCustomScrollbar();
    } else if (this.viewMode === 'canvas') {
      if (this.canvasModule) {
        this.canvasModule.onResize();
      }
    }
  }

  setZoom(size) {
    const s = parseInt(size) || 14;
    const lh = Math.round(s * 1.6);
    localStorage.setItem('caveman-zoom', size);
    document.documentElement.style.setProperty('--zoom-scale', s + 'px');
    document.documentElement.style.setProperty('--editor-line-height', lh + 'px');
    document.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
    this.handleEditorResize();
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('hidden');
    
    // Crucial: Update editor layouts after sidebar push/pull
    this.handleEditorResize();
    setTimeout(() => {
      this.handleEditorResize();
    }, 50);
  }

  showSearch() {
    this.editorSearchWidget.classList.remove('hidden');
    
    // Auto-populate search with active text selection if not empty and on one line
    const selStart = this.editorEl.selectionStart;
    const selEnd = this.editorEl.selectionEnd;
    if (typeof selStart === 'number' && typeof selEnd === 'number' && selStart !== selEnd) {
      const selectedText = this.editorEl.value.substring(selStart, selEnd);
      if (selectedText && selectedText.trim().length > 0 && !selectedText.includes('\n')) {
        this.editorSearchInput.value = selectedText;
      }
    }

    this.editorSearchInput.focus();
    this.editorSearchInput.select();
    this.performSearch();
  }

  hideSearch() {
    this.editorSearchWidget.classList.add('hidden');
    this.renderHighlights(); // Clear marks
    this.editorEl.focus();
  }

  performSearch(shouldJump = true) {
    const query = this.editorSearchInput.value;
    if (!query || query.length < 1) {
      this.editorSearchMatches = [];
      this.currentSearchMatchIndex = -1;
      this.renderHighlights();
      this.updateSearchUI();
      return;
    }

    const text = this.editorEl.value;
    try {
      this.editorSearchMatches = [];
      if (this.wasmEngine && this.wasmEngine.ready) {
        const offsets = this.wasmEngine.search(query, false);
        const qLen = query.length;
        this.editorSearchMatches = offsets.map(offset => ({ start: offset, end: offset + qLen }));
      } else {
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          this.editorSearchMatches.push({ start: match.index, end: match.index + match[0].length });
        }
      }

      if (this.editorSearchMatches.length > 0) {
        if (this.currentSearchMatchIndex === -1 || shouldJump) {
          this.currentSearchMatchIndex = 0;
          if (shouldJump) {
            this.highlightMatch(false); 
          }
        }
      } else {
        this.currentSearchMatchIndex = -1;
      }
      this.renderHighlights();
      this.updateSearchUI();
    } catch (e) {
      this.editorSearchMatches = [];
      this.currentSearchMatchIndex = -1;
      this.renderHighlights();
      this.updateSearchUI();
    }
  }

  updateSearchUI() {
    const total = this.editorSearchMatches.length;
    const current = total > 0 ? this.currentSearchMatchIndex + 1 : 0;
    this.editorSearchResults.textContent = `${current}/${total}`;
  }

  highlightMatch(stealFocus = true) {
    if (this.currentSearchMatchIndex === -1) return;
    const match = this.editorSearchMatches[this.currentSearchMatchIndex];
    
    if (stealFocus) {
      this.editorEl.focus();
    }
    
    // Render search highlights synchronously so they exist in the DOM right now
    this.renderHighlightsImmediate();
    
    const currentMark = this.searchMarksEl.querySelector('mark.current');
    if (currentMark) {
      // Find the relative offsetTop of the current mark element which reflects the actual layout positioning
      // (accounting for line-wrap, zooming, margins, custom widths etc.)
      const targetScroll = currentMark.offsetTop - (this.editorEl.clientHeight / 2);
      
      this.editorEl.scrollTop = targetScroll;
      this.syncAllEditorScrolls();
    } else {
      // Fallback in case mark.current was not found
      const lineHeight = parseFloat(getComputedStyle(this.editorEl).lineHeight);
      const beforeText = this.editorEl.value.substring(0, match.start);
      const lines = beforeText.split('\n');
      const lineIndex = lines.length - 1;
      
      const targetScroll = lineIndex * lineHeight - (this.editorEl.clientHeight / 2);
      
      this.editorEl.scrollTop = targetScroll;
      this.syncAllEditorScrolls();
    }
  }

  renderHighlights() {
    requestAnimationFrame(() => this.renderHighlightsImmediate());
  }

  syncAllEditorScrolls(reset = false) {
    if (!this.editorEl) return;
    if (reset) {
      this.editorEl.scrollTop = 0;
      this.editorEl.scrollLeft = 0;
    }
    const top = this.editorEl.scrollTop;
    const left = this.editorEl.scrollLeft;

    if (this.lineNumbersEl) this.lineNumbersEl.scrollTop = top;
    if (this.editorHighlightsEl) {
      this.editorHighlightsEl.scrollTop = top;
      this.editorHighlightsEl.scrollLeft = left;
      this.editorHighlightsEl.style.right = '0px';
    }
    if (this.searchMarksEl) {
      this.searchMarksEl.scrollTop = top;
      this.searchMarksEl.scrollLeft = left;
      this.searchMarksEl.style.right = '0px';
    }
    if (this.editorColorWidgets) {
      this.editorColorWidgets.scrollTop = top;
      this.editorColorWidgets.scrollLeft = left;
    }
    if (this.editorSketchWidgets && this.sketchManager) {
      this.sketchManager.syncScroll(top, left);
    }
    this.updateCustomScrollbar();
  }

  openColorPickerForMacro(targetLineIdx, anchorBtn, initialHex = '') {
    if (!this.colorPicker) return;

    let targetIdx = typeof targetLineIdx === 'number' ? targetLineIdx : -1;
    if (targetIdx === -1 && typeof targetLineIdx === 'string') {
      const numMatch = targetLineIdx.match(/\d+/g);
      if (numMatch) targetIdx = parseInt(numMatch[0], 10);
    }

    const startColor = (initialHex && initialHex.length >= 4)
      ? (initialHex.startsWith('#') ? initialHex : '#' + initialHex)
      : (this.isNightMode ? '#a18a5e' : '#141414');

    const anchorRect = (anchorBtn && typeof anchorBtn.getBoundingClientRect === 'function')
      ? anchorBtn.getBoundingClientRect()
      : null;

    // Firmly lock viewport scroll position before picker interaction
    const lockedScrollTop = this.editorEl.scrollTop;
    const lockedScrollLeft = this.editorEl.scrollLeft;

    this.colorPicker.open({
      anchorEl: (anchorBtn && typeof anchorBtn.contains === 'function') ? anchorBtn : this.editorEl,
      anchorRect: anchorRect,
      initialColor: startColor,
      onSelect: (selectedHex) => {
        const currentScrollTop = this.editorEl.scrollTop > 0 ? this.editorEl.scrollTop : lockedScrollTop;
        const currentScrollLeft = this.editorEl.scrollLeft > 0 ? this.editorEl.scrollLeft : lockedScrollLeft;
        const savedSelStart = this.editorEl.selectionStart;
        const savedSelEnd = this.editorEl.selectionEnd;

        const currentText = this.editorEl.value;
        const currentLines = currentText.split('\n');

        let lIdx = targetIdx;
        if (lIdx < 0 || lIdx >= currentLines.length || !/(?:\[|<)color\s*=/i.test(currentLines[lIdx])) {
          lIdx = currentLines.findIndex((ln, idx) => Math.abs(idx - targetIdx) <= 2 && /(?:\[|<)color\s*=/i.test(ln));
        }
        if (lIdx === -1) return;

        const line = currentLines[lIdx];
        const cleanHex = selectedHex.replace(/^#/, '').toLowerCase();
        
        // Match existing tag structure: [color=#hex], [color=], <color=#hex>, etc.
        const tagRegex = /(\[|<)color(?:\s*=\s*|\s+)?(?:#[0-9a-fA-F]*)?(\]|\>)?/i;
        const m = line.match(tagRegex);
        if (!m) return;

        const openChar = m[1]; // '[' or '<'
        const closeChar = openChar === '<' ? '>' : ']';
        const newTag = `${openChar}color=  #${cleanHex}${closeChar}`;

        const updatedLine = line.replace(tagRegex, newTag);
        if (updatedLine === line) return;

        currentLines[lIdx] = updatedLine;
        this.editorEl.value = currentLines.join('\n');
        targetIdx = lIdx;

        // Restore scroll and cursor position immediately
        this.editorEl.scrollTop = currentScrollTop;
        this.editorEl.scrollLeft = currentScrollLeft;
        if (savedSelStart !== null && savedSelEnd !== null) {
          try { this.editorEl.setSelectionRange(savedSelStart, savedSelEnd); } catch (_) {}
        }

        this.handleInput(false, false, false);

        // Re-anchor scroll and sync highlights and line numbers
        this.editorEl.scrollTop = currentScrollTop;
        this.editorEl.scrollLeft = currentScrollLeft;
        this.renderHighlightsImmediate();
        this.syncAllEditorScrolls();
      },
      onClose: () => {
        const currentScrollTop = this.editorEl.scrollTop > 0 ? this.editorEl.scrollTop : lockedScrollTop;
        const currentScrollLeft = this.editorEl.scrollLeft > 0 ? this.editorEl.scrollLeft : lockedScrollLeft;
        try {
          this.editorEl.focus({ preventScroll: true });
        } catch (_) {
          this.editorEl.focus();
        }
        this.editorEl.scrollTop = currentScrollTop;
        this.editorEl.scrollLeft = currentScrollLeft;
        this.syncAllEditorScrolls();
      }
    });
  }

  onEditorScroll() {
    this.syncAllEditorScrolls();
    const currTop = this.editorEl ? this.editorEl.scrollTop : 0;
    const delta = Math.abs(currTop - (this._lastScrollRenderTop || 0));

    // If large jump (e.g. scrollbar dragged fast or page scrolled > 800px), render synchronously to prevent blank frame
    if (delta > 800) {
      if (this._scrollRenderRaf) {
        cancelAnimationFrame(this._scrollRenderRaf);
        this._scrollRenderRaf = null;
      }
      this._lastScrollRenderTop = currTop;
      this.updateLineNumbers(false);
      this.renderVisibleHighlights();
      return;
    }

    if (this._scrollRenderRaf) return;
    this._scrollRenderRaf = requestAnimationFrame(() => {
      this._scrollRenderRaf = null;
      this._lastScrollRenderTop = this.editorEl ? this.editorEl.scrollTop : 0;
      this.updateLineNumbers(false);
      this.renderVisibleHighlights();
    });
  }

  renderVisibleHighlights() {
    if (!this.editorHighlightsEl || !this.cachedHighlightedLines) return;
    const totalLines = this.cachedHighlightedLines.length;
    const scrollTop = this.editorEl ? Math.max(0, this.editorEl.scrollTop) : 0;
    const clientHeight = this.editorEl ? this.editorEl.clientHeight : 800;
    const currentWidth = this.editorEl ? this.editorEl.clientWidth : 0;

    // Ensure line metrics are always fully updated and in sync with totalLines and editor width
    if (!this._gutterLineTops || !this._gutterLineHeights || 
        this._gutterLineTops.length !== totalLines + 1 ||
        this.lastRenderedEditorWidth !== currentWidth) {
      this.updateLineNumbers(true);
    }

    const lineTops = this._gutterLineTops;
    const lineHeights = this._gutterLineHeights;
    const highlightedLines = this.cachedHighlightedLines;

    if (!lineTops || !lineHeights || lineTops.length !== totalLines + 1) {
      return;
    }

    // Binary search for visible start line
    let low = 0;
    let high = totalLines - 1;
    let startLine = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lineTops[mid + 1] <= scrollTop) {
        startLine = mid + 1;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    startLine = Math.min(startLine, totalLines - 1);

    let endLine = startLine;
    const viewBottom = scrollTop + clientHeight;
    while (endLine < totalLines && lineTops[endLine] < viewBottom) {
      endLine++;
    }

    // Generous overscan buffer (60 lines above, 60 lines below) so fast scrolling never reveals blank space
    const OVERSCAN = 60;
    startLine = Math.max(0, startLine - OVERSCAN);
    endLine = Math.min(totalLines, endLine + OVERSCAN);

    let rowsHtml = '';
    for (let i = startLine; i < endLine; i++) {
      const top = lineTops[i];
      const h = lineHeights[i];
      const formatted = highlightedLines[i] || '';
      rowsHtml += `<div style="position: absolute; top: ${top}px; height: ${h}px; left: 0; right: 0; overflow: hidden; white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word; word-break: normal;">${formatted}</div>`;
    }

    const totalHeight = this._gutterTotalHeight || (lineTops[totalLines] || totalLines * 24);
    this.editorHighlightsEl.innerHTML = `<div class="editor-highlights-virtual-container" style="position: relative; height: ${totalHeight}px; width: 100%; min-height: 100%;">${rowsHtml}</div>`;
  }

  highlightInline(text, inCodeBlock = false, codeBlockLang = '') {
    if (!text) return '';
    const hasLang = Boolean(inCodeBlock && codeBlockLang && codeBlockLang.trim().length > 0);
    let prismLang = null;

    if (hasLang && typeof Prism !== 'undefined') {
      let effectiveLang = codeBlockLang.trim().toLowerCase();
      if (effectiveLang === 'js') effectiveLang = 'javascript';
      else if (effectiveLang === 'ts') effectiveLang = 'typescript';
      else if (effectiveLang === 'py') effectiveLang = 'python';
      else if (effectiveLang === 'sh' || effectiveLang === 'shell' || effectiveLang === 'zsh') effectiveLang = 'bash';
      else if (effectiveLang === 'html' || effectiveLang === 'xml' || effectiveLang === 'svg') effectiveLang = 'markup';
      else if (effectiveLang === 'md') effectiveLang = 'markdown';
      else if (effectiveLang === 'yml') effectiveLang = 'yaml';

      if (Prism.languages[effectiveLang]) {
        prismLang = effectiveLang;
      }
    }

    if (inCodeBlock) {
      if (hasLang && prismLang && Prism.languages[prismLang]) {
        return Prism.highlight(text, Prism.languages[prismLang], prismLang);
      }
      return this.escapeHtml(text);
    } else if (typeof Prism !== 'undefined' && Prism.languages.markdown) {
      return Prism.highlight(text, Prism.languages.markdown, 'markdown');
    } else {
      return this.escapeHtml(text);
    }
  }

  formatOpenTagWithSwatch(tagRaw, lineIdx, mIdx, hex) {
    const currentHex = hex ? (hex.startsWith('#') ? hex : '#' + hex) : '';
    const mId = `cm-${lineIdx}-${mIdx}`;
    const swatchHtml = `<span class="macro-color-box-slot-center" data-macro-id="${mId}" data-line-index="${lineIdx}" data-color="${currentHex}"><span class="macro-inline-swatch ${currentHex ? '' : 'empty-swatch'}" style="${currentHex ? `background-color: ${currentHex};` : ''}" data-macro-id="${mId}" data-line-index="${lineIdx}"></span></span>`;

    const m = tagRaw.match(/^([\[<]color=)(\s*)(.*)$/i);
    if (m) {
      const tagPrefix = m[1]; // e.g. '[color=' or '<color='
      const spaces = m[2] || '';
      const tagSuffix = m[3] || '';
      const escapedPrefix = this.escapeHtml(tagPrefix);
      const escapedSuffix = this.escapeHtml(tagSuffix);

      if (spaces.length >= 2) {
        const spaceAfter = spaces.slice(1);
        return `<span class="token tag editor-color-tag">${escapedPrefix} </span>${swatchHtml}<span class="token tag editor-color-tag">${spaceAfter}${escapedSuffix}</span>`;
      } else if (spaces.length === 1) {
        return `<span class="token tag editor-color-tag">${escapedPrefix}</span>${swatchHtml}<span class="token tag editor-color-tag"> ${escapedSuffix}</span>`;
      } else {
        return `<span class="token tag editor-color-tag">${escapedPrefix}</span>${swatchHtml}<span class="token tag editor-color-tag">${escapedSuffix}</span>`;
      }
    }

    return `<span class="token tag editor-color-tag">${this.escapeHtml(tagRaw)}</span>`;
  }

  formatSingleLine(line, lineIdx = 0, inCodeBlock = false, codeBlockLang = '', colorEvents = null) {
    const trimmed = line.trim();

    if (trimmed && typeof trimmed.startsWith === 'function' && trimmed.startsWith('```')) {
      return `<span class="token code-fence">${this.escapeHtml(line)}</span>`;
    }

    if (/^\[sketch/i.test(trimmed) || /^\[\/sketch\]/i.test(trimmed)) {
      return `<span class="token sketch-tag" style="color: #a18a5e; font-weight: 700; opacity: 0.95;">${this.escapeHtml(line)}</span>`;
    }

    if (trimmed && typeof trimmed.startsWith === 'function' && trimmed.startsWith('<!--') && trimmed.includes('FOLD:') && trimmed.endsWith('-->')) {
      return `<span class="editor-fold-marker">${this.escapeHtml(line)}</span>`;
    }

    let lineHtml = '';

    // Handle color events for this line
    if (colorEvents && colorEvents.length > 0) {
      const ev = colorEvents[0];
      if (ev.role === 'multiInside') {
        const highlighted = this.highlightInline(line, inCodeBlock, codeBlockLang);
        lineHtml = `<span class="editor-colored-text" style="color: ${ev.pair.hex} !important;">${highlighted}</span>`;
      } else if (ev.role === 'multiClose') {
        const textBefore = line.slice(0, ev.pair.close.start);
        const closeTag = line.slice(ev.pair.close.start, ev.pair.close.end);
        const textAfter = line.slice(ev.pair.close.end);
        const beforeHtml = `<span class="editor-colored-text" style="color: ${ev.pair.hex} !important;">${this.highlightInline(textBefore, inCodeBlock, codeBlockLang)}</span>`;
        const closeHtml = `<span class="token tag editor-color-tag">${this.escapeHtml(closeTag)}</span>`;
        const afterHtml = this.highlightInline(textAfter, inCodeBlock, codeBlockLang);
        lineHtml = beforeHtml + closeHtml + afterHtml;
      } else if (ev.role === 'sameLinePair') {
        const textBefore = line.slice(0, ev.pair.open.start);
        const openTag = line.slice(ev.pair.open.start, ev.pair.open.end);
        const coloredText = line.slice(ev.pair.open.end, ev.pair.close.start);
        const closeTag = line.slice(ev.pair.close.start, ev.pair.close.end);
        const textAfter = line.slice(ev.pair.close.end);
        const beforeHtml = this.highlightInline(textBefore, inCodeBlock, codeBlockLang);
        const openHtml = this.formatOpenTagWithSwatch(openTag, lineIdx, 0, ev.pair.hex);
        const coloredHtml = `<span class="editor-colored-text" style="color: ${ev.pair.hex} !important;">${this.highlightInline(coloredText, inCodeBlock, codeBlockLang)}</span>`;
        const closeHtml = `<span class="token tag editor-color-tag">${this.escapeHtml(closeTag)}</span>`;
        const afterHtml = this.highlightInline(textAfter, inCodeBlock, codeBlockLang);
        lineHtml = beforeHtml + openHtml + coloredHtml + closeHtml + afterHtml;
      } else if (ev.role === 'multiOpen') {
        const textBefore = line.slice(0, ev.pair.open.start);
        const openTag = line.slice(ev.pair.open.start, ev.pair.open.end);
        const coloredText = line.slice(ev.pair.open.end);
        const beforeHtml = this.highlightInline(textBefore, inCodeBlock, codeBlockLang);
        const openHtml = this.formatOpenTagWithSwatch(openTag, lineIdx, 0, ev.pair.hex);
        const coloredHtml = `<span class="editor-colored-text" style="color: ${ev.pair.hex} !important;">${this.highlightInline(coloredText, inCodeBlock, codeBlockLang)}</span>`;
        lineHtml = beforeHtml + openHtml + coloredHtml;
      } else if (ev.role === 'unclosedOpen') {
        const textBefore = line.slice(0, ev.open.start);
        const openTag = line.slice(ev.open.start, ev.open.end);
        const coloredText = line.slice(ev.open.end);
        const beforeHtml = this.highlightInline(textBefore, inCodeBlock, codeBlockLang);
        const openHtml = this.formatOpenTagWithSwatch(openTag, lineIdx, 0, ev.open.hex);
        const coloredHtml = ev.open.hex
          ? `<span class="editor-colored-text" style="color: ${ev.open.hex} !important;">${this.highlightInline(coloredText, inCodeBlock, codeBlockLang)}</span>`
          : this.highlightInline(coloredText, inCodeBlock, codeBlockLang);
        lineHtml = beforeHtml + openHtml + coloredHtml;
      }
    } else {
      // Check if user is typing a color tag on this line (requires '=' to show color box)
      const typingMatch = line.match(/(?:\[|<)color\s*=\s*(?:<span[^>]*>)?(?:#([0-9a-fA-F]*))?(\]|\>)?/i);
      if (typingMatch && (line.includes('[color=') || line.includes('<color='))) {
        const start = typingMatch.index;
        const end = start + typingMatch[0].length;
        const prefix = line.slice(0, start);
        const tagRaw = typingMatch[0];
        const suffix = line.slice(end);
        const hex = typingMatch[1] ? (typingMatch[1].startsWith('#') ? typingMatch[1] : '#' + typingMatch[1]) : '';
        const openTagHtml = this.formatOpenTagWithSwatch(tagRaw, lineIdx, 0, hex);
        const suffixHtml = hex
          ? `<span class="editor-colored-text" style="color: ${hex} !important;">${this.highlightInline(suffix, inCodeBlock, codeBlockLang)}</span>`
          : this.highlightInline(suffix, inCodeBlock, codeBlockLang);
        lineHtml = this.highlightInline(prefix, inCodeBlock, codeBlockLang) + openTagHtml + suffixHtml;
      } else {
        lineHtml = this.highlightInline(line, inCodeBlock, codeBlockLang);
      }
    }

    if (inCodeBlock) {
      // ALWAYS wrap code block lines in .editor-code-line for blue code-like aesthetics & filled spacebars
      const content = lineHtml.length > 0 ? lineHtml : '&nbsp;';
      lineHtml = `<span class="editor-code-line">${content}</span>`;
    }

    // Fold markers (10% opacity)
    if (lineHtml.includes('FOLD:')) {
      lineHtml = lineHtml.replace(/<span class="token comment">&lt;!--\s*FOLD:.*?\s*--&gt;<\/span>/gi, match => `<span class="editor-fold-marker">${match}</span>`);
      lineHtml = lineHtml.replace(/&lt;!--\s*FOLD:.*?\s*--&gt;/gi, match => `<span class="editor-fold-marker">${match}</span>`);
      lineHtml = lineHtml.replace(/<!--\s*FOLD:.*?\s*-->/gi, match => `<span class="editor-fold-marker">${this.escapeHtml(match)}</span>`);
    }

    // Size tags & Liner tags highlight in editor
    if (lineHtml.includes('size') || lineHtml.includes('liner') || lineHtml.includes('[line]')) {
      lineHtml = lineHtml.replace(/(\[size\s*=\s*['"]?[0-9a-zA-Z.%]+['"]?\]|\[\/size\])/gi, '<span class="token tag editor-size-tag">$1</span>');
      lineHtml = lineHtml.replace(/(\[(?:liner|line|divider)\])/gi, '<span class="token tag editor-size-tag">$1</span>');
    }

    return lineHtml;
  }

  renderHighlightsFast(text, cursor = 0) {
    if (!this.showEditorHighlights) return;
    if (!this.cachedLines || !this.cachedHighlightedLines || this.cachedLines.length === 0) {
      this.renderHighlightsImmediate();
      return;
    }

    const newLines = text.split('\n');
    const oldLength = this.cachedLines.length;
    const newLength = newLines.length;

    // Fast cursor line index lookup
    let cursorLineIdx = 0;
    for (let i = 0, len = Math.min(cursor, text.length); i < len; i++) {
      if (text.charCodeAt(i) === 10) cursorLineIdx++;
    }

    const inCodeBlock = this.cachedCodeBlockStates ? Boolean(this.cachedCodeBlockStates[cursorLineIdx]) : false;
    const codeBlockLang = this.cachedCodeBlockLangs ? (this.cachedCodeBlockLangs[cursorLineIdx] || '') : '';

    if (newLength === oldLength) {
      // 1. Single line update (keystroke or backspace inside a line)
      let changedIdx = cursorLineIdx;
      if (changedIdx >= newLength) changedIdx = newLength - 1;

      if (newLines[changedIdx] === this.cachedLines[changedIdx]) {
        for (let i = 0; i < newLength; i++) {
          if (newLines[i] !== this.cachedLines[i]) {
            changedIdx = i;
            break;
          }
        }
      }

      if (changedIdx < newLength && newLines[changedIdx] !== this.cachedLines[changedIdx]) {
        // If backticks or color tags were added/removed/edited, trigger immediate pass
        if (newLines[changedIdx].includes('```') || this.cachedLines[changedIdx].includes('```') || newLines[changedIdx].includes('color') || this.cachedLines[changedIdx].includes('color')) {
          this.renderHighlightsImmediate();
          return;
        }

        this.cachedLines[changedIdx] = newLines[changedIdx];
        this.cachedHighlightedLines[changedIdx] = this.formatSingleLine(newLines[changedIdx], changedIdx, inCodeBlock, codeBlockLang);
        this.renderVisibleHighlights();
      }
    } else if (newLength === oldLength + 1) {
      // 2. User pressed Enter (line added)
      let splitIdx = -1;
      const expectedSplit = Math.max(0, Math.min(oldLength - 1, cursorLineIdx - 1));
      if (newLines[expectedSplit] !== this.cachedLines[expectedSplit] ||
          (expectedSplit + 1 < newLength && newLines[expectedSplit + 1] !== this.cachedLines[expectedSplit])) {
        splitIdx = expectedSplit;
      } else {
        for (let i = 0; i < oldLength; i++) {
          if (newLines[i] !== this.cachedLines[i]) {
            splitIdx = i;
            break;
          }
        }
      }
      if (splitIdx === -1) splitIdx = expectedSplit;

      const line1 = newLines[splitIdx];
      const line2 = newLines[splitIdx + 1];

      // If backticks, fences or colors are touched, trigger immediate full pass
      if (line1.includes('```') || line2.includes('```') || (this.cachedLines[splitIdx] && this.cachedLines[splitIdx].includes('```')) ||
          line1.includes('color') || line2.includes('color') || (this.cachedLines[splitIdx] && this.cachedLines[splitIdx].includes('color'))) {
        this.renderHighlightsImmediate();
        this.updateLineNumbers(true);
        return;
      }

      const splitState = this.cachedCodeBlockStates ? Boolean(this.cachedCodeBlockStates[splitIdx]) : false;
      const splitLang = this.cachedCodeBlockLangs ? (this.cachedCodeBlockLangs[splitIdx] || '') : '';

      const formatted1 = this.formatSingleLine(line1, splitIdx, splitState, splitLang);
      const formatted2 = this.formatSingleLine(line2, splitIdx + 1, splitState, splitLang);

      this.cachedLines.splice(splitIdx, 1, line1, line2);
      this.cachedHighlightedLines.splice(splitIdx, 1, formatted1, formatted2);

      // Keep codeblock states and langs arrays exactly aligned with the spliced line count
      if (this.cachedCodeBlockStates) {
        const nextStates = new Uint8Array(newLength);
        nextStates.set(this.cachedCodeBlockStates.subarray(0, splitIdx), 0);
        nextStates[splitIdx] = splitState ? 1 : 0;
        nextStates[splitIdx + 1] = splitState ? 1 : 0;
        nextStates.set(this.cachedCodeBlockStates.subarray(splitIdx + 1), splitIdx + 2);
        this.cachedCodeBlockStates = nextStates;
      }
      if (this.cachedCodeBlockLangs) {
        this.cachedCodeBlockLangs.splice(splitIdx, 1, splitLang, splitLang);
      }
      
      this.updateLineNumbers(true);
      this.renderVisibleHighlights();
    } else if (newLength === oldLength - 1) {
      // 3. User pressed Backspace/Delete (line merged)
      let mergeIdx = -1;
      const expectedMerge = Math.max(0, Math.min(newLength - 1, cursorLineIdx));
      if (expectedMerge < newLength && expectedMerge < oldLength && newLines[expectedMerge] !== this.cachedLines[expectedMerge]) {
        mergeIdx = expectedMerge;
      } else {
        for (let i = 0; i < newLength; i++) {
          if (newLines[i] !== this.cachedLines[i]) {
            mergeIdx = i;
            break;
          }
        }
      }
      if (mergeIdx === -1) mergeIdx = expectedMerge;

      const mergedLine = newLines[mergeIdx];
      if (mergedLine.includes('```') || 
          (this.cachedLines[mergeIdx] && this.cachedLines[mergeIdx].includes('```')) || 
          (this.cachedLines[mergeIdx + 1] && this.cachedLines[mergeIdx + 1].includes('```')) ||
          mergedLine.includes('color') || 
          (this.cachedLines[mergeIdx] && this.cachedLines[mergeIdx].includes('color')) || 
          (this.cachedLines[mergeIdx + 1] && this.cachedLines[mergeIdx + 1].includes('color'))) {
        this.renderHighlightsImmediate();
        this.updateLineNumbers(true);
        return;
      }

      const mergeState = this.cachedCodeBlockStates ? Boolean(this.cachedCodeBlockStates[mergeIdx]) : false;
      const mergeLang = this.cachedCodeBlockLangs ? (this.cachedCodeBlockLangs[mergeIdx] || '') : '';

      const formatted = this.formatSingleLine(mergedLine, mergeIdx, mergeState, mergeLang);

      this.cachedLines.splice(mergeIdx, 2, mergedLine);
      this.cachedHighlightedLines.splice(mergeIdx, 2, formatted);

      // Keep codeblock states and langs arrays exactly aligned with the spliced line count
      if (this.cachedCodeBlockStates) {
        const nextStates = new Uint8Array(newLength);
        nextStates.set(this.cachedCodeBlockStates.subarray(0, mergeIdx), 0);
        nextStates[mergeIdx] = mergeState ? 1 : 0;
        nextStates.set(this.cachedCodeBlockStates.subarray(mergeIdx + 2), mergeIdx + 1);
        this.cachedCodeBlockStates = nextStates;
      }
      if (this.cachedCodeBlockLangs) {
        this.cachedCodeBlockLangs.splice(mergeIdx, 2, mergeLang);
      }
      
      this.updateLineNumbers(true);
      this.renderVisibleHighlights();
    } else {
      // 4. Large paste or multi-line edit
      this.renderHighlightsImmediate();
      return;
    }

    // Schedule background full pass for syntax tokenization across lines (400ms debounce)
    clearTimeout(this._fullHighlightTimer);
    this._fullHighlightTimer = setTimeout(() => {
      this.renderHighlights();
    }, 400);
  }

  renderHighlightsImmediate() {
    if (!this.currentNote || this.viewMode !== 'editor') return;

    const text = this.editorEl.value;
    const query = this.editorSearchInput.value;
    const isSearchHidden = this.editorSearchWidget.classList.contains('hidden');
    const matchIndex = this.currentSearchMatchIndex;
    const scrollTop = this.editorEl.scrollTop;

    // Fast check: if nothing changed AND scroll window hasn't shifted significantly
    const editorWidth = this.editorEl ? this.editorEl.clientWidth : 0;
    const widthChanged = (this.lastRenderedHighlightWidth !== undefined && this.lastRenderedHighlightWidth !== editorWidth);
    const scrollDelta = Math.abs(scrollTop - (this.lastRenderedScrollTop || 0));
    if (!widthChanged &&
        text === this.lastRenderedText && 
        query === this.lastRenderedQuery && 
        isSearchHidden === this.lastSearchWidgetHidden &&
        matchIndex === this.lastRenderedMatchIndex &&
        scrollDelta < 100) {
      return;
    }

    this.lastRenderedHighlightWidth = editorWidth;
    this.lastRenderedText = text;
    this.lastRenderedQuery = query;
    this.lastSearchWidgetHidden = isSearchHidden;
    this.lastRenderedMatchIndex = matchIndex;
    this.lastRenderedScrollTop = scrollTop;
    
    try {
      // 1. Scan for color tags & compute manual enclosures vs single-line auto-closes
      const rawLines = text.split('\n');
      const totalLines = rawLines.length;

      const tags = [];
      const openRegex = /(?:\[|<)color\s*=\s*(?:#([0-9a-fA-F]{0,8}))?(?:\]|>)/gi;
      const closeRegex = /(?:\[\/color\]|<\/color>)/gi;

      for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
        const line = rawLines[lineIdx];
        if (!line.includes('color')) continue;

        let m;
        const oRe = new RegExp(openRegex.source, 'gi');
        while ((m = oRe.exec(line)) !== null) {
          tags.push({
            type: 'open',
            line: lineIdx,
            start: m.index,
            end: m.index + m[0].length,
            hex: m[1] ? (m[1].startsWith('#') ? m[1] : '#' + m[1]) : '',
            raw: m[0]
          });
        }
        const cRe = new RegExp(closeRegex.source, 'gi');
        while ((m = cRe.exec(line)) !== null) {
          tags.push({
            type: 'close',
            line: lineIdx,
            start: m.index,
            end: m.index + m[0].length,
            raw: m[0]
          });
        }
      }

      tags.sort((a, b) => a.line === b.line ? a.start - b.start : a.line - b.line);

      const matchedPairs = [];
      const stack = [];
      for (let tIdx = 0; tIdx < tags.length; tIdx++) {
        const t = tags[tIdx];
        if (t.type === 'open') {
          stack.push(t);
        } else if (t.type === 'close') {
          if (stack.length > 0) {
            const op = stack.pop();
            matchedPairs.push({ open: op, close: t, hex: op.hex });
          }
        }
      }
      const unclosedOpens = stack;

      // Group by line for O(1) lookup during line generation
      const lineTagMap = new Map();
      for (let pIdx = 0; pIdx < matchedPairs.length; pIdx++) {
        const p = matchedPairs[pIdx];
        if (p.open.line === p.close.line) {
          if (!lineTagMap.has(p.open.line)) lineTagMap.set(p.open.line, []);
          lineTagMap.get(p.open.line).push({ role: 'sameLinePair', pair: p });
        } else {
          if (!lineTagMap.has(p.open.line)) lineTagMap.set(p.open.line, []);
          lineTagMap.get(p.open.line).push({ role: 'multiOpen', pair: p });

          if (!lineTagMap.has(p.close.line)) lineTagMap.set(p.close.line, []);
          lineTagMap.get(p.close.line).push({ role: 'multiClose', pair: p });

          for (let l = p.open.line + 1; l < p.close.line; l++) {
            if (!lineTagMap.has(l)) lineTagMap.set(l, []);
            lineTagMap.get(l).push({ role: 'multiInside', pair: p });
          }
        }
      }

      for (let uIdx = 0; uIdx < unclosedOpens.length; uIdx++) {
        const u = unclosedOpens[uIdx];
        if (!lineTagMap.has(u.line)) lineTagMap.set(u.line, []);
        lineTagMap.get(u.line).push({ role: 'unclosedOpen', open: u });
      }

      // Configure Prism markdown once
      if (typeof Prism !== 'undefined' && Prism.languages.markdown) {
        if (!Prism.languages.markdown.wikilink) {
          Prism.languages.markdown.wikilink = {
            pattern: /\[\[.*?\]\]/,
            alias: 'wikilink'
          };
        }
      }

      if (!this._lineHighlightCache) this._lineHighlightCache = new Map();

      // OPTIMIZATION: Incremental line diffing via native C++ / WASM engine (Feature 3)
      let incrementalApplied = false;
      let highlightedLines;
      let codeBlockStates;
      let codeBlockLangs;

      if (this.wasmEngine && this.wasmEngine.isNativeEngineEnabled() && 
          this.cachedLines && this.cachedHighlightedLines && 
          this.cachedCodeBlockStates && this.cachedCodeBlockLangs &&
          this.cachedHighlightedLines.length === this.cachedLines.length) {
        
        const diff = this.wasmEngine.diffEngine.findLineDiff(this.cachedLines, rawLines);
        
        if (!diff.isFull && !diff.changed) {
          // Document lines unchanged
          highlightedLines = this.cachedHighlightedLines;
          codeBlockStates = this.cachedCodeBlockStates;
          codeBlockLangs = this.cachedCodeBlockLangs;
          incrementalApplied = true;
        } else if (!diff.isFull && diff.changed) {
          const p = diff.startLine;
          const oldEnd = diff.oldEndLine;
          const newEnd = diff.newEndLine;

          // Check whether code fence status remains consistent across the splice
          let inCodeBlock = (p > 0 && p <= this.cachedCodeBlockStates.length) 
            ? (this.cachedCodeBlockStates[p - 1] === 1) 
            : false;
          let codeBlockLang = (p > 0 && p <= this.cachedCodeBlockLangs.length)
            ? (this.cachedCodeBlockLangs[p - 1] || '')
            : '';
          
          let validSplice = true;
          const deltaHighlights = [];
          const deltaStates = [];
          const deltaLangs = [];

          let hasFenceInDiff = false;
          for (let i = p; i < newEnd; i++) {
            if (rawLines[i].includes('```')) { hasFenceInDiff = true; break; }
          }
          if (!hasFenceInDiff) {
            for (let i = p; i < oldEnd; i++) {
              if (this.cachedLines[i] && this.cachedLines[i].includes('```')) { hasFenceInDiff = true; break; }
            }
          }

          for (let i = p; i < newEnd; i++) {
            const line = rawLines[i];
            const trimmed = line ? line.trim() : '';

            if (trimmed && typeof trimmed.startsWith === 'function' && trimmed.startsWith('```')) {
              if (!inCodeBlock) {
                const afterOpening = trimmed.slice(3);
                const closingIdx = afterOpening.indexOf('```');
                if (closingIdx !== -1) {
                  // Single line code block (opens and closes on same line)
                  inCodeBlock = false;
                  codeBlockLang = '';
                } else {
                  inCodeBlock = true;
                  codeBlockLang = afterOpening.trim().toLowerCase().split(/\s+/)[0] || '';
                }
              } else {
                inCodeBlock = false;
                codeBlockLang = '';
              }
              deltaStates.push(1);
              deltaLangs.push('');
              deltaHighlights.push(`<span class="token code-fence">${this.escapeHtml(line)}</span>`);
              continue;
            }

            deltaStates.push(inCodeBlock ? 1 : 0);
            deltaLangs.push(codeBlockLang);

            const lineColorEvents = lineTagMap.get(i);
            const hasColorMacro = Boolean(lineColorEvents && lineColorEvents.length > 0);
            const cacheKey = !hasColorMacro && !line.includes('color') && !line.includes('FOLD:')
              ? `${inCodeBlock ? (codeBlockLang || 'plain_code') : 'md'}:${line}`
              : null;

            let formatted = cacheKey ? this._lineHighlightCache.get(cacheKey) : null;
            if (!formatted) {
              formatted = this.formatSingleLine(line, i, inCodeBlock, codeBlockLang, lineColorEvents);
              if (cacheKey) {
                if (this._lineHighlightCache.size > 8000) this._lineHighlightCache.clear();
                this._lineHighlightCache.set(cacheKey, formatted);
              }
            }
            deltaHighlights.push(formatted);
          }

          // Verify if suffix codeblock state and language are completely unperturbed
          const expectedSuffixState = (oldEnd < this.cachedCodeBlockStates.length)
            ? (this.cachedCodeBlockStates[oldEnd] === 1)
            : false;
          const expectedSuffixLang = (oldEnd < this.cachedCodeBlockLangs.length)
            ? (this.cachedCodeBlockLangs[oldEnd] || '')
            : '';
          
          if (!hasFenceInDiff && inCodeBlock === expectedSuffixState && (!inCodeBlock || codeBlockLang === expectedSuffixLang)) {
            highlightedLines = [
              ...this.cachedHighlightedLines.slice(0, p),
              ...deltaHighlights,
              ...this.cachedHighlightedLines.slice(oldEnd)
            ];
            codeBlockStates = new Uint8Array(totalLines);
            codeBlockStates.set(this.cachedCodeBlockStates.subarray(0, p), 0);
            codeBlockStates.set(new Uint8Array(deltaStates), p);
            codeBlockStates.set(this.cachedCodeBlockStates.subarray(oldEnd), newEnd);

            codeBlockLangs = [
              ...this.cachedCodeBlockLangs.slice(0, p),
              ...deltaLangs,
              ...this.cachedCodeBlockLangs.slice(oldEnd)
            ];
            incrementalApplied = true;
          }
        }
      }

      if (!incrementalApplied) {
        let inCodeBlock = false;
        let codeBlockLang = '';
        let codeBlockStartLine = -1;
        highlightedLines = new Array(totalLines);
        codeBlockStates = new Uint8Array(totalLines);
        codeBlockLangs = new Array(totalLines);

        for (let i = 0; i < totalLines; i++) {
          const line = rawLines[i];
          const trimmed = line ? line.trim() : '';

          // Track fenced code blocks continuously across the entire document
          if (trimmed && typeof trimmed.startsWith === 'function' && trimmed.startsWith('```')) {
            if (!inCodeBlock) {
              const afterOpening = trimmed.slice(3);
              const closingIdx = afterOpening.indexOf('```');
              if (closingIdx !== -1) {
                // Single line code block (opens and closes on same line, e.g. ```lua test ``` or ``` this ```)
                inCodeBlock = false;
                codeBlockLang = '';
                codeBlockStartLine = -1;
              } else {
                inCodeBlock = true;
                codeBlockLang = afterOpening.trim().toLowerCase().split(/\s+/)[0] || '';
                codeBlockStartLine = i;
              }
            } else {
              inCodeBlock = false;
              codeBlockLang = '';
              codeBlockStartLine = -1;
            }
            codeBlockStates[i] = 1;
            codeBlockLangs[i] = '';
            highlightedLines[i] = `<span class="token code-fence">${this.escapeHtml(line)}</span>`;
            continue;
          }

          // Safety cap: If an unclosed code block exceeds 500 lines, auto-close it to prevent lagging 80k words
          if (inCodeBlock && codeBlockStartLine >= 0 && (i - codeBlockStartLine > 500)) {
            inCodeBlock = false;
            codeBlockLang = '';
            codeBlockStartLine = -1;
          }

          codeBlockStates[i] = inCodeBlock ? 1 : 0;
          codeBlockLangs[i] = codeBlockLang;

          const lineColorEvents = lineTagMap.get(i);
          const hasColorMacro = Boolean(lineColorEvents && lineColorEvents.length > 0);
          
          // Use cached formatted line if available and no dynamic macros/folding
          const cacheKey = !hasColorMacro && !line.includes('color') && !line.includes('FOLD:')
            ? `${inCodeBlock ? (codeBlockLang || 'plain_code') : 'md'}:${line}`
            : null;

          let formatted = cacheKey ? this._lineHighlightCache.get(cacheKey) : null;
          if (!formatted) {
            formatted = this.formatSingleLine(line, i, inCodeBlock, codeBlockLang, lineColorEvents);
            if (cacheKey) {
              if (this._lineHighlightCache.size > 8000) this._lineHighlightCache.clear();
              this._lineHighlightCache.set(cacheKey, formatted);
            }
          }
          highlightedLines[i] = formatted;
        }
      }

      this.cachedLines = rawLines.slice();
      this.cachedHighlightedLines = highlightedLines.slice();
      this.cachedCodeBlockStates = codeBlockStates;
      this.cachedCodeBlockLangs = codeBlockLangs;

      this.updateLineNumbers(false);
      this.renderVisibleHighlights();

      if (this.editorColorWidgets) {
        this.editorColorWidgets.innerHTML = '';
      }

      // 2. Search Highlights
      if (!query || this.editorSearchWidget.classList.contains('hidden')) {
        if (this.searchMarksEl.innerHTML !== '') {
          this.searchMarksEl.innerHTML = '';
        }
        this.syncAllEditorScrolls();
        return;
      }

      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      
      let lastIndex = 0;
      let html = '';
      let match;
      let count = 0;

      while ((match = regex.exec(text)) !== null) {
        html += this.escapeHtml(text.substring(lastIndex, match.index));
        const isCurrent = (count === this.currentSearchMatchIndex);
        html += `<mark class="${isCurrent ? 'current' : ''}">${this.escapeHtml(match[0])}</mark>`;
        lastIndex = regex.lastIndex;
        count++;
      }
      html += this.escapeHtml(text.substring(lastIndex));
      this.searchMarksEl.innerHTML = html + '\n';
    } catch (e) {
      console.warn("Highlighter failed:", e);
      if (this.editorHighlightsEl) this.editorHighlightsEl.innerHTML = this.escapeHtml(text) + '\n';
    }
    this.syncAllEditorScrolls();
  }

  escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  goToNextMatch() {
    if (this.editorSearchMatches.length === 0) return;
    this.currentSearchMatchIndex = (this.currentSearchMatchIndex + 1) % this.editorSearchMatches.length;
    this.highlightMatch(false);
    this.updateSearchUI();
  }

  goToPrevMatch() {
    if (this.editorSearchMatches.length === 0) return;
    this.currentSearchMatchIndex = (this.currentSearchMatchIndex - 1 + this.editorSearchMatches.length) % this.editorSearchMatches.length;
    this.highlightMatch(false);
    this.updateSearchUI();
  }

  async purgeVault() {
    const btn = document.getElementById('purge-vault-btn');
    if (!this._vaultPurgeStep) this._vaultPurgeStep = 0;
    this._vaultPurgeStep++;

    if (this._purgeGlobalTimeout) clearTimeout(this._purgeGlobalTimeout);

    if (this._vaultPurgeStep === 1) {
      btn.textContent = 'REALLY? (IRREVERSIBLE)';
      btn.className = 'btn-danger'; // Standard red
    } else if (this._vaultPurgeStep === 2) {
      btn.textContent = 'EVERYTHING WILL BE GONE!';
      btn.className = 'btn-danger-dark'; // Darker red
    } else if (this._vaultPurgeStep === 3) {
      btn.textContent = 'ARE YOU REALLY REALLY SURE?';
      btn.className = 'btn-danger-extreme'; // Deep red
    } else if (this._vaultPurgeStep === 4) {
      await this.vault.clear();
      localStorage.removeItem('caveman-current-note-id');
      location.reload();
      return;
    }

    this._purgeGlobalTimeout = setTimeout(() => {
      this._vaultPurgeStep = 0;
      btn.textContent = 'PURGE ENTIRE VAULT';
      btn.className = '';
    }, 4000); // Give them 4 seconds between clicks
  }

  async purgeUnusedImages() {
    const allNotes = await this.vault.getNotes();
    const images = await this.vault.getAllImages();
    const usedImageIds = new Set();
    
     // Updated regex to correctly identify IDs even with sizing, scale and alignment arguments
    // ![[img-id]] or ![[img-id 100 100]] or ![[img-id 40% c]]
    const imgPattern = /!\[\[(img-[a-zA-Z0-9_-]*)(?:\s+[^\]]+)?\]\]/g;
    
    allNotes.forEach(note => {
      let match;
      const content = note.content || '';
      while ((match = imgPattern.exec(content)) !== null) {
        usedImageIds.add(match[1].trim());
      }
    });
    
    const unused = images.filter(img => !usedImageIds.has(img.id));
    
    const btn = document.getElementById('purge-images-btn');
    if (unused.length === 0) {
      this.statusMessenger("Vault is clean.", "success");
      btn.textContent = "Purge Unused Images";
      btn.classList.remove('btn-danger');
      return;
    }

    if (!this._purgeStep) this._purgeStep = 0;
    this._purgeStep++;

    if (this._purgeStep === 1) {
      btn.textContent = `CONFIRM PURGE (${unused.length})?`;
      btn.classList.add('btn-danger');
      this._purgeTimeout = setTimeout(() => {
        this._purgeStep = 0;
        btn.textContent = "Purge Unused Images";
        btn.classList.remove('btn-danger');
      }, 3000);
      return;
    }

    if (this._purgeStep === 2) {
      clearTimeout(this._purgeTimeout);
      for (const img of unused) {
        await this.vault.deleteImage(img.id);
      }
      this.statusMessenger(`Purged ${unused.length} images.`, "success");
      this._purgeStep = 0;
      btn.textContent = "Purge Unused Images";
      btn.classList.remove('btn-danger');
      this.openDatabaseMenu();
    }
  }

  async exportVault() {
    this.statusMessenger("Creating ZIP...", "info");
    try {
      const zip = new JSZip();
      const images = await this.vault.getAllImages();
      const notesToExport = this.notes.filter(n => !n.isPublic);

      zip.file("notes.json", JSON.stringify(notesToExport, null, 2));
      zip.file("folder-settings.json", JSON.stringify(this.folderSettings, null, 2));
      zip.file("custom-folders.json", JSON.stringify(this.customFolders || [], null, 2));
      zip.file("tint-palette.json", JSON.stringify(this.tintPalette, null, 2));
      zip.file("collapsed-folders.json", JSON.stringify(this.collapsedFolders, null, 2));
      
      const imgFolder = zip.folder("images");
      for (const img of images) {
        const base64Data = img.data.split(',')[1];
        if (base64Data) {
          imgFolder.file(`${img.id}.png`, base64Data, { base64: true });
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `caveman-vault-full-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      this.statusMessenger("Exported ZIP", "success");
    } catch (e) {
      console.error(e);
      this.statusMessenger("Export Failed", "error");
    }
  }

  downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importVault(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log("Importing file:", file.name);
    if (!window.JSZip && typeof JSZip === 'undefined') {
      console.error("JSZip not loaded");
      this.statusMessenger("JSZip library missing", "error");
      return;
    }
    
    if (file.name.toLowerCase().endsWith('.zip')) {
      await this.importZip(file);
    } else {
      await this.importJson(file);
    }
    // Reset picker
    e.target.value = '';
  }

  async importJson(file) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.notes) {
          for (const note of data.notes) {
            await this.vault.saveNote(note);
          }
          if (data.images) {
            for (const img of data.images) {
              await this.vault.saveImage(img.id, img.data);
            }
          }
          if (data.folderSettings) {
            this.folderSettings = { ...this.folderSettings, ...data.folderSettings };
            localStorage.setItem('caveman-folder-settings', JSON.stringify(this.folderSettings));
          }
          if (data.customFolders) {
            this.customFolders = [...new Set([...(this.customFolders || []), ...data.customFolders])];
            localStorage.setItem('caveman-custom-folders', JSON.stringify(this.customFolders));
          }
          if (data.tintPalette) {
            this.tintPalette = data.tintPalette;
            localStorage.setItem('caveman-tint-palette', JSON.stringify(this.tintPalette));
          }
          if (data.collapsedFolders) {
            this.collapsedFolders = [...new Set([...this.collapsedFolders, ...data.collapsedFolders])];
            localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
          }
          this.statusMessenger(`Imported ${data.notes.length} notes.`, "success");
          await this.loadNotes();
          if (this.notes.length > 0) this.selectNote(this.notes[0]);
        }
      } catch (err) {
        this.statusMessenger("Invalid file format", "error");
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  async importZip(file) {
    this.statusMessenger("Unzipping...", "info");
    try {
      const zip = await JSZip.loadAsync(file);
      const notesFile = zip.file("notes.json");
      if (!notesFile) throw new Error("No notes.json found in ZIP");
      
      const notesData = JSON.parse(await notesFile.async("string"));
      for (const note of notesData) {
        await this.vault.saveNote(note);
      }

      const settingsFile = zip.file("folder-settings.json");
      if (settingsFile) {
        const settingsData = JSON.parse(await settingsFile.async("string"));
        this.folderSettings = { ...this.folderSettings, ...settingsData };
        localStorage.setItem('caveman-folder-settings', JSON.stringify(this.folderSettings));
      }

      const customFoldersFile = zip.file("custom-folders.json");
      if (customFoldersFile) {
        const customFoldersData = JSON.parse(await customFoldersFile.async("string"));
        this.customFolders = [...new Set([...(this.customFolders || []), ...customFoldersData])];
        localStorage.setItem('caveman-custom-folders', JSON.stringify(this.customFolders));
      }

      const paletteFile = zip.file("tint-palette.json");
      if (paletteFile) {
        const paletteData = JSON.parse(await paletteFile.async("string"));
        this.tintPalette = paletteData;
        localStorage.setItem('caveman-tint-palette', JSON.stringify(this.tintPalette));
      }

      const collapsedFile = zip.file("collapsed-folders.json");
      if (collapsedFile) {
        const collapsedData = JSON.parse(await collapsedFile.async("string"));
        this.collapsedFolders = [...new Set([...this.collapsedFolders, ...collapsedData])];
        localStorage.setItem('caveman-collapsed-folders', JSON.stringify(this.collapsedFolders));
      }

      const imgFolder = zip.folder("images");
      let imgCount = 0;
      if (imgFolder) {
        const files = [];
        imgFolder.forEach((path, file) => {
          if (!file.dir) files.push(file);
        });

        for (const f of files) {
          const id = f.name.split('/').pop().replace('.png', '').replace('.jpg', '').replace('.jpeg', '');
          const binaryData = await f.async("base64");
          // Reconstruct as PNG DataURL (safest assumption for alpha preservation)
          const dataUrl = `data:image/png;base64,${binaryData}`;
          await this.vault.saveImage(id, dataUrl);
          imgCount++;
        }
      }

      this.statusMessenger(`Imported ${notesData.length} items.`, "success");
      await this.loadNotes();
      if (this.notes.length > 0) this.selectNote(this.notes[0]);
    } catch (e) {
       console.error(e);
       this.statusMessenger("ZIP import failed", "error");
    }
  }

  statusMessenger(msg, type = "info") {
    this.lastSavedEl.textContent = msg;
    if (type === "success") this.lastSavedEl.style.color = "#44ff44";
    else if (type === "error") this.lastSavedEl.style.color = "#ff4444";
    else this.lastSavedEl.style.color = "";
    
    setTimeout(() => {
      this.lastSavedEl.textContent = "Ready";
      this.lastSavedEl.style.color = "";
    }, 4000);
  }

  getCharWidth() {
    if (!this.cachedCharWidth || this.cachedCharWidth <= 0) {
      const span = document.createElement('span');
      span.style.fontFamily = 'var(--font-mono)';
      span.style.fontSize = 'var(--zoom-scale, 14px)';
      span.style.fontWeight = '400';
      span.style.letterSpacing = '0px';
      span.style.wordSpacing = '0px';
      span.style.fontVariantLigatures = 'none';
      span.style.fontKerning = 'none';
      span.style.fontStretch = 'normal';
      span.style.whiteSpace = 'pre';
      span.style.padding = '0';
      span.style.border = 'none';
      span.style.margin = '0';
      span.style.position = 'absolute';
      span.style.visibility = 'hidden';
      span.style.top = '-9999px';
      span.textContent = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW'; // 40 chars
      document.body.appendChild(span);
      this.cachedCharWidth = span.getBoundingClientRect().width / 40;
      span.remove();
      if (!this.cachedCharWidth || isNaN(this.cachedCharWidth) || this.cachedCharWidth <= 0) this.cachedCharWidth = 8.4;
    }
    return this.cachedCharWidth;
  }

  getLineHeight() {
    if (!this.cachedLineHeight || this.cachedLineHeight <= 0) {
      const style = window.getComputedStyle(this.editorEl);
      let lh = Math.round(parseFloat(style.lineHeight));
      if (isNaN(lh) || lh <= 0) {
        lh = Math.round(parseFloat(style.fontSize) * 1.6);
      }
      this.cachedLineHeight = lh || 24;
    }
    return this.cachedLineHeight;
  }

  countVisualLines(text, maxChars) {
    if (!text) return 1;
    // Normalize tabs to 4 spaces to match tab-size: 4
    const expanded = text.includes('\t') ? text.replace(/\t/g, '    ') : text;
    if (expanded.length <= maxChars) return 1;
    let count = 0;
    let idx = 0;
    const len = expanded.length;
    while (idx < len) {
      count++;
      if (idx + maxChars >= len) break;
      let breakIdx = expanded.lastIndexOf(' ', idx + maxChars);
      if (breakIdx <= idx) {
        idx += maxChars;
      } else {
        idx = breakIdx + 1;
      }
    }
    return Math.max(1, count);
  }

  requestFastLineNumbers(force = false) {
    if (force) this._lineNumberForce = true;
    if (this._lineNumberRaf) return;
    this._lineNumberRaf = requestAnimationFrame(() => {
      this._lineNumberRaf = null;
      const shouldForce = Boolean(this._lineNumberForce);
      this._lineNumberForce = false;
      this.updateLineNumbers(shouldForce);
    });
  }

  updateLineNumbers(force = false) {
    if (!this.lineNumbersEl || !this.editorEl) return;
    
    const editorWidth = this.editorEl.clientWidth;
    const text = this.editorEl.value;
    const lines = text.split('\n');
    const totalLines = lines.length;

    const charWidth = this.getCharWidth();
    const lineHeight = this.getLineHeight();
    const usableWidth = Math.max(100, editorWidth - 52);
    const maxCharsPerLine = Math.max(10, Math.floor(usableWidth / charWidth));

    const needsMetrics = force || 
                         text !== this._lastGutterText ||
                         totalLines !== this.lastRenderedLineCount || 
                         editorWidth !== this.lastRenderedEditorWidth || 
                         !this._gutterLineTops || 
                         this._gutterLineTops.length !== totalLines + 1;

    if (needsMetrics) {
      this._lastGutterText = text;
      this.lastRenderedLineCount = totalLines;
      this.lastRenderedEditorWidth = editorWidth;

      // Fast layout metrics calculation using integer arithmetic to eliminate subpixel drift
      const lineHeights = new Int32Array(totalLines);
      const lineTops = new Int32Array(totalLines + 1);
      const headingLevels = new Int8Array(totalLines);
      const lineDisplayNumbers = new Int32Array(totalLines);
      let runningTop = 0;
      let currentDocLine = 1;
      let inSketchSpacerUntil = -1;

      for (let i = 0; i < totalLines; i++) {
        const lineText = lines[i];
        let visualLines = 1;
        if (lineText.length > maxCharsPerLine) {
          visualLines = this.countVisualLines(lineText, maxCharsPerLine);
        }
        const h = visualLines * lineHeight;
        lineHeights[i] = h;
        lineTops[i] = runningTop;
        runningTop += h;

        const match = lineText.match(/^(\s*#{1,6})\s+/);
        headingLevels[i] = match ? match[1].trim().length : 0;

        const parsedSketch = this.sketchManager ? this.sketchManager.parseSketchTag(lineText) : null;
        if (parsedSketch) {
          const sketchH = parsedSketch.height;
          const spacerCount = this.getSketchSpacerCount(sketchH);
          lineDisplayNumbers[i] = currentDocLine++;
          inSketchSpacerUntil = i + spacerCount;
          continue;
        }

        if (i <= inSketchSpacerUntil) {
          if (lineText.trim() === '') {
            // Inside sketch spacer rows - skip numbering
            lineDisplayNumbers[i] = 0;
            continue;
          } else {
            inSketchSpacerUntil = -1;
          }
        }

        lineDisplayNumbers[i] = currentDocLine++;
      }
      lineTops[totalLines] = runningTop;

      this._gutterLineHeights = lineHeights;
      this._gutterLineTops = lineTops;
      this._gutterHeadingLevels = headingLevels;
      this._gutterLineDisplayNumbers = lineDisplayNumbers;

      if (this.sketchManager && this.viewMode === 'editor') {
        this.sketchManager.syncWidgets(lines, lineTops);
      }

      const editorScrollHeight = this.editorEl.scrollHeight || runningTop;
      this._gutterTotalHeight = Math.max(runningTop, editorScrollHeight);
      this._gutterLines = lines;
    }

    // Determine visible window from current scroll position
    const scrollTop = this.editorEl.scrollTop;
    const clientHeight = this.editorEl.clientHeight || 800;
    const lineTops = this._gutterLineTops;
    const lineHeights = this._gutterLineHeights;
    const headingLevels = this._gutterHeadingLevels;
    const cachedLines = this._gutterLines || lines;

    // Fast binary search for visible start line
    let low = 0;
    let high = totalLines - 1;
    let startLine = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lineTops[mid + 1] <= scrollTop) {
        startLine = mid + 1;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    startLine = Math.min(startLine, totalLines - 1);

    let endLine = startLine;
    const viewBottom = scrollTop + clientHeight;
    while (endLine < totalLines && lineTops[endLine] < viewBottom) {
      endLine++;
    }

    // Generous overscan buffer (60 lines above, 60 lines below) matching renderVisibleHighlights
    const OVERSCAN = 60;
    startLine = Math.max(0, startLine - OVERSCAN);
    endLine = Math.min(totalLines, endLine + OVERSCAN);

    // Fast exit if visible range & metrics have not changed
    if (!force && 
        !needsMetrics &&
        startLine === this._lastGutterStart && 
        endLine === this._lastGutterEnd) {
      return;
    }

    this._lastGutterStart = startLine;
    this._lastGutterEnd = endLine;

    // Render ONLY the ~35-45 visible line rows (takes ~0.04ms instead of 25ms!)
    let rowsHtml = '';
    for (let i = startLine; i < endLine; i++) {
      const top = lineTops[i];
      const h = lineHeights[i];
      const level = headingLevels[i];
      const isHeading = level > 0;

      let indicatorHtml = '';
      let foldClass = '';
      if (isHeading) {
        let isFolded = false;
        let foldId = '';
        for (let checkIdx = i + 1; checkIdx < totalLines; checkIdx++) {
          const checkLine = cachedLines[checkIdx];
          if (!checkLine || checkLine.trim() === '') continue; // Skip blank lines
          const foldMatch = checkLine.match(/^<!--\s*FOLD:(.*?)\s*-->$/);
          if (foldMatch) {
            isFolded = true;
            foldId = foldMatch[1].trim();
          }
          break; // Stop at first non-empty line
        }

        if (isFolded) {
          indicatorHtml = `<span class="fold-indicator collapsed" data-line-index="${i}" data-fold-id="${foldId}">▶</span>`;
          foldClass = ' has-fold is-folded';
        } else {
          let hasContent = false;
          for (let nextIdx = i + 1; nextIdx < totalLines; nextIdx++) {
            const nextLevel = headingLevels[nextIdx];
            if (nextLevel > 0 && nextLevel <= level) break;
            if (cachedLines && cachedLines[nextIdx] && cachedLines[nextIdx].trim() !== '') {
              hasContent = true;
              break;
            }
          }
          if (hasContent) {
            indicatorHtml = `<span class="fold-indicator expanded" data-line-index="${i}">▼</span>`;
            foldClass = ' has-fold is-expanded';
          }
        }
      }

      const dispNum = this._gutterLineDisplayNumbers ? this._gutterLineDisplayNumbers[i] : (i + 1);
      const numText = dispNum > 0 ? `${dispNum}` : '';
      const isSpacer = dispNum === 0;
      const spacerClass = isSpacer ? ' sketch-spacer-gutter' : '';

      rowsHtml += `<div class="line-number-row${foldClass}${spacerClass}" style="position: absolute; top: ${top}px; height: ${h}px; line-height: ${lineHeight}px; left: 0; right: 0;">${indicatorHtml}<span class="line-num-text">${numText}</span></div>`;
    }

    this.lineNumbersEl.innerHTML = `<div class="line-numbers-virtual-container" style="position: relative; height: ${this._gutterTotalHeight}px; width: 100%; min-height: 100%;">${rowsHtml}</div>`;
    this.syncAllEditorScrolls();
  }

  scopeStyles(html) {
    if (!html) return '';
    // Find all <style> blocks and scope them to the #preview container
    return html.replace(/<style>([\s\S]*?)<\/style>/gi, (match, css) => {
      // Simple regex to find selectors before a '{'
      // This is not a full CSS parser but covers typical user-written styles in markdown
      const scopedCss = css.replace(/([^\r\n,{}]+)(?=[^{}]*{)/g, (selector) => {
        return selector.split(',').map(s => {
          let part = s.trim();
          if (!part) return '';
          
          // Skip at-rules (like @keyframes, @media)
          if (part && typeof part.startsWith === 'function' && part.startsWith('@')) return part;
          
          // Skip common keyframe keywords
          if (part === 'from' || part === 'to' || /^\d+%$/.test(part)) return part;

          // Replace body/html with #preview scope
          if (part === 'body' || part === 'html') return '#preview';
          
          // Handle root pseudo-classes/elements attached to #preview
          if (part && typeof part.startsWith === 'function' && part.startsWith(':')) return `#preview${part}`;

          // Prepend #preview selector to restrict scope
          return `#preview ${part}`;
        }).filter(s => s).join(', ');
      });
      return `<style>${scopedCss}</style>`;
    });
  }

  autoPlantSketch(text, cursorPos = -1) {
    return this.reconcileSketchSpacers(text, cursorPos);
  }

  /**
   * Unified Flex Sketch Reconciler (Feature Request: Robust 'flex' behavior)
   * Enforces the universal invariant:
   * 1. Every [sketch:id w h] tag is followed by EXACTLY getSketchSpacerCount(h) blank lines.
   * 2. If a sketch is removed/cut, its orphaned spacer lines collapse immediately.
   * 3. If a sketch is pasted/added, required spacer lines are extended immediately.
   * 4. If a sketch's height changes (e.g. 500 -> 300 or 300 -> 600), spacer lines expand/contract to fit without gaps or overlap.
   * 5. Preserves cursor position seamlessly.
   */
  reconcileSketchSpacers(text, cursorPos = -1) {
    if (!text || typeof text !== 'string') {
      if (this._lastKnownSketches) this._lastKnownSketches.clear();
      return { modified: false, text: text || '', cursor: cursorPos };
    }

    if (!this._lastKnownSketches) {
      this._lastKnownSketches = new Map(); // id -> { id, height, lineIdx, spacerCount }
    }

    let lines = text.split('\n');
    let modified = false;

    // Scan all current sketches in document
    const currentSketches = new Map();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (/^\[\/sketch\]/i.test(trimmed)) {
        lines.splice(i, 1);
        modified = true;
        i--;
        continue;
      }
      const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(trimmed) : null;
      if (parsed) {
        let id = parsed.id;
        if (!id) {
          id = 'sk-' + Math.random().toString(36).substring(2, 8);
          parsed.id = id;
          lines[i] = `[sketch:${id} ${parsed.width} ${parsed.height}]`;
          modified = true;
        }
        const neededSpacers = this.getSketchSpacerCount(parsed.height);
        currentSketches.set(id, {
          id,
          lineIdx: i,
          width: parsed.width,
          height: parsed.height,
          neededSpacers
        });
      }
    }

    // 1. COLLAPSE ORPHANED SPACERS: If a sketch was deleted / cut, collapse its spacer lines!
    const removedSketches = [];
    for (const [id, lastInfo] of this._lastKnownSketches.entries()) {
      if (!currentSketches.has(id)) {
        removedSketches.push(lastInfo);
      }
    }

    if (removedSketches.length > 0) {
      // Sort in descending line index so earlier line indices remain valid during splicing
      removedSketches.sort((a, b) => b.lineIdx - a.lineIdx);
      for (const info of removedSketches) {
        const targetLine = Math.min(info.lineIdx, lines.length - 1);
        if (targetLine >= 0) {
          let emptyCount = 0;
          while (targetLine + emptyCount < lines.length && lines[targetLine + emptyCount].trim() === '' && emptyCount < info.spacerCount) {
            emptyCount++;
          }
          if (emptyCount > 0) {
            let charOffset = 0;
            for (let k = 0; k < targetLine; k++) charOffset += lines[k].length + 1;
            
            lines.splice(targetLine, emptyCount);
            modified = true;
            
            if (cursorPos !== -1 && cursorPos >= charOffset) {
              cursorPos = Math.max(charOffset, cursorPos - emptyCount);
            }
          }
        }
      }
    }

    // 2. RECONCILE SPACERS FOR EVERY CURRENT SKETCH (Delta Flex - preserves user blank lines)
    const updatedKnownSketches = new Map();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(trimmed) : null;
      if (parsed) {
        const id = parsed.id || ('sk-' + Math.random().toString(36).substring(2, 8));
        const neededSpacers = this.getSketchSpacerCount(parsed.height);
        const lastInfo = this._lastKnownSketches.get(id);

        // Count actual consecutive blank lines directly below this sketch in lines
        let currentBlanks = 0;
        while (i + 1 + currentBlanks < lines.length && lines[i + 1 + currentBlanks].trim() === '') {
          currentBlanks++;
        }

        if (currentBlanks < neededSpacers) {
          // Not enough blank lines! Extend immediately (paste, cut & paste, new sketch, height increase)
          const toAdd = neededSpacers - currentBlanks;
          const spliceLine = i + 1 + currentBlanks;
          let charOffset = 0;
          for (let k = 0; k < spliceLine; k++) charOffset += lines[k].length + 1;
          const newSpacers = new Array(toAdd).fill('');
          lines.splice(spliceLine, 0, ...newSpacers);
          modified = true;
          if (cursorPos !== -1 && cursorPos >= charOffset) cursorPos += toAdd;
          currentBlanks = neededSpacers;
        } else if (currentBlanks > neededSpacers && lastInfo && lastInfo.height > parsed.height) {
          // Tag height was explicitly decreased! Collapse excess delta!
          const prevSpacers = this.getSketchSpacerCount(lastInfo.height);
          const delta = prevSpacers - neededSpacers;
          const toRemove = Math.min(delta, currentBlanks - neededSpacers);
          if (toRemove > 0) {
            const spliceLine = i + 1 + neededSpacers;
            let charOffset = 0;
            for (let k = 0; k < spliceLine; k++) charOffset += lines[k].length + 1;
            lines.splice(spliceLine, toRemove);
            modified = true;
            if (cursorPos !== -1 && cursorPos >= charOffset) {
              cursorPos = Math.max(charOffset, cursorPos - toRemove);
            }
            currentBlanks -= toRemove;
          }
        }

        updatedKnownSketches.set(id, {
          id,
          lineIdx: i,
          width: parsed.width,
          height: parsed.height,
          spacerCount: neededSpacers
        });
        i += neededSpacers;
      }
    }

    this._lastKnownSketches = updatedKnownSketches;

    if (!modified) {
      return { modified: false, text, cursor: cursorPos };
    }

    const newText = lines.join('\n');
    let newCursor = cursorPos;
    if (cursorPos !== -1) {
      newCursor = Math.min(newText.length, Math.max(0, cursorPos));
    }
    return { modified: true, text: newText, cursor: newCursor };
  }

  getCleanMarkdown(text, visited = new Set()) {
    if (!text) return '';
    
    // Strip sketch spacer blank lines so note content is clean 1-line declarations
    const rawLines = text.split('\n');
    const cleanLinesNoSpacers = [];
    let inSpacerUntil = -1;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      const parsed = this.sketchManager ? this.sketchManager.parseSketchTag(line) : null;
      if (parsed) {
        const h = parsed.height || 300;
        const spacerCount = this.getSketchSpacerCount(h);
        cleanLinesNoSpacers.push(line);
        inSpacerUntil = i + spacerCount;
        continue;
      }

      if (i <= inSpacerUntil && trimmed === '') {
        continue;
      }

      if (i <= inSpacerUntil && trimmed !== '') {
        inSpacerUntil = -1;
      }

      cleanLinesNoSpacers.push(line);
    }

    const processedText = cleanLinesNoSpacers.join('\n');
    if (!processedText.includes('<!-- FOLD:')) return processedText;

    const lines = processedText.split('\n');
    const cleanLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^<!--\s*FOLD:(.*?)\s*-->$/);
      if (match) {
        const id = match[1].trim();
        if (visited.has(id)) continue; // Prevent circular reference / max call stack size exceeded
        visited.add(id);

        let content = null;
        if (this.editorFoldMap && this.editorFoldMap.has(id)) {
          content = this.editorFoldMap.get(id);
        } else if (this.currentNote && this.currentNote.foldMap && this.currentNote.foldMap[id]) {
          content = this.currentNote.foldMap[id];
        } else if (!id.startsWith('f_')) {
          if (/^[A-Za-z0-9+/=]+$/.test(id)) {
            try {
              content = decodeURIComponent(escape(atob(id)));
            } catch (_) {}
          }
        }

        if (content !== null && content !== undefined) {
          cleanLines.push(this.getCleanMarkdown(content, visited));
        }
      } else {
        cleanLines.push(line);
      }
    }
    return cleanLines.join('\n');
  }

  getActiveFoldIds() {
    const activeIds = new Set();
    const text = this.editorEl ? this.editorEl.value : '';
    const regex = /<!--\s*FOLD:(.*?)\s*-->/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      activeIds.add(match[1].trim());
    }
    // Recursively collect nested fold IDs
    let added = true;
    while (added) {
      added = false;
      for (const id of Array.from(activeIds)) {
        if (this.editorFoldMap && this.editorFoldMap.has(id)) {
          const content = this.editorFoldMap.get(id);
          if (typeof content === 'string' && content.includes('<!-- FOLD:')) {
            let innerMatch;
            const innerRegex = /<!--\s*FOLD:(.*?)\s*-->/g;
            while ((innerMatch = innerRegex.exec(content)) !== null) {
              const innerId = innerMatch[1].trim();
              if (!activeIds.has(innerId)) {
                activeIds.add(innerId);
                added = true;
              }
            }
          }
        }
      }
    }
    return activeIds;
  }

  pruneFoldMap() {
    if (!this.editorFoldMap) return;
    const activeIds = this.getActiveFoldIds();
    for (const key of Array.from(this.editorFoldMap.keys())) {
      if (!activeIds.has(key)) {
        this.editorFoldMap.delete(key);
      }
    }
    if (this.currentNote && this.currentNote.foldMap) {
      for (const key of Object.keys(this.currentNote.foldMap)) {
        if (!activeIds.has(key)) {
          delete this.currentNote.foldMap[key];
        }
      }
    }
  }

  saveFoldedHeadingsState() {
    if (!this.currentNote) return;
    const noteKey = `caveman-folded-${this.currentNote.id || this.currentNote.title || 'default'}`;
    const text = this.editorEl ? this.editorEl.value : '';
    if (!text || !text.includes('<!-- FOLD:')) {
      localStorage.setItem(noteKey, JSON.stringify([]));
      return;
    }
    const lines = text.split('\n');
    const folded = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i + 1 < lines.length && lines[i + 1] && typeof lines[i + 1].trim === 'function' && lines[i + 1].trim().startsWith('<!-- FOLD:')) {
        const cleanHeader = line ? line.trim() : '';
        if (cleanHeader && !folded.includes(cleanHeader)) {
          folded.push(cleanHeader);
        }
      }
    }
    localStorage.setItem(noteKey, JSON.stringify(folded));
  }

  foldHeading(lineIndex) {
    if (!this.editorEl) return;
    const text = this.editorEl.value;
    const lines = text.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const headerLine = lines[lineIndex];
    const match = headerLine.match(/^(\s*#{1,6})\s+/);
    if (!match) return;
    const level = match[1].trim().length;

    // Check if this heading is ALREADY folded (skipping blank lines)
    for (let checkIdx = lineIndex + 1; checkIdx < lines.length; checkIdx++) {
      const checkLine = lines[checkIdx];
      if (!checkLine || checkLine.trim() === '') continue;
      const foldMatch = checkLine.match(/^<!--\s*FOLD:(.*?)\s*-->$/);
      if (foldMatch) {
        // Already folded! Unfold it instead of creating a nested duplicate
        return this.unfoldHeading(lineIndex, foldMatch[1].trim());
      }
      break;
    }

    // Determine fold range (code-block aware)
    let foldRange = null;
    if (this.wasmEngine && this.wasmEngine.foldEngine) {
      foldRange = this.wasmEngine.foldEngine.getFoldRange(lines, lineIndex);
    }

    if (!foldRange || !foldRange.isFoldable) {
      let inCodeBlock = false;
      let endIndex = lineIndex + 1;
      while (endIndex < lines.length) {
        const nextLine = lines[endIndex];
        const trimmed = nextLine ? nextLine.trim() : '';
        if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
          inCodeBlock = !inCodeBlock;
          endIndex++;
          continue;
        }
        if (!inCodeBlock) {
          const nextMatch = nextLine.match(/^(\s*#{1,6})\s+/);
          const nextLevel = nextMatch ? nextMatch[1].trim().length : 0;
          if (nextLevel > 0 && nextLevel <= level) {
            break;
          }
        }
        endIndex++;
      }
      foldRange = { startIndex: lineIndex + 1, endIndex: endIndex, isFoldable: (endIndex > lineIndex + 1) };
    }

    if (!foldRange.isFoldable) return;
    const foldLines = lines.slice(foldRange.startIndex, foldRange.endIndex);
    if (!foldLines || foldLines.length === 0) return;

    // Generate guaranteed unique fold ID that never collides across notes or sessions
    let shortId = `f_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
    while ((this.editorFoldMap && this.editorFoldMap.has(shortId)) || text.includes(`<!-- FOLD:${shortId} -->`)) {
      shortId = `f_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
    }

    const foldContent = foldLines.join('\n');
    this.editorFoldMap.set(shortId, foldContent);
    if (this.currentNote) {
      if (!this.currentNote.foldMap) this.currentNote.foldMap = {};
      this.currentNote.foldMap[shortId] = foldContent;
    }

    const foldMarker = `<!-- FOLD:${shortId} -->`;
    const newLines = [
      ...lines.slice(0, lineIndex + 1),
      foldMarker,
      ...lines.slice(foldRange.endIndex)
    ];

    const selStart = this.editorEl.selectionStart;
    const selEnd = this.editorEl.selectionEnd;

    this.pushHistory();

    this.editorEl.value = newLines.join('\n');
    this.editorEl.setSelectionRange(Math.min(selStart, this.editorEl.value.length), Math.min(selEnd, this.editorEl.value.length));

    this.handleInput(true, false, false); // Save full content silently
    this.saveFoldedHeadingsState();
    this.updateLineNumbers(true);
    this.renderHighlights();
  }

  unfoldHeading(lineIndex, foldId = null) {
    if (!this.editorEl) return;
    const text = this.editorEl.value;
    const lines = text.split('\n');
    if (lines.length === 0) return;

    let markerIndex = -1;
    let resolvedId = foldId;

    // 1. Locate marker by foldId if provided
    if (resolvedId) {
      markerIndex = lines.findIndex(l => {
        const m = l.match(/^<!--\s*FOLD:(.*?)\s*-->$/);
        return m && m[1].trim() === resolvedId;
      });
    }

    // 2. Fallback: Search near lineIndex (skip empty lines)
    if (markerIndex === -1 && typeof lineIndex === 'number' && lineIndex >= 0 && lineIndex < lines.length) {
      for (let idx = lineIndex + 1; idx < lines.length; idx++) {
        const l = lines[idx];
        if (!l || l.trim() === '') continue;
        const m = l.match(/^<!--\s*FOLD:(.*?)\s*-->$/);
        if (m) {
          markerIndex = idx;
          resolvedId = m[1].trim();
        }
        break;
      }
      // Also check lineIndex itself if clicked directly
      if (markerIndex === -1) {
        const m = lines[lineIndex].match(/^<!--\s*FOLD:(.*?)\s*-->$/);
        if (m) {
          markerIndex = lineIndex;
          resolvedId = m[1].trim();
        }
      }
    }

    if (markerIndex === -1 || !resolvedId) return;

    // Retrieve decoded content
    let decoded = null;
    if (this.editorFoldMap && this.editorFoldMap.has(resolvedId)) {
      decoded = this.editorFoldMap.get(resolvedId);
    } else if (this.currentNote && this.currentNote.foldMap && this.currentNote.foldMap[resolvedId]) {
      decoded = this.currentNote.foldMap[resolvedId];
    } else if (!resolvedId.startsWith('f_') && /^[A-Za-z0-9+/=]+$/.test(resolvedId)) {
      try {
        decoded = decodeURIComponent(escape(atob(resolvedId)));
      } catch (_) {}
    }

    if (decoded === null || decoded === undefined) {
      console.warn(`[Caveman] Cannot unfold ${resolvedId}: content missing from fold map.`);
      return;
    }

    const newLines = [
      ...lines.slice(0, markerIndex),
      ...decoded.split('\n'),
      ...lines.slice(markerIndex + 1)
    ];

    // Clean up the unfolded fold from editorFoldMap and currentNote.foldMap
    if (this.editorFoldMap) this.editorFoldMap.delete(resolvedId);
    if (this.currentNote && this.currentNote.foldMap) {
      delete this.currentNote.foldMap[resolvedId];
    }

    const selStart = this.editorEl.selectionStart;
    const selEnd = this.editorEl.selectionEnd;

    this.pushHistory();

    this.editorEl.value = newLines.join('\n');
    this.editorEl.setSelectionRange(Math.min(selStart, this.editorEl.value.length), Math.min(selEnd, this.editorEl.value.length));

    this.handleInput(true, false, false); // Save full content silently
    this.saveFoldedHeadingsState();
    this.updateLineNumbers(true);
    this.renderHighlights();
  }

  unfoldAllHeadings() {
    if (!this.editorEl) return;
    const text = this.editorEl.value;
    if (!text.includes('<!-- FOLD:')) return;

    this.pushHistory();

    const clean = this.getCleanMarkdown(text);
    this.editorEl.value = clean;
    this.editorFoldMap.clear();
    if (this.currentNote) {
      this.currentNote.rawContent = clean;
      this.currentNote.content = clean;
      this.currentNote.foldMap = {};
    }

    this.handleInput(true, false, false);
    this.saveFoldedHeadingsState();
    this.updateLineNumbers(true);
    this.renderHighlights();
  }

  foldAllHeadings() {
    if (!this.editorEl) return;
    const text = this.editorEl.value;
    const lines = text.split('\n');

    this.pushHistory();
    // Fold all headings from bottom to top so that earlier line indices remain stable
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (/^(\s*#{1,6})\s+/.test(line)) {
        this.foldHeading(i);
      }
    }
  }
}

new CavemanApp();
