/**
 * Caveman Notes - Editor Module
 * Handles Markdown rendering and Image injection
 */
export class Editor {
  constructor(vault) {
    this.vault = vault;
  }

  async processMarkdown(content) {
    if (!content || content.trim() === '') {
      return `<div style="opacity: 0.5; font-style: italic; padding: 20px; text-align: center; line-height: 1.8;">
        press 'edit' to start editing your markdown file<br>
        <div style="margin-top: 20px; font-size: 0.9em; opacity: 0.7; max-width: 400px; margin-left: auto; margin-right: auto; text-align: left; border-top: 1px dashed var(--text-primary); padding-top: 15px;">
           • folder field is a <b>path</b> (e.g. <i>work/notes/2026</i>)<br>
           • connect notes with <b>[[note title]]</b><br>
           • use <b>![video]</b> for mp4/webm/YouTube<br>
           • resize: <b>![image 500 300](link)</b> or <b>![[img 300 300]]</b><br>
           • sketch: <b>[sketch 300 300]</b> vector ink with color wheel<br>
           • check <b>canvas</b> mode for visual thinking
        </div>
      </div>`;
    }
    let md = content;
    
    // Caveman normalization: convert common bullet points (•) to markdown asterisks (*)
    // so marked can parse them as proper list items for the task list logic.
    md = md.replace(/^[ \t]*•/gm, (match) => match.replace('•', '*'));

    // Replace Obsidian-style [[img-id]] with placeholders for lazy loading, adding support for sizing and alignment: ![[id width height]] or ![[id scale% align]]
    const parseImageParams = (tokensStr) => {
      if (!tokensStr) return { width: null, height: null, scale: null, align: null, altText: '' };
      
      const tokens = tokensStr.trim().split(/\s+/);
      let width = null;
      let height = null;
      let scale = null;
      let align = null;
      let remainingTokens = [];

      for (const token of tokens) {
        const tLower = token.toLowerCase();
        
        if (['r', 'c', 'l', 'right', 'center', 'left'].includes(tLower)) {
          if (tLower === 'r' || tLower === 'right') align = 'right';
          else if (tLower === 'c' || tLower === 'center') align = 'center';
          else if (tLower === 'l' || tLower === 'left') align = 'left';
        } else if (/^\d+%$/.test(token)) {
          scale = token;
        } else if (/^\d+$/.test(token)) {
          if (width === null) {
            width = token + 'px';
          } else if (height === null) {
            height = token + 'px';
          }
        } else {
          remainingTokens.push(token);
        }
      }

      return { width, height, scale, align, altText: remainingTokens.join(' ') };
    };

    const renderImageHtml = ({ id, url, alt, width, height, scale, align, isVaultImg }) => {
      let imgStyle = `max-width: 100%; vertical-align: top; margin: 10px 5px;`;
      if (scale) {
        imgStyle += ` width: ${scale}; height: auto;`;
      } else {
        imgStyle += ` width: ${width || 'auto'}; height: ${height || 'auto'};`;
      }

      if (align) {
        imgStyle += ` display: block; margin: 0;`;
        let justify = 'flex-start';
        if (align === 'center') justify = 'center';
        else if (align === 'right') justify = 'flex-end';
        
        const containerStyle = `display: flex; justify-content: ${justify}; width: 100%; margin: 10px 0; clear: both;`;
        
        if (isVaultImg) {
          return `<div style="${containerStyle}"><img data-img-id="${id}" class="lazy-vault-img" loading="lazy" style="${imgStyle}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"></div>`;
        } else {
          return `<div style="${containerStyle}"><img src="${url}" alt="${alt}" style="${imgStyle}" loading="eager" decoding="sync" referrerpolicy="no-referrer"></div>`;
        }
      } else {
        if (isVaultImg) {
          return `<span><img data-img-id="${id}" class="lazy-vault-img" loading="lazy" style="${imgStyle}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"></span>`;
        } else {
          return `<span><img src="${url}" alt="${alt}" style="${imgStyle}" loading="eager" decoding="sync" referrerpolicy="no-referrer"></span>`;
        }
      }
    };

    md = md.replace(/!\[\[(img-[a-zA-Z0-9_-]*)(?:\s+([^\]]+))?\]\]/g, (match, id, paramStr) => {
      const params = parseImageParams(paramStr);
      return renderImageHtml({
        id,
        isVaultImg: true,
        ...params
      });
    });

