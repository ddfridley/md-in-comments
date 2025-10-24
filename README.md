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
- Headers (H1, H2, H3) using `#`, `##`, `###` syntax with color gradation
- Bullet lists with `-` or `*`
- Numbered lists with `1.`, `2.`, etc.
- Code blocks with ` ```language` syntax and syntax highlighting
- Horizontal lines for comment delimiters

### Single-Line Comments
Limited markdown support in `//` and `#` comments:
- **Bold**, *italic*, `code`, and ~~strikethrough~~ formatting
- Works in standalone comments and trailing comments after code
- **No headers, lists, or code blocks** to keep single lines clean
- Preserves original comment color (no gray overlay)

### Markdown Files
Full markdown rendering in `.md` files with all features enabled.

🎨 **Visual Hierarchy**: Headers in block comments are distinguished by color intensity and styling:
- H1: Darkest gray (#1a1a1a), bold, underlined
- H2: Dark gray (#333333), bold
- H3: Medium gray (#666666), bold, italic

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

🎛️ **Toggle Control**: Easily enable/disable markdown rendering with the command palette

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

## Known Issues

- Font size cannot be changed due to VS Code API limitations
- Code block syntax highlighting uses pattern-based coloring (not semantic)
- Syntax colors are theme-aware for light/dark but may not perfectly match all color schemes
- Complex nested markdown structures may not render perfectly
- Single-line comments don't support headers, lists, or code blocks
- Code blocks inherit VS Code's comment color (typically green) with syntax highlighting overlaid

## Release Notes

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
