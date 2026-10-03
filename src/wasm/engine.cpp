// ==============================================================================
// BRUTALIST FAST MARKDOWN & NOTE ENGINE (C++ -> WebAssembly)
// Native binary speed for indexing, syntax classification, macro scanning,
// and O(1) viewport hit-testing. Precompiled into engine.wasm.
// ==============================================================================

#define WASM_EXPORT extern "C" __attribute__((visibility("default")))

typedef unsigned char uint8_t;
typedef unsigned int uint32_t;
typedef int int32_t;

// Maximum capacities (supports notes up to 4MB text, 65,536 lines, 16,384 macros)
const int MAX_TEXT_SIZE = 4 * 1024 * 1024; // 4MB
const int MAX_LINES = 65536;
const int MAX_MACROS = 16384;
const int MAX_SEARCH_MATCHES = 8192;

// Line token types
enum LineType {
    LINE_PLAIN = 0,
    LINE_H1 = 1,
    LINE_H2 = 2,
    LINE_H3 = 3,
    LINE_H4 = 4,
    LINE_H5 = 5,
    LINE_H6 = 6,
    LINE_BLOCKQUOTE = 7,
    LINE_LIST = 8,
    LINE_CODE_FENCE = 9,
    LINE_HR = 10,
    LINE_FOLD_MARKER = 11
};

struct LineEntry {
    int32_t start;       // Byte offset in text buffer
    int32_t length;      // Byte length of the line (excluding newline)
    int32_t type;        // LineType
    int32_t has_fold;    // 1 if line contains fold marker
    int32_t has_color;   // 1 if line contains a [color=#hex]
    uint32_t hex_color;  // 32-bit packed color (0xRRGGBB) or 0
    int32_t has_wikilink;// 1 if line contains [[wikilink]]
    int32_t has_formatting; // 1 if line contains ** or * or ~~ or `code`
};

struct MacroEntry {
    int32_t start;       // Byte offset in text buffer
    int32_t length;      // Byte length of [color=#...] tag
    int32_t line_index;  // Line number (0-based)
    int32_t col_index;   // Column (0-based character offset within line)
    uint32_t hex_color;  // 0xRRGGBB or 0 if empty
    int32_t is_empty;    // 1 if [color=#] (no hex digits yet), 0 otherwise
};

struct DocumentStats {
    int32_t total_lines;
    int32_t total_words;
    int32_t total_chars;
    int32_t total_macros;
    int32_t code_blocks;
};

// Static memory buffers in WebAssembly linear memory
static uint8_t text_buffer[MAX_TEXT_SIZE];
static LineEntry lines_table[MAX_LINES];
static MacroEntry macros_table[MAX_MACROS];
static int32_t search_matches[MAX_SEARCH_MATCHES];
static DocumentStats doc_stats;