    // Video & YouTube support: ![video](link) or ![video 500 300](link)
    md = md.replace(/!\[video(?:\s+(\d+))?(?:\s+(\d+))?\]\((.*?)\)/g, (match, w, h, url) => {
      const u = url.trim();
      const width = w ? `${w}px` : 'auto';
      const height = h ? `${h}px` : 'auto';
      const style = `max-width:100%; width: ${width}; height: ${height}; margin: 10px 5px; border: 1px solid var(--text-primary); vertical-align: top;`;
      
      // YouTube Detector
      const ytMatch = u.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
         return `<span><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" 
          style="${style} aspect-ratio: 16/9;" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen></iframe></span>`;
      }

      const type = u.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      return `<span><video controls loop muted playsinline crossorigin="anonymous" referrerpolicy="no-referrer" style="${style}">
  <source src="${u}" type="${type}">
  Your browser does not support the video tag.
</video></span>`;
    });

    // Image resizing support: ![alt width height alignment](url)
    md = md.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (match, bracketContent, url) => {
      // Skip if it was already processed as video placeholder or something else
      if (bracketContent && typeof bracketContent === 'string' && bracketContent.trim().startsWith('video')) return match; 
      
      const params = parseImageParams(bracketContent);
      return renderImageHtml({
        url: url.trim(),
        alt: params.altText,
        isVaultImg: false,
        ...params
      });
    });
    
    // Hide code blocks (both block level ```...``` and inline code `...`) to avoid processing formulas inside code
    const tempBlocks = [];
    md = md.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
      const placeholder = `__CODE_PLACEHOLDER_${tempBlocks.length}__`;
      tempBlocks.push({ placeholder, content: match });
      return placeholder;
    });

    // Extract and hide math formulas
    const mathPlaceholders = [];
    
    // Extract display math: $$ ... $$
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      const placeholder = `MATHBLOCKA${mathPlaceholders.length}A`;
      mathPlaceholders.push({ placeholder, formula, display: true });
      return placeholder;
    });

    // Extract inline math: $ ... $ (avoid empty ones or typical currency numbers like $10)
    md = md.replace(/\$([^$\n]+?)\$/g, (match, formula) => {
      if (!formula.trim() || /^\d+(\.\d+)?$/.test(formula.trim())) {
        return match;
      }
      const placeholder = `MATHINLINEA${mathPlaceholders.length}A`;
      mathPlaceholders.push({ placeholder, formula, display: false });
      return placeholder;
    });

    // Restore hidden code blocks safely
    for (const block of tempBlocks) {
      md = md.replace(block.placeholder, () => block.content);
    }
    
    // Color Tag Processing in Markdown Preview:
    // 1. Multi-line or single-line manual enclosures: <color=#hex>...</color> or [color=#hex]...[/color]
    md = md.replace(/(?:\[|<)color\s*=\s*(?:#([0-9a-fA-F]{0,8}))?(?:\]|>)([\s\S]*?)(?:\[\/color\]|<\/color>)/gi, (match, hex, content) => {
      const color = hex ? (hex.startsWith('#') ? hex : '#' + hex) : 'inherit';
      return `<span class="preview-color-line" style="color: ${color} !important;"><span class="preview-color-swatch" style="background-color: ${color};"></span>${content}</span>`;
    });

    // 2. Unclosed single-line tags: automatically close at the end of the line (newline / enter)
    md = md.replace(/(?:\[|<)color\s*=\s*(?:#([0-9a-fA-F]{0,8}))?(?:\]|>)([^\n]*)/gi, (match, hex, content) => {
      const color = hex ? (hex.startsWith('#') ? hex : '#' + hex) : 'inherit';
      return `<span class="preview-color-line" style="color: ${color} !important;"><span class="preview-color-swatch" style="background-color: ${color};"></span>${content}</span>`;
    });

    // 3. Remove stray closing tags if any remain
    md = md.replace(/(?:\[\/color\]|<\/color>)/gi, '');
    md = md.replace(/\[\/sketch\]/gi, '');

    // Extract and hide sketch blocks before Marked parses
    const sketchPlaceholders = [];
    md = md.replace(/\[sketch(?::([a-zA-Z0-9_-]+))?(?:\s+([a-zA-Z0-9_-]+))?(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+([a-zA-Z0-9_-]+))?\]/gi, (match, id1, arg2, arg3, arg4, arg5) => {
      let id = id1 || null;
      let width = 300;
      let height = 300;

      const tokens = [arg2, arg3, arg4, arg5].filter(Boolean);
      const numTokens = [];
      const strTokens = [];

      for (const t of tokens) {
        if (/^\d+$/.test(t)) {
          numTokens.push(parseInt(t, 10));
        } else {
          strTokens.push(t);
        }
      }

      if (!id && strTokens.length > 0) {
        id = strTokens[0];
      }
      if (numTokens.length >= 2) {
        width = numTokens[0];
        height = numTokens[1];
      } else if (numTokens.length === 1) {
        width = numTokens[0];
        height = numTokens[0];
      }

      width = Math.max(100, Math.min(1600, width));
      height = Math.max(80, Math.min(2000, height));

      const placeholder = `SKETCHBLOCKA${sketchPlaceholders.length}A`;
      sketchPlaceholders.push({ placeholder, id, width, height, sketchIndex: sketchPlaceholders.length });
      return '\n\n' + placeholder + '\n\n';
    });

    // Ensure marked is configured for GFM
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: true
      });
      
      const renderer = new marked.Renderer();
      
      renderer.code = (arg1, arg2) => {
        let code = arg1;
        let language = arg2;
        
        // Handle new Marked API where first arg is an object { text, lang, escaped }
        if (typeof arg1 === 'object' && arg1 !== null) {
          code = arg1.text;
          language = arg1.lang;
        }
        
        const lang = (language || 'text').toLowerCase();
        if (typeof Prism !== 'undefined') {
          try {
            const prismLang = Prism.languages[lang];
            let highlighted;
            
            if (prismLang) {
              highlighted = Prism.highlight(code, prismLang, lang);
            } else {
              // Fallback to plain text with basic escaping
              highlighted = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            }
            
            return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
          } catch (e) {
            console.warn("Prism highlight error:", e);
          }
        }
        return `<pre class="language-text"><code>${code}</code></pre>`;
      };

      marked.setOptions({ renderer });

      let html = marked.parse(md);
      
      // Render and restore math blocks using KaTeX if available
      if (typeof katex !== 'undefined') {
        for (const math of mathPlaceholders) {
          try {
            const rendered = katex.renderToString(math.formula, {
              displayMode: math.display,
              throwOnError: false
            });
            html = html.replace(math.placeholder, () => rendered);
          } catch (err) {
            console.error("KaTeX rendering error:", err);
            const fb = math.display 
              ? `<div class="katex-fallback">$$${math.formula}$$</div>` 
              : `<span class="katex-fallback">$${math.formula}$</span>`;
            html = html.replace(math.placeholder, () => fb);
          }
        }
      } else {
        for (const math of mathPlaceholders) {
          const fb = math.display 
            ? `<div class="katex-fallback" style="text-align: center; margin: 10px 0; font-family: var(--font-mono); opacity: 0.8;">$$${math.formula}$$</div>` 
            : `<code class="katex-fallback" style="font-family: var(--font-mono); opacity: 0.8;">$${math.formula}$</code>`;
          html = html.replace(math.placeholder, () => fb);
        }
      }

      // Render and restore sketch blocks cleanly (no code blocks or markdown mangling)
      for (const item of sketchPlaceholders) {
        const sketchHtml = this.renderPreviewSketchHtml(item);
        html = html.split(`<p>${item.placeholder}</p>`).join(sketchHtml);
        html = html.split(`<p>\n${item.placeholder}\n</p>`).join(sketchHtml);
        html = html.split(item.placeholder).join(sketchHtml);
      }
      
      // Brutalist Hack: marked makes checkboxes 'disabled' by default. 
      // We strip that so they are interactive and we can catch the click.
      html = html.replace(/<input disabled="" type="checkbox">/g, '<input type="checkbox">');
      html = html.replace(/<input checked="" disabled="" type="checkbox">/g, '<input checked="" type="checkbox">');
      
      // Image stability hack: force eager loading and sync decoding to minimize flicker during re-renders
      html = html.replace(/<img /g, '<img loading="eager" decoding="sync" referrerpolicy="no-referrer" ');
      
      // Video stability hack: also add no-referrer to videos
      html = html.replace(/<video /g, '<video referrerpolicy="no-referrer" ');

      // Wikilink Detection [[Note Title]]
      html = html.replace(/\[\[(.*?)\]\]/g, (match, target) => {
        return `<a class="wikilink" data-target="${target.trim()}">${target.trim()}</a>`;
      });

      return html;
    }
    
    return md;
  }

  generateImageId() {
    return `img-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  renderPreviewSketchHtml(item) {
    const width = item.width || 300;
    const height = item.height || 300;
    const isNight = document.body.classList.contains('night-mode');

    let sketchData = null;
    const noteSketches = window.app?.currentNote?.sketches;
    if (item.id && noteSketches && noteSketches[item.id]) {
      sketchData = noteSketches[item.id];
    } else if (item.id && window.app?.sketchManager?.getSketchData(item.id)) {
      sketchData = window.app.sketchManager.getSketchData(item.id);
    } else if (item.id && window.app?.sketchManager?.widgets?.has(item.id)) {
      const w = window.app.sketchManager.widgets.get(item.id);
      sketchData = { id: item.id, width: w.width, height: w.height, strokes: w.strokes };
    }

    const strokes = sketchData && sketchData.strokes ? sketchData.strokes : [];
    let pathsHtml = '';

    for (const s of strokes) {
      let color = s.color;
      if (!color || color === 'theme-ink') {
        color = isNight ? '#e5c07b' : '#141414';
      }
      const opacity = s.opacity !== undefined ? s.opacity : 1;
      const strokeWidth = s.width || 2.5;
      const d = s.d || (window.app?.sketchManager ? window.app.sketchManager.pointsToPath(s.points) : '');
      if (d) {
        pathsHtml += `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${opacity}" />`;
      }
    }

    const displayId = (sketchData && sketchData.id) || item.id || 'SKETCH';
    const bgColor = (sketchData && sketchData.bgColor) || '#241f1a';

    return `<div class="sketch-preview-block" style="width: ${width}px; max-width: 100%; margin: 16px 0;">` +
      `<div class="sketch-preview-header"><span>SKETCH // ${displayId}</span><span>${width}×${height}</span></div>` +
      `<svg class="sketch-preview-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: ${bgColor}; width: 100%; height: auto; display: block;">${pathsHtml}</svg>` +
    `</div>`;
  }
}
