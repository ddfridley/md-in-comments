# md-in-comments README

This is the README for your extension "md-in-comments". After writing up a brief description, we recommend including the following sections.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

# MD in Comments

A Visual Studio Code extension that renders markdown formatting within comment blocks in code files, making documentation more readable and visually appealing.

## Features

✨ **Markdown Rendering in Comments**: Transform plain text comments into beautifully formatted markdown with support for:

- **Bold text** using `**text**` syntax
- *Italic text* using `*text*` syntax  
- `Inline code` using backtick syntax
- ~~Strikethrough~~ using `~~text~~` syntax
- # Headers (H1, H2, H3) using `#`, `##`, `###` syntax

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

1. Write comments in your code using standard markdown syntax:

```typescript
// # This is a Header
// This is **bold** and this is *italic* text
// You can also use `inline code` blocks
// ~~Strikethrough~~ text is supported too

/*
 * # Multi-line Comment Header
 * This is a **multi-line comment** with *markdown* formatting
 * - Use `code blocks` for technical terms
 * - ~~Old information~~ can be struck through
 */
```

2. The extension automatically detects and renders the markdown formatting in your comments
3. Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and search for "Toggle Markdown in Comments" to enable/disable the feature

## Extension Settings

This extension contributes the following settings:

* `mdInComments.enabled`: Enable/disable markdown rendering in comments (default: `true`)
* `mdInComments.supportedLanguages`: Array of programming languages where markdown should be rendered (default: includes all supported languages)

## Commands

* `MD in Comments: Toggle Markdown in Comments`: Enable or disable markdown rendering

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "MD in Comments"
4. Click Install

## Development

To set up the development environment:

```bash
# Clone the repository
git clone <repository-url>
cd md-comments

# Install dependencies
npm install

# Compile the extension
npm run compile

# Run tests
npm test
```

## Known Issues

- Complex nested markdown structures may not render perfectly
- Performance may be affected in very large files with many comments

## Release Notes

### 0.0.1

Initial release with basic markdown rendering support:
- Bold, italic, code, strikethrough, and header formatting
- Multi-language support
- Toggle functionality
- Configuration options

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.

**Enjoy beautiful markdown in your code comments!** 🎉

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
