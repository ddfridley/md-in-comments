# MD in Comments - Feature Specification

## Overview
MD in Comments is a VS Code extension that renders markdown formatting within comments in code files and markdown files, making documentation more readable and visually appealing.

## Supported File Types

### Code Files
- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- Python (`.py`)
- Java (`.java`)
- C# (`.cs`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`)
- Go (`.go`)
- Rust (`.rs`)
- PHP (`.php`)

### Markdown Files
- Markdown (`.md`)
- All markdown formatting is rendered directly in `.md` files

## Comment Types and Features

### Block Comments (Multi-line)
**Syntax:** `/* ... */` (JavaScript-style), `""" ... """` (Python)

**Supported Features:**
- **Text Formatting:**
  - `**bold**` → **bold**
  - `*italic*` → *italic*
  - `` `code` `` → `code` (with background and border)
  - `~~strikethrough~~` → ~~strikethrough~~

- **Headers:**
  - `# Header 1` → Large, bold, underlined, darkest gray
  - `## Header 2` → Medium, bold, dark gray
  - `### Header 3` → Regular, bold, italic, lighter gray

- **Lists:**
  - `- item` or `* item` → Bullet points (•)
  - `1. item`, `2. item` → Numbered lists

- **Code Blocks:**
  - ` ```language` → Code block with syntax highlighting
  - Supported syntax: keywords, strings, numbers, functions, variables, comments
  - Horizontal lines replace ``` delimiters with optional language label

- **Visual Elements:**
  - Comment delimiters (`/*` and `*/`) replaced with horizontal lines
  - Entire comment block colored in gray (#808080)
  - Code block content excluded from gray overlay (shows syntax highlighting)

### Single-Line Comments
**Syntax:** `//` (JavaScript-style), `#` (Python-style)

**Supported Features (Limited):**
- **Text Formatting Only:**
  - `**bold**` → **bold**
  - `*italic*` → *italic*
  - `` `code` `` → `code` (with background and border)
  - `~~strikethrough~~` → ~~strikethrough~~

**Not Supported in Single-Line Comments:**
- Headers (`#`, `##`, `###`)
- Lists (bullets, numbered)
- Code blocks (` ``` `)
- Gray color overlay (preserves original comment color)
- Horizontal lines

**Types of Single-Line Comments:**
1. **Standalone single-line comments:**
   ```javascript
   // This is **bold** text
   ```

2. **Trailing comments (after code):**
   ```javascript
   const x = 5;  // This is **bold** text
   ```

### Edit Mode
When the cursor is on a line with markdown formatting:
- Raw markdown syntax is displayed (e.g., `**bold**` instead of **bold**)
- Formatted rendering is hidden on the active line
- Allows easy editing of markdown syntax
- Formatting re-applies when cursor moves to another line

## Rendering Behavior

### Block Comments
1. Extract comment content between `/*` and `*/` (or `"""` and `"""`)
2. Apply gray color to entire comment block
3. Identify and exclude code block regions from gray overlay
4. Replace `/*` and `*/` with horizontal lines
5. Parse markdown patterns in order:
   - Bold, italic, inline code, strikethrough
   - Bullet and numbered lists
   - Headers (processed last to allow nested formatting)
6. Apply syntax highlighting to code blocks
7. Hide original markdown syntax characters
8. Display formatted content with styling

### Single-Line Comments
1. Extract comment content after `//` or `#`
2. Do NOT apply gray color overlay
3. Parse limited markdown patterns:
   - Bold, italic, inline code, strikethrough only
4. Skip headers, lists, code blocks
5. Hide original markdown syntax characters
6. Display formatted content with styling

### Markdown Files
1. All content is rendered as markdown
2. Full markdown support (same as block comments)
3. No comment extraction needed

## Color Scheme

### Comment Text (Block Comments Only)
- Base gray: `#666666` (20% darker than original)

### Headers (Block Comments Only)
- Header 1: `#1a1a1a` (darkest, bold, underlined)
- Header 2: `#333333` (dark, bold)
- Header 3: `#666666` (medium gray, bold, italic)

### Code Block Syntax Highlighting
**Light Theme:**
- Keywords: `#AF00DB` (dark purple)
- Strings: `#A31515` (dark red)
- Numbers: `#098658` (dark green)
- Functions: `#795E26` (dark yellow/brown)
- Comments: `#008000` (dark green)
- Variables: `#001080` (dark blue)
- Properties: `#001080` (dark blue)
- Operators: `#000000` (black)

**Dark Theme:**
- All syntax elements: `#FFFFFF` (white)

**Note:** Code blocks inherit the editor's comment color (typically green) by default. Syntax highlighting colors are applied on top using VS Code's decoration API with `textDecoration` CSS overrides.

## Performance Considerations

### Optimization Strategies
1. **Debounced Updates:** 300ms delay after cursor movement
2. **Line-Change Detection:** Only re-render when cursor moves to different line
3. **Active Line Exclusion:** Skip decorations on current line for instant editing
4. **Code Block Range Caching:** Pre-calculate code block boundaries

### Limitations
1. Pattern-based syntax highlighting (not semantic)
2. Syntax colors are hardcoded for light themes
3. Complex nested markdown may not render perfectly
4. Performance impact on very large files with many comments

## Technical Implementation

### VS Code Decoration API
- **Replace Decoration:** Makes original markdown syntax transparent/invisible
- **Before Content Decoration:** Inserts formatted text at same position
- **Color Decorations:** Apply specific colors to different elements
- **Range-based:** All decorations tied to document positions

### Comment Extraction
- **Regex Patterns:** Language-specific patterns for comment markers
- **Position Mapping:** Track original document positions for accurate decoration
- **Line Tracking:** Preserve line numbers and character offsets

### Markdown Parsing
- **Order of Processing:**
  1. Code block detection and exclusion
  2. Inline formatting (bold, italic, code, strikethrough)
  3. Lists (bullets and numbered)
  4. Headers (last, to allow nested formatting in header text)
- **Pattern Matching:** Regex-based with lookahead/lookbehind for accuracy

## Configuration

### Settings
- `mdInComments.enabled`: Enable/disable the extension (default: `true`)
- `mdInComments.supportedLanguages`: Array of language IDs to process

### Commands
- `MD in Comments: Toggle` - Enable/disable markdown rendering

## Known Issues

1. **Font Size:** Cannot change font size or line height (API limitation)
2. **Semantic Highlighting:** Code blocks use pattern-based, not language-server highlighting
3. **Theme Colors:** Syntax colors are partially theme-aware but may not perfectly match all themes
4. **Nested Markdown:** Very complex nested patterns may not render correctly
5. **Single-Line Limitations:** Headers and lists not supported in single-line comments
6. **Code Block Colors:** Code inside code blocks shows in VS Code's comment color with syntax highlighting overlaid. Background color changes are not currently supported due to VS Code decoration API limitations.

## Future Enhancements

### Potential Features
- Full theme-aware color adaptation (dynamic backgrounds for code blocks)
- Language-specific syntax highlighting engines
- Configurable markdown patterns
- Support for more markdown features (tables, links, images)
- Performance improvements for large files
- Custom color schemes for different syntax elements

### API Limitations to Overcome
- Font size/line height changes require VS Code API updates
- Semantic highlighting in decorations requires API enhancements
- Background color overrides with text color inheritance (decoration API limitation)
