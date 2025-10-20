<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization -->

# MD in Comments - VS Code Extension

This VS Code extension renders markdown formatting within comment blocks in code files, making documentation more readable and visually appealing.

## Project Status
- [x] Created workspace structure
- [ ] Scaffold VS Code extension project
- [ ] Implement markdown rendering in comments
- [ ] Configure extension manifest
- [ ] Test and debug extension
- [ ] Package extension

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

**CRITICAL: Run ALL commands together as a single multi-line command.** Do NOT split these into separate terminal commands. The commands must execute in sequence in the same shell session to properly set up the environment. Copy and paste the entire block above as one command.

## Development Guidelines
- Use TypeScript for extension development
- Follow VS Code extension development best practices
- Implement proper error handling and logging
- Ensure compatibility with multiple programming languages
- Focus on performance and minimal resource usage