# MD in Comments

A Visual Studio Code extension that renders markdown formatting within comment blocks in code files, making documentation more readable and visually appealing.

## Features

✨ **Markdown Rendering in Comments**: Transform plain text comments into beautifully formatted markdown with support for:

- **Bold text** using `**text**` syntax
- *Italic text* using `*text*` syntax  
- `Inline code` using backtick syntax
- ~~Strikethrough~~ using `~~text~~` syntax
- Headers (H1, H2, H3) using `#`, `##`, `###` syntax
- Bullet lists with `-` or `*`
- Numbered lists with `1.`, `2.`, etc.

🎨 **Visual Hierarchy**: Headers are distinguished by color intensity and styling:
- H1: Darkest gray, bold, underlined
- H2: Dark gray, bold
- H3: Light gray, bold, italic

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

🎛️ **Toggle Control**: Easily enable/disable markdown rendering with the command palette

## Usage

Write comments in your code using standard markdown syntax:

```typescript
/*
 * # API Documentation
 * This function handles **user authentication** and returns a *session token*.
 * 
 * ## Parameters
 * - `username`: The user's login name
 * - `password`: The user's password
 * 
 * ### Returns
 * Returns an `AuthToken` object or throws an error
 */
```

The extension automatically detects and renders the markdown formatting. Click on any line to edit the raw markdown.

## Commands

* `MD in Comments: Toggle`: Enable or disable markdown rendering

## Known Issues

- Font size cannot be changed due to VS Code API limitations
- Complex nested markdown structures may not render perfectly
- Focus detection when clicking in terminal requires clicking back in editor

## Release Notes

### 0.0.1

Initial release with markdown rendering support in block comments

**Enjoy beautiful markdown in your code comments!** 🎉
