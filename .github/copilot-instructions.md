<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization -->

# MD in Comments - VS Code Extension

This VS Code extension renders markdown formatting within comment blocks in code files, making documentation more readable and visually appealing.

## Project Status
- [x] Created workspace structure
- [x] Scaffold VS Code extension project
- [x] Implement markdown rendering in comments
- [x] Configure extension manifest
- [x] Test and debug extension
- [x] Package extension (v0.0.4)

## Terminal Setup

When opening a new bash shell in this environment, the following commands are must be run by the ai agent or the user to set up the Node.js environment correctly:

```bash
 if [ ! -f .nvmrc ];then
    export NODE_VERSION=$(cat ./package.json | grep '\"node\":' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g')
else
    export NODE_VERSION=`cat .nvmrc`
fi
export NVS_HOME="$HOME/AppData/Local/nvs/"
$NVS_HOME/nvs add $NODE_VERSION
source $NVS_HOME/nvs.sh use $NODE_VERSION
```

**CRITICAL: Run ALL commands together as a single multi-line command.** Do NOT split these into separate terminal commands. The commands must execute in sequence in the same shell session to properly set up the environment. Copy and paste the entire block above as one command, including the space at the start of the first line.

## Features Implemented
- **Headers 1-7**: Progressive font sizing (H1: 150%, H2: 125%, H3: 100%, H4-H7: 95-80%)
- **Text Formatting**: Bold, italic, strikethrough, inline code
- **Links**: Blue underlined rendering (not clickable in render mode)
- **Images**: Display with 🖼️ icon and alt text
- **Lists**: Bullet and numbered lists with proper indentation
- **Task Lists**: ☐/☑ checkboxes for unchecked/checked items
- **Code Blocks**: Multi-line code blocks with language-specific handling
- **Keyboard Toggle**: Ctrl+Shift+Alt+M (Windows/Linux), Cmd+Shift+Alt+M (Mac)
- **Performance**: Caching system for efficient rendering in large files
- **HTML Comments**: Properly excluded from markdown rendering
- **Language Support**: TypeScript, JavaScript, Python, Java, C#, C++, C, Go, Rust, PHP, Markdown, Instructions

## Development Guidelines
- Use TypeScript for extension development
- Follow VS Code extension development best practices
- Implement proper error handling and logging
- Ensure compatibility with multiple programming languages
- Focus on performance and minimal resource usage
- Use caching to minimize re-parsing in large files
- Test with various file types and edge cases (HTML comments, nested formatting, etc.)