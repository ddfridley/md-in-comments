# MD in Comments

A Visual Studio Code extension that renders markdown formatting within comments in code files and markdown files, making documentation more readable and visually appealing.

## Features

✨ **Markdown Rendering**: Transform plain text into beautifully formatted markdown with support for:

### Block Comments (Multi-line)
Full markdown support in `/* ... */` and `"""..."""` comments:
- **Bold text** using `**text**` syntax
- *Italic text* using `*text*` syntax  
- `Inline code` using backtick syntax
- ~~Strikethrough~~ using `~~text~~` syntax
- Headers (H1-H7) using `#`, `##`, `###`, `####`, `#####`, `######`, `#######` syntax
- Bullet lists with `-` marker
- Numbered lists with `1.`, `2.`, etc.
- Task lists with `- [ ]` (unchecked) and `- [x]` (checked)
- Links with `[text](url)` syntax - displays clickable text with URL in hover
- Images with `![alt](url)` syntax - displays alt text with 🖼️ icon
- Code blocks with ` ```language` syntax and syntax highlighting
- Horizontal lines for comment delimiters and code block markers
- Automatic 1ch indentation for all content
- Additional 1ch indentation for lists (2ch total)

### Single-Line Comments
Limited markdown support in `//` and `#` comments:
- **Bold**, *italic*, `code`, and ~~strikethrough~~ formatting
- Works in standalone comments and trailing comments after code
- **No headers, lists, or code blocks** to keep single lines clean
- Preserves original comment color (no gray overlay)

### Markdown Files
Full markdown rendering in `.md` files with all features enabled.

🎨 **Visual Hierarchy**: Headers in block comments are distinguished by color intensity and styling:
- H1: Darkest gray (#1a1a1a), bold, underlined, 100% size
- H2: Dark gray (#333333), bold, 100% size
- H3: Medium gray (#666666), bold, italic, 100% size
- H4-H7: Medium gray (#666666), bold, italic, progressively smaller (95%, 90%, 85%, 80%)

📊 **Syntax Highlighting**: Code blocks feature pattern-based syntax highlighting that adapts to your theme:
- Light themes: Colorful syntax highlighting (purple keywords, red strings, etc.)
- Dark themes: White text for maximum readability
- Automatically detects your VS Code theme

✏️ **Smart Edit Mode**: Click on any line to see the raw markdown for editing, while other lines stay formatted

🔧 **Multi-language Support**: Works with popular programming languages including:
- TypeScript/JavaScript
- Python
- Java
- C#
- C/C++
- Go
- Rust
- PHP
- Markdown files

🎛️ **Toggle Control**: Easily enable/disable markdown rendering with keyboard shortcut `Ctrl+Shift+Alt+M` or command palette

🎨 **Enhanced Readability**: Darker text color (#4d4d4d) for better contrast and readability

## Usage

### Block Comments
Write multi-line comments with full markdown support:

```typescript
/*
 * # API Documentation
 * This function handles **user authentication** and returns a *session token*.
 * 
 * ## Parameters
 * - `username`: The user's login name
 * - `password`: The user's password
 * 
 * ### Code Example
 * ```javascript
 * const token = authenticate('user', 'pass');
 * ```
 */
```

### Single-Line Comments
Use limited markdown formatting in single-line comments:

```typescript
// This is **bold** and *italic* with `code`
const x = 5;  // Trailing comment with **formatting**
```

The extension automatically detects and renders the markdown formatting. Click on any line to edit the raw markdown.

## Commands

* `MD in Comments: Toggle`: Enable or disable markdown rendering
  - Keyboard shortcut: `Ctrl+Shift+Alt+M` (Windows/Linux) or `Cmd+Shift+Alt+M` (Mac)

## Supported Markdown Syntax

### ✅ Fully Supported (in block comments)
- **Text Formatting**: Bold (`**text**`), Italic (`*text*`), Strikethrough (`~~text~~`)
- **Code**: Inline code (`` `code` ``), Code blocks with syntax highlighting (` ```language`)
- **Headers**: H1-H7 (`#` through `#######`)
- **Lists**: Unordered (`-`), Ordered (`1.`, `2.`), Task lists (`- [ ]`, `- [x]`)
- **Links**: `[text](url)` - shows text with hover tooltip
- **Images**: `![alt](url)` - shows alt text with icon
- **Horizontal Rules**: Comment delimiters and code block markers rendered as lines

### ⚠️ Limited Support (in single-line comments)
- Only basic text formatting: Bold, Italic, Code, Strikethrough
- No headers, lists, or code blocks

### ❌ Not Supported
- **Tables**: Markdown tables (`| Column | Column |`)
- **Blockquotes**: Quote blocks (`>`)
- **Definition Lists**: Term and definition pairs
- **Footnotes**: `[^1]` style footnotes
- **HTML**: Raw HTML tags
- **Math**: LaTeX/KaTeX equations
- **Emoji Shortcodes**: `:smile:` style (Unicode emoji like 🙂 work)
- **Nested Lists**: Multiple indent levels
- **Reference Links**: `[text][ref]` style links
- **Auto-linking**: Plain URLs (must use `[text](url)`)

## Known Issues

- Font size for H1-H3 can not be larger than the line due to VS Code API limitations
- H4-H7 use progressively smaller fonts but may affect line height
- Code block syntax highlighting uses pattern-based coloring (not semantic)
- Syntax colors are theme-aware for light/dark but may not perfectly match all color schemes
- Complex nested markdown structures may not render perfectly
- Single-line comments don't support headers, lists, or code blocks
- Code blocks inherit VS Code's comment color (typically green) with syntax highlighting overlaid
- Images only show alt text, not actual images (VS Code API limitation)

## Release Notes

### 0.0.3

- Added keyboard shortcut `Ctrl+Shift+Alt+M` to toggle markdown rendering
- Added support for Headers 4-7 with progressively smaller font sizes
- Added link syntax `[text](url)` with clickable display
- Added image syntax `![alt](url)` with icon and alt text display
- Added task list syntax `- [ ]` and `- [x]` with checkboxes
- Improved text contrast with darker color (#4d4d4d)
- Added 1ch indentation for all content lines
- Added 2ch indentation for list items (bullets, numbers, tasks)
- Fixed rendering for lines starting with markdown syntax
- Improved asterisk prefix hiding (`* ` patterns in comment blocks)

### 0.0.2

- Added markdown file (.md) support
- Added single-line comment support with limited features
- Added trailing comment support (comments after code on same line)
- Added syntax highlighting in code blocks with theme awareness
- Made base colors 20% darker (H1: #1a1a1a, H2: #333333, H3/base: #666666)
- Theme-aware horizontal lines in code blocks
- Fixed edit mode behavior for single-line comments
- Single-line comments preserve original color (no gray overlay)

### 0.0.1

Initial release with markdown rendering support in block comments

**Enjoy beautiful markdown in your code comments!** 🎉