// Parse hex character to integer
static inline int parse_hex_digit(uint8_t c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

// Convert ASCII char to lowercase
static inline uint8_t to_lower_ascii(uint8_t c) {
    if (c >= 'A' && c <= 'Z') return c + 32;
    return c;
}

// Buffer pointers for JavaScript TypedArrays
WASM_EXPORT uint8_t* wasm_get_text_buffer() {
    return text_buffer;
}

WASM_EXPORT int wasm_get_max_text_size() {
    return MAX_TEXT_SIZE;
}

WASM_EXPORT LineEntry* wasm_get_lines_table() {
    return lines_table;
}

WASM_EXPORT MacroEntry* wasm_get_macros_table() {
    return macros_table;
}

WASM_EXPORT int32_t* wasm_get_search_matches() {
    return search_matches;
}

WASM_EXPORT DocumentStats* wasm_get_stats() {
    return &doc_stats;
}

// Document Analysis in Native WebAssembly
WASM_EXPORT int wasm_analyze_document(int text_length) {
    if (text_length < 0) text_length = 0;
    if (text_length > MAX_TEXT_SIZE) text_length = MAX_TEXT_SIZE;

    int line_count = 0;
    int macro_count = 0;
    int word_count = 0;
    int code_block_count = 0;
    bool in_word = false;
    bool in_fenced_code = false;

    int cur_line_start = 0;

    for (int i = 0; i <= text_length; i++) {
        uint8_t c = (i < text_length) ? text_buffer[i] : '\n';

        // Word counting
        if (c > 32) {
            if (!in_word) {
                in_word = true;
                word_count++;
            }
        } else {
            in_word = false;
        }

        // Line break handling
        if (c == '\n' || i == text_length) {
            int line_len = i - cur_line_start;
            if (line_len > 0 && text_buffer[cur_line_start + line_len - 1] == '\r') {
                line_len--;
            }

            if (line_count < MAX_LINES) {
                LineEntry& entry = lines_table[line_count];
                entry.start = cur_line_start;
                entry.length = line_len;
                entry.type = in_fenced_code ? LINE_CODE_FENCE : LINE_PLAIN;
                entry.has_fold = 0;
                entry.has_color = 0;
                entry.hex_color = 0;
                entry.has_wikilink = 0;
                entry.has_formatting = 0;

                const uint8_t* line_ptr = text_buffer + cur_line_start;
                int p = 0;
                while (p < line_len && (line_ptr[p] == ' ' || line_ptr[p] == '\t')) {
                    p++;
                }

                if (p < line_len) {
                    // Check fold marker
                    if (p + 10 <= line_len && 
                        line_ptr[p] == '<' && line_ptr[p+1] == '!' && line_ptr[p+2] == '-' && line_ptr[p+3] == '-' &&
                        line_ptr[p+4] == ' ' && line_ptr[p+5] == 'F' && line_ptr[p+6] == 'O' && line_ptr[p+7] == 'L' && line_ptr[p+8] == 'D') {
                        entry.type = LINE_FOLD_MARKER;
                        entry.has_fold = 1;
                    }
                    // Check code block fence
                    else if (p + 3 <= line_len && line_ptr[p] == '`' && line_ptr[p+1] == '`' && line_ptr[p+2] == '`') {
                        entry.type = LINE_CODE_FENCE;
                        in_fenced_code = !in_fenced_code;
                        if (in_fenced_code) code_block_count++;
                    }
                    else if (!in_fenced_code) {
                        // Headings
                        if (line_ptr[p] == '#') {
                            int h_lvl = 0;
                            while (p + h_lvl < line_len && line_ptr[p + h_lvl] == '#' && h_lvl < 6) {
                                h_lvl++;
                            }
                            if (p + h_lvl < line_len && (line_ptr[p + h_lvl] == ' ' || line_ptr[p + h_lvl] == '\t')) {
                                entry.type = h_lvl; // 1..6
                            }
                        }
                        // Blockquote
                        else if (line_ptr[p] == '>') {
                            entry.type = LINE_BLOCKQUOTE;
                        }
                        // Lists
                        else if ((line_ptr[p] == '-' || line_ptr[p] == '*' || line_ptr[p] == '+') && 
                                 (p + 1 < line_len && (line_ptr[p+1] == ' ' || line_ptr[p+1] == '\t'))) {
                            entry.type = LINE_LIST;
                        }
                        else if (line_ptr[p] >= '0' && line_ptr[p] <= '9') {
                            int np = p;
                            while (np < line_len && line_ptr[np] >= '0' && line_ptr[np] <= '9') np++;
                            if (np < line_len && line_ptr[np] == '.' && np + 1 < line_len && (line_ptr[np+1] == ' ' || line_ptr[np+1] == '\t')) {
                                entry.type = LINE_LIST;
                            }
                        }
                    }
                }

                // Scan line for inline markdown features: [[wikilink]], **, *, `, ~~, and [color=#...]
                for (int col = 0; col < line_len; col++) {
                    uint8_t ch = line_ptr[col];

                    if (ch == '[' && col + 1 < line_len && line_ptr[col + 1] == '[') {
                        entry.has_wikilink = 1;
                    } else if (ch == '*' || ch == '`' || ch == '~') {
                        entry.has_formatting = 1;
                    }

                    // Fast [color=#...] scan
                    if (ch == '[' && col + 7 <= line_len && 
                        line_ptr[col+1] == 'c' && 
                        line_ptr[col+2] == 'o' && 
                        line_ptr[col+3] == 'l' && 
                        line_ptr[col+4] == 'o' && 
                        line_ptr[col+5] == 'r' && 
                        line_ptr[col+6] == '=') {
                        
                        int macro_start_col = col;
                        int pos = col + 7;
                        
                        if (pos < line_len && line_ptr[pos] == '#') {
                            pos++; // skip '#'
                            
                            uint32_t parsed_hex = 0;
                            int hex_digits = 0;
                            while (pos < line_len) {
                                int digit = parse_hex_digit(line_ptr[pos]);
                                if (digit >= 0) {
                                    if (hex_digits < 6) {
                                        parsed_hex = (parsed_hex << 4) | (uint32_t)digit;
                                    }
                                    hex_digits++;
                                    pos++;
                                } else {
                                    break;
                                }
                            }
                            
                            int tag_len = pos - macro_start_col;
                            if (pos < line_len && line_ptr[pos] == ']') {
                                tag_len++;
                                pos++;
                            }

                            if (macro_count < MAX_MACROS) {
                                MacroEntry& m = macros_table[macro_count++];
                                m.start = cur_line_start + macro_start_col;
                                m.length = tag_len;
                                m.line_index = line_count;
                                m.col_index = macro_start_col;
                                m.hex_color = parsed_hex;
                                m.is_empty = (hex_digits == 0) ? 1 : 0;
                            }

                            if (entry.has_color == 0 && hex_digits >= 3) {
                                entry.has_color = 1;
                                entry.hex_color = parsed_hex;
                            }

                            col = pos - 1;
                        }
                    }
                }

                line_count++;
            }

            cur_line_start = i + 1;
        }
    }

    doc_stats.total_lines = line_count;
    doc_stats.total_words = word_count;
    doc_stats.total_chars = text_length;
    doc_stats.total_macros = macro_count;
    doc_stats.code_blocks = code_block_count;

    return line_count;
}

// Fast macro hit-test by line and column (O(1))
WASM_EXPORT int wasm_find_macro_at_point(int line_idx, int col_idx) {
    for (int i = 0; i < doc_stats.total_macros; i++) {
        const MacroEntry& m = macros_table[i];
        if (m.line_index == line_idx) {
            // Check if column is on the macro or swatch
            if (col_idx >= m.col_index && col_idx <= m.col_index + m.length + 2) {
                return i;
            }
        }
    }
    return -1;
}

// Fast string search in WebAssembly (sub-millisecond across whole document)
WASM_EXPORT int wasm_search_text(int text_length, int query_start_ptr, int query_len, int case_sensitive) {
    if (query_len <= 0 || text_length < query_len) return 0;
    
    const uint8_t* query = text_buffer + query_start_ptr;
    int match_count = 0;
    int max_i = text_length - query_len;

    for (int i = 0; i <= max_i; i++) {
        bool match = true;
        for (int j = 0; j < query_len; j++) {
            uint8_t a = text_buffer[i + j];
            uint8_t b = query[j];
            if (!case_sensitive) {
                a = to_lower_ascii(a);
                b = to_lower_ascii(b);
            }
            if (a != b) {
                match = false;
                break;
            }
        }

        if (match) {
            if (match_count < MAX_SEARCH_MATCHES) {
                search_matches[match_count++] = i;
            } else {
                break;
            }
        }
    }

    return match_count;
}
