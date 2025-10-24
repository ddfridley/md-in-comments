import * as vscode from 'vscode';

/**
 * MarkdownCommentProvider - Renders markdown formatting within code comments
 * 
 * HOW THE RENDERING WORKS:
 * 
 * 1. COMMENT EXTRACTION:
 *    - Scans document for multi-line comment blocks only (Java/C-style '/ * ... * /' and Python triple-quote)
 *    - Extracts clean comment text by removing comment markers
 *    - Preserves original document positions for accurate decoration placement
 * 
 * 2. MARKDOWN PARSING:
 *    - Uses regex patterns to find markdown syntax for bold, italic, code, strikethrough, headers
 *    - Captures both the syntax characters and the content they wrap
 *    - Maps positions from cleaned comment text back to original document coordinates
 * 
 * 3. TEXT REPLACEMENT RENDERING:
 *    - Uses VS Code's decoration API with two-layer approach:
 *      a) HIDE ORIGINAL: Applies 'replace' decoration with transparent color and minimal font size
 *                        to make original markdown syntax invisible
 *      b) SHOW FORMATTED: Uses 'before' content property to insert styled text at the same position
 *                         with proper formatting (bold, italic, background, borders, etc.)
 * 
 * 4. VISUAL RESULT:
 *    - Original text: "This is **bold** and \`code\`"
 *    - Rendered as: "This is bold and code" (where "bold" appears bold, "code" has background/border)
 *    - Markdown syntax characters become invisible but preserve document layout
 *    - Formatted content appears in exact same position with applied styling
 * 
 * 5. DECORATION TYPES:
 *    - 'replace': Makes original markdown text transparent and tiny
 *    - 'bold', 'italic', etc.: Placeholder types that trigger the before content rendering
 *    - All actual styling is applied via renderOptions.before properties
 * 
 * SUPPORTED MARKDOWN:
 * - **bold text**
 * - *italic text*
 * - \`inline code\`
 * - ~~strikethrough~~
 * - # Header 1 (bold, underlined, colored)
 * - ## Header 2 (bold, colored)
 * - ### Header 3 (bold, colored)
 * 
 * SUPPORTED COMMENT TYPES (BLOCK ONLY):
 * - Multi-line: \/\* comment \*\/ (JavaScript, TypeScript, Java, C#, C/C++, Go, Rust, PHP)
 * - Multi-line: triple-quote comment (Python)
 * 
 * LIMITATIONS:
 * - Cannot truly remove text from document (VS Code API limitation)
 * - Complex nested markdown may not render perfectly
 * - Performance impact on very large files with many comments
 */

export class MarkdownCommentProvider {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private _isEnabled: boolean = true;
    private updateTimeout: NodeJS.Timeout | undefined;
    private readonly debounceDelay = 300; // milliseconds
    private lastActiveLine: number = -1;

    constructor() {
        this.initializeDecorationTypes();
    }

    public get isEnabled(): boolean {
        return this._isEnabled;
    }

    public toggle(): void {
        this._isEnabled = !this._isEnabled;
        if (this._isEnabled) {
            // Re-apply decorations to all visible editors
            vscode.window.visibleTextEditors.forEach(editor => {
                this.updateDecorations(editor.document);
            });
        } else {
            // Clear all decorations
            this.clearAllDecorations();
        }
    }

    private initializeDecorationTypes(): void {
        // Placeholder decorations - actual styling handled in before content
        this.decorationTypes.set('bold', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('italic', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('code', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('strikethrough', vscode.window.createTextEditorDecorationType({}));
        
        // Header decorations with actual styling - darkest to lighter gray tones
        this.decorationTypes.set('header1', vscode.window.createTextEditorDecorationType({
            color: '#303030',  // Darkest gray
            fontWeight: 'bold',
            textDecoration: 'underline'
        }));
        this.decorationTypes.set('header2', vscode.window.createTextEditorDecorationType({
            color: '#505050',  // Dark gray
            fontWeight: 'bold'
        }));
        this.decorationTypes.set('header3', vscode.window.createTextEditorDecorationType({
            color: '#888888',  // Lighter gray
            fontWeight: 'bold',
            fontStyle: 'italic'
        }));

        // Gray color for comment block content
        this.decorationTypes.set('commentGray', vscode.window.createTextEditorDecorationType({
            color: '#808080'
        }));

        // Replacement decoration that makes original text take no space
        this.decorationTypes.set('replace', vscode.window.createTextEditorDecorationType({
            color: 'transparent',
            textDecoration: 'none; font-size: 0.1px; width: 0px; margin: 0px'
        }));
        
        // Syntax highlighting colors for code blocks
        // Darker colors that work better with light backgrounds
        this.decorationTypes.set('syntax-keyword', vscode.window.createTextEditorDecorationType({
            color: '#AF00DB'  // Darker purple for keywords
        }));
        this.decorationTypes.set('syntax-string', vscode.window.createTextEditorDecorationType({
            color: '#A31515'  // Darker red/brown for strings
        }));
        this.decorationTypes.set('syntax-number', vscode.window.createTextEditorDecorationType({
            color: '#098658'  // Darker green for numbers
        }));
        this.decorationTypes.set('syntax-function', vscode.window.createTextEditorDecorationType({
            color: '#795E26'  // Darker yellow/brown for functions
        }));
        this.decorationTypes.set('syntax-comment', vscode.window.createTextEditorDecorationType({
            color: '#008000'  // Darker green for comments
        }));
        this.decorationTypes.set('syntax-variable', vscode.window.createTextEditorDecorationType({
            color: '#001080'  // Dark blue for variables
        }));
        this.decorationTypes.set('syntax-property', vscode.window.createTextEditorDecorationType({
            color: '#001080'  // Dark blue for properties
        }));
        this.decorationTypes.set('syntax-operator', vscode.window.createTextEditorDecorationType({
            color: '#000000'  // Black for operators
        }));
    }

    public updateDecorations(document: vscode.TextDocument): void {
        if (!this._isEnabled) {
            return;
        }

        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (!editor) {
            return;
        }

        // Get the current cursor line
        const activeLine = editor.selection.active.line;
        
        // Check if we're still on the same line - if so, don't update
        if (activeLine === this.lastActiveLine) {
            return;
        }
        
        // Update the last active line
        this.lastActiveLine = activeLine;

        // Clear existing decorations
        this.decorationTypes.forEach(decorationType => {
            editor.setDecorations(decorationType, []);
        });

        const text = document.getText();
        const comments = this.extractComments(text, document.languageId);
        
        const decorations: Map<string, vscode.DecorationOptions[]> = new Map();
        this.decorationTypes.forEach((_, key) => {
            decorations.set(key, []);
        });

        comments.forEach(comment => {
            this.parseMarkdownInComment(comment, decorations, document, activeLine);
        });

        // Apply decorations
        decorations.forEach((ranges, type) => {
            const decorationType = this.decorationTypes.get(type);
            if (decorationType) {
                editor.setDecorations(decorationType, ranges);
            }
        });
    }

    public updateDecorationsDebounced(document: vscode.TextDocument): void {
        // Clear existing timeout
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        // Set new timeout
        this.updateTimeout = setTimeout(() => {
            this.updateDecorations(document);
        }, this.debounceDelay);
    }

    public forceUpdate(document: vscode.TextDocument): void {
        console.log('forceUpdate called');
        // Reset the last active line to force a re-render
        this.lastActiveLine = -1;
        this.updateDecorations(document);
    }

    private extractComments(text: string, languageId: string): CommentBlock[] {
        const comments: CommentBlock[] = [];
        const lines = text.split('\n');
        
        // Get comment patterns for the language
        const patterns = this.getCommentPatterns(languageId);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for single-line comments
            for (const pattern of patterns.singleLine) {
                const match = line.match(pattern);
                if (match) {
                    const startChar = match.index || 0;
                    const commentText = match[1] || '';
                    comments.push({
                        text: commentText,
                        startLine: i,
                        endLine: i,
                        startChar: startChar + match[0].length - commentText.length,
                        endChar: line.length
                    });
                    break;
                }
            }

            // Check for multi-line comment start
            for (const pattern of patterns.multiLineStart) {
                if (line.match(pattern)) {
                    const blockComment = this.extractMultiLineComment(lines, i, patterns.multiLineEnd[0]);
                    if (blockComment) {
                        comments.push(blockComment);
                        i = blockComment.endLine; // Skip processed lines
                    }
                    break;
                }
            }
        }

        return comments;
    }

    private extractMultiLineComment(lines: string[], startLine: number, endPattern: RegExp): CommentBlock | null {
        const originalLines: string[] = [];
        const cleanedLines: string[] = [];
        let endLine = startLine;
        
        // Extract both original and cleaned versions
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            
            if (i === startLine) {
                // First line - remove opening comment marker but only if there's content after
                originalLines.push(line);
                const cleaned = line.replace(/^(\s*)\/\*+\s*/, '');
                // Only add if there's actual content (not just whitespace)
                if (cleaned.trim()) {
                    cleanedLines.push(cleaned);
                } else {
                    cleanedLines.push(''); // Empty line placeholder
                }
            } else {
                // Check for end marker
                const endMatch = line.match(endPattern);
                if (endMatch) {
                    endLine = i;
                    originalLines.push(line);
                    // Add content before end marker, removing * prefix if present
                    const beforeEnd = line.substring(0, endMatch.index || 0);
                    const cleaned = beforeEnd.replace(/^\s*\*\s/, '');
                    cleanedLines.push(cleaned);
                    break;
                } else {
                    // Middle line - store original and clean it
                    originalLines.push(line);
                    // Only remove leading "* " (asterisk + space) which is a comment decorator
                    // This preserves ** for markdown bold
                    const cleaned = line.replace(/^\s*\*\s/, '');
                    cleanedLines.push(cleaned);
                }
            }
        }

        return {
            text: cleanedLines.join('\n').trim(),
            startLine,
            endLine,
            startChar: 0,
            endChar: lines[endLine]?.length || 0,
            originalLines,
            cleanedLines
        };
    }

    private getCommentPatterns(languageId: string): CommentPatterns {
        switch (languageId) {
            case 'javascript':
            case 'typescript':
            case 'java':
            case 'csharp':
            case 'cpp':
            case 'c':
            case 'go':
            case 'rust':
            case 'php':
                return {
                    singleLine: [/^\s*\/\/\s*(.*)$/m],
                    multiLineStart: [/^\s*\/\*/],
                    multiLineEnd: [/\*\//]
                };
            case 'python':
                return {
                    singleLine: [/^\s*#\s*(.*)$/m],
                    multiLineStart: [/^\s*"""/],
                    multiLineEnd: [/"""/]
                };
            default:
                return {
                    singleLine: [/^\s*\/\/\s*(.*)$/m, /^\s*#\s*(.*)$/m],
                    multiLineStart: [/^\s*\/\*/],
                    multiLineEnd: [/\*\//]
                };
        }
    }

    private parseMarkdownInComment(
        comment: CommentBlock, 
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        const text = comment.text;
        
        // Identify code block regions to exclude from markdown processing
        const codeBlockRanges = this.getCodeBlockRanges(text);
        
        // Apply gray color to comment block, but exclude code block content
        this.applyGrayColorExcludingCodeBlocks(comment, document, decorations, codeBlockRanges, text);
        
        // Apply syntax highlighting to code blocks
        this.applySyntaxHighlightingToCodeBlocks(text, comment, decorations, document, activeLine, codeBlockRanges);
        
        // Replace comment block delimiters with horizontal lines
        this.replaceCommentDelimiters(comment, decorations, document, activeLine);
        
        // Replace code block markers (```) with horizontal lines
        this.replaceCodeBlockDelimiters(text, comment, decorations, document, activeLine);
        
        // Parse markdown patterns and replace with formatted content
        // Process ALL inline formatting FIRST, before any headers or lists
        this.parseAndReplace(text, /\*\*(.*?)\*\*/g, 'bold', comment, decorations, document, activeLine, codeBlockRanges);
        this.parseAndReplace(text, /(?<!\*)\*([^*]+?)\*(?!\*)/g, 'italic', comment, decorations, document, activeLine, codeBlockRanges);
        // Match single backticks but not triple backticks (code blocks)
        this.parseAndReplace(text, /(?<!`)`([^`]+)`(?!`)/g, 'code', comment, decorations, document, activeLine, codeBlockRanges);
        this.parseAndReplace(text, /~~(.*?)~~/g, 'strikethrough', comment, decorations, document, activeLine, codeBlockRanges);
        
        // Process lists (bullets and numbered)
        this.parseLists(text, comment, decorations, document, activeLine);
        
        // Process headers LAST (this will only hide ## markers and add header styling)
        this.parseHeadersWithNestedFormatting(text, comment, decorations, document, activeLine);
    }

    private replaceCommentDelimiters(
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Only process multi-line comments with original lines
        if (!comment.originalLines || comment.originalLines.length < 2) {
            return;
        }

        const replaceList = decorations.get('replace') || [];
        
        // Replace opening /* on first line
        const firstLine = comment.originalLines[0];
        const openMatch = firstLine.match(/\/\*/);
        if (openMatch && openMatch.index !== undefined) {
            const startPos = new vscode.Position(comment.startLine, openMatch.index);
            const endPos = new vscode.Position(comment.startLine, openMatch.index + 2);
            
            // Skip decoration if it's on the active line
            if (comment.startLine !== activeLine) {
                // Hide the /*
                replaceList.push({
                    range: new vscode.Range(startPos, endPos)
                });
                
                // Add horizontal line
                decorations.get('bold')?.push({
                    range: new vscode.Range(startPos, startPos),
                    renderOptions: {
                        before: {
                            contentText: '━'.repeat(80),
                            color: 'var(--vscode-textSeparator-foreground)'
                        }
                    }
                });
            }
        }
        
        // Replace closing */ on last line
        const lastLine = comment.originalLines[comment.originalLines.length - 1];
        const closeMatch = lastLine.match(/\*\//);
        if (closeMatch && closeMatch.index !== undefined) {
            const startPos = new vscode.Position(comment.endLine, closeMatch.index);
            const endPos = new vscode.Position(comment.endLine, closeMatch.index + 2);
            
            // Skip decoration if it's on the active line
            if (comment.endLine !== activeLine) {
                // Hide the */
                replaceList.push({
                    range: new vscode.Range(startPos, endPos)
                });
                
                // Add horizontal line
                decorations.get('bold')?.push({
                    range: new vscode.Range(startPos, startPos),
                    renderOptions: {
                        before: {
                            contentText: '━'.repeat(80),
                            color: 'var(--vscode-textSeparator-foreground)'
                        }
                    }
                });
            }
        }
        
        decorations.set('replace', replaceList);
    }

    private getCodeBlockRanges(text: string): Array<{start: number, end: number}> {
        const ranges: Array<{start: number, end: number}> = [];
        const lines = text.split('\n');
        let inCodeBlock = false;
        let blockStart = 0;
        let currentPos = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^```/.test(line)) {
                if (!inCodeBlock) {
                    // Start of code block
                    inCodeBlock = true;
                    blockStart = currentPos;
                } else {
                    // End of code block
                    ranges.push({
                        start: blockStart,
                        end: currentPos + line.length
                    });
                    inCodeBlock = false;
                }
            }
            currentPos += line.length + 1; // +1 for newline
        }
        
        return ranges;
    }

    private applySyntaxHighlightingToCodeBlocks(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number,
        codeBlockRanges: Array<{start: number, end: number}>
    ): void {
        for (const codeBlock of codeBlockRanges) {
            const codeContent = text.substring(codeBlock.start, codeBlock.end);
            
            // Order matters: apply in reverse order of precedence (most important last)
            // so that more specific patterns override more general ones
            
            // 1. Variables and identifiers (light blue)
            const variables = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
            this.applySyntaxPattern(codeContent, variables, 'syntax-variable', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // 2. Properties (light blue) - override variables when they're properties
            const properties = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
            this.applySyntaxPattern(codeContent, properties, 'syntax-property', codeBlock.start, comment, decorations, document, activeLine, text, 1);
            
            // 3. Numbers (light green)
            const numbers = /\b\d+\.?\d*\b/g;
            this.applySyntaxPattern(codeContent, numbers, 'syntax-number', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // 4. Keywords (purple) - override variables when they're keywords
            const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|new|this|super|extends|implements|interface|type|enum|public|private|protected|static|readonly|null|undefined|true|false|void|any|string|number|boolean)\b/g;
            this.applySyntaxPattern(codeContent, keywords, 'syntax-keyword', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // 5. Function calls (yellow) - override variables when followed by (
            const functions = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
            this.applySyntaxPattern(codeContent, functions, 'syntax-function', codeBlock.start, comment, decorations, document, activeLine, text, 1);
            
            // 6. Strings (orange) - high priority to avoid conflicts
            const strings = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
            this.applySyntaxPattern(codeContent, strings, 'syntax-string', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // 7. Comments (green, italic) - highest priority, override everything
            const comments = /\/\/.*$/gm;
            this.applySyntaxPattern(codeContent, comments, 'syntax-comment', codeBlock.start, comment, decorations, document, activeLine, text);
        }
    }

    private applySyntaxPattern(
        codeContent: string,
        pattern: RegExp,
        decorationType: string,
        codeBlockStart: number,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number,
        fullText: string,
        captureGroup: number = 0
    ): void {
        const decorationList = decorations.get(decorationType) || [];
        pattern.lastIndex = 0;
        
        let match;
        while ((match = pattern.exec(codeContent)) !== null) {
            const matchText = captureGroup > 0 ? match[captureGroup] : match[0];
            const matchStart = captureGroup > 0 ? match.index : match.index;
            const matchEnd = matchStart + matchText.length;
            
            // Calculate position in full text
            const fullStart = codeBlockStart + matchStart;
            const fullEnd = codeBlockStart + matchEnd;
            
            const position = this.getDocumentPosition(fullStart, fullEnd, comment, document, fullText);
            
            if (position && position.start.line !== activeLine && position.end.line !== activeLine) {
                decorationList.push({
                    range: new vscode.Range(position.start, position.end)
                });
            }
        }
        
        decorations.set(decorationType, decorationList);
    }

    private applyGrayColorExcludingCodeBlocks(
        comment: CommentBlock,
        document: vscode.TextDocument,
        decorations: Map<string, vscode.DecorationOptions[]>,
        codeBlockRanges: Array<{start: number, end: number}>,
        text: string
    ): void {
        const grayList = decorations.get('commentGray') || [];
        
        if (codeBlockRanges.length === 0) {
            // No code blocks, apply gray to entire comment
            grayList.push({
                range: new vscode.Range(
                    new vscode.Position(comment.startLine, 0),
                    new vscode.Position(comment.endLine, document.lineAt(comment.endLine).text.length)
                )
            });
        } else {
            // Apply gray to regions between code blocks
            let lastEnd = 0;
            
            for (const codeBlock of codeBlockRanges) {
                if (lastEnd < codeBlock.start) {
                    // Add gray for the region before this code block
                    const startPos = this.getDocumentPosition(lastEnd, lastEnd, comment, document, text);
                    const endPos = this.getDocumentPosition(codeBlock.start, codeBlock.start, comment, document, text);
                    
                    if (startPos && endPos) {
                        grayList.push({
                            range: new vscode.Range(startPos.start, endPos.start)
                        });
                    }
                }
                lastEnd = codeBlock.end;
            }
            
            // Add gray for any remaining content after the last code block
            if (lastEnd < text.length) {
                const startPos = this.getDocumentPosition(lastEnd, lastEnd, comment, document, text);
                const endPos = new vscode.Position(comment.endLine, document.lineAt(comment.endLine).text.length);
                
                if (startPos) {
                    grayList.push({
                        range: new vscode.Range(startPos.start, endPos)
                    });
                }
            }
        }
        
        decorations.set('commentGray', grayList);
    }

    private replaceCodeBlockDelimiters(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Match lines that are just ``` with optional language identifier
        const codeBlockPattern = /^```(\w*)$/gm;
        const replaceList = decorations.get('replace') || [];
        
        let match;
        while ((match = codeBlockPattern.exec(text)) !== null) {
            const language = match[1] || '';
            const fullMatch = match[0];
            const matchStart = match.index;
            const matchEnd = matchStart + fullMatch.length;
            
            // Get position for the ``` marker
            const position = this.getDocumentPosition(matchStart, matchEnd, comment, document, text);
            
            if (!position) {
                continue;
            }
            
            // Skip decoration if it's on the active line
            if (position.start.line === activeLine) {
                continue;
            }
            
            // Hide the original ```
            replaceList.push({
                range: new vscode.Range(position.start, position.end)
            });
            
            // Add horizontal line with optional language label
            const label = language ? ` ${language} ` : '';
            const lineLength = 80 - label.length;
            const halfLine = Math.floor(lineLength / 2);
            const horizontalLine = '─'.repeat(halfLine) + label + '─'.repeat(lineLength - halfLine);
            
            decorations.get('bold')?.push({
                range: new vscode.Range(position.start, position.start),
                renderOptions: {
                    before: {
                        contentText: horizontalLine,
                        color: 'var(--vscode-textSeparator-foreground)'
                    }
                }
            });
        }
        
        decorations.set('replace', replaceList);
    }

    private parseLists(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Match unordered list items: - item or * item (but not ** for bold)
        const bulletPattern = /^(\s*)[-*]\s+(.*)$/gm;
        // Match ordered list items: 1. item, 2. item, etc.
        const numberedPattern = /^(\s*)(\d+)\.\s+(.*)$/gm;
        
        let match;
        const replaceList = decorations.get('replace') || [];
        
        // Process bullet points
        bulletPattern.lastIndex = 0;
        while ((match = bulletPattern.exec(text)) !== null) {
            const indent = match[1] || '';
            const content = match[2];
            const markerStart = match.index + indent.length;
            const markerEnd = markerStart + 2; // "- " or "* "
            
            // Get position for the bullet marker
            const markerPosition = this.getDocumentPosition(markerStart, markerEnd, comment, document, text);
            
            if (markerPosition) {
                // Skip decoration if it's on the active line
                if (markerPosition.start.line === activeLine) {
                    continue;
                }
                // Hide the original marker (- or *)
                replaceList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.end)
                });
                
                // Replace with bullet character
                const decorationList = decorations.get('bold') || [];
                decorationList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.start),
                    renderOptions: {
                        before: {
                            contentText: '• ',
                            color: '#808080'
                        }
                    }
                });
                decorations.set('bold', decorationList);
            }
        }
        
        // Process numbered lists
        numberedPattern.lastIndex = 0;
        while ((match = numberedPattern.exec(text)) !== null) {
            const indent = match[1] || '';
            const number = match[2];
            const content = match[3];
            const markerStart = match.index + indent.length;
            const markerEnd = markerStart + number.length + 2; // "1. " or "2. " etc.
            
            // Get position for the number marker
            const markerPosition = this.getDocumentPosition(markerStart, markerEnd, comment, document, text);
            
            if (markerPosition) {
                // Skip decoration if it's on the active line
                if (markerPosition.start.line === activeLine) {
                    continue;
                }
                
                // Hide the original marker (1. or 2. etc)
                replaceList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.end)
                });
                
                // Replace with styled number
                const decorationList = decorations.get('bold') || [];
                decorationList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.start),
                    renderOptions: {
                        before: {
                            contentText: `${number}. `,
                            color: '#808080',
                            fontWeight: 'bold'
                        }
                    }
                });
                decorations.set('bold', decorationList);
            }
        }
        
        decorations.set('replace', replaceList);
    }

    private parseAndReplace(
        text: string,
        pattern: RegExp,
        decorationType: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number,
        codeBlockRanges: Array<{start: number, end: number}> = []
    ): void {
        let match;
        const decorationList = decorations.get(decorationType) || [];
        
        // Reset regex lastIndex to ensure we start from the beginning
        pattern.lastIndex = 0;

        while ((match = pattern.exec(text)) !== null) {
            if (match[1] !== undefined) {
                const content = match[1];
                const fullMatch = match[0];
                const fullStart = match.index;
                const fullEnd = fullStart + fullMatch.length;
                
                // Skip if this match is inside a code block
                const isInCodeBlock = codeBlockRanges.some(range => 
                    fullStart >= range.start && fullEnd <= range.end
                );
                if (isInCodeBlock) {
                    continue;
                }
                
                // Get position for the entire match (including syntax characters)
                const position = this.getDocumentPosition(fullStart, fullEnd, comment, document, text);
                
                if (position) {
                    // Skip decoration if it's on the active line
                    if (position.start.line === activeLine || position.end.line === activeLine) {
                        continue;
                    }
                    // Add transparent decoration to hide original text
                    const replaceList = decorations.get('replace') || [];
                    replaceList.push({
                        range: new vscode.Range(position.start, position.end)
                    });
                    decorations.set('replace', replaceList);
                    
                    // Add formatted content before the hidden text
                    const decorationOptions: vscode.DecorationOptions = {
                        range: new vscode.Range(position.start, position.start), // Zero-width range at start
                        renderOptions: {
                            before: {
                                contentText: content,
                                fontWeight: decorationType === 'bold' ? 'bold' : undefined,
                                fontStyle: decorationType === 'italic' ? 'italic' : 
                                           decorationType === 'header3' ? 'italic' : undefined,
                                textDecoration: decorationType === 'strikethrough' ? 'line-through' : 
                                              decorationType === 'header1' ? 'underline' : undefined,
                                color: (decorationType === 'bold' || decorationType === 'italic' || decorationType === 'strikethrough') ? '#808080' : 
                                       (decorationType === 'header1' || decorationType === 'header2' || decorationType === 'header3') ? 
                                       'var(--vscode-textPreformat-foreground)' : undefined,
                                backgroundColor: decorationType === 'code' ? 'var(--vscode-textCodeBlock-background)' : undefined,
                                border: decorationType === 'code' ? '1px solid var(--vscode-textBlockQuote-border)' : undefined,
                                margin: decorationType === 'code' ? '0px 2px' : undefined,

                            }
                        },
                        hoverMessage: new vscode.MarkdownString(`Markdown: ${decorationType}`)
                    };
                    
                    decorationList.push(decorationOptions);
                }
            }
        }

        decorations.set(decorationType, decorationList);
    }

    private parseHeadersWithNestedFormatting(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Process different header levels - use negative lookahead to prevent overlaps
        this.parseHeaderLevel(text, /^### (.*$)/gm, 'header3', comment, decorations, document, activeLine);
        this.parseHeaderLevel(text, /^##(?!#) (.*$)/gm, 'header2', comment, decorations, document, activeLine);
        this.parseHeaderLevel(text, /^#(?!#) (.*$)/gm, 'header1', comment, decorations, document, activeLine);
    }

    private parseHeaderLevel(
        text: string,
        pattern: RegExp,
        decorationType: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        let match;

        while ((match = pattern.exec(text)) !== null) {
            if (match[1] !== undefined) {
                const headerContent = match[1];
                const fullMatch = match[0];
                const headerMarkersLength = fullMatch.length - headerContent.length;
                
                // Position for just the header markers (### or ##)
                const markersStart = match.index;
                const markersEnd = markersStart + headerMarkersLength;
                const markersPosition = this.getDocumentPosition(markersStart, markersEnd, comment, document, text);
                
                if (markersPosition) {
                    // Skip decoration if it's on the active line
                    if (markersPosition.start.line === activeLine) {
                        continue;
                    }
                    // Hide only the header markers, not the content
                    const replaceList = decorations.get('replace') || [];
                    replaceList.push({
                        range: new vscode.Range(markersPosition.start, markersPosition.end)
                    });
                    decorations.set('replace', replaceList);
                }
                
                // Apply header color styling to content without replacing bold/italic formatting
                const contentStart = markersEnd;
                const contentEnd = match.index + fullMatch.length;
                const contentPosition = this.getDocumentPosition(contentStart, contentEnd, comment, document, text);
                
                if (contentPosition) {
                    const decorationList = decorations.get(decorationType) || [];
                    decorationList.push({
                        range: new vscode.Range(contentPosition.start, contentPosition.end),
                        hoverMessage: new vscode.MarkdownString(`Markdown: ${decorationType}`)
                    });
                    decorations.set(decorationType, decorationList);
                }
            }
        }
    }



    private getDocumentPosition(
        matchStart: number,
        matchEnd: number,
        comment: CommentBlock,
        document: vscode.TextDocument,
        commentText: string
    ): { start: vscode.Position; end: vscode.Position } | null {
        // Get the search text from the cleaned comment
        const searchText = commentText.substring(matchStart, matchEnd);
        
        // Get the document text for the comment block
        let documentSearchStart = new vscode.Position(comment.startLine, 0);
        let documentSearchEnd = new vscode.Position(comment.endLine + 1, 0);
        let searchRange = new vscode.Range(documentSearchStart, documentSearchEnd);
        let documentText = document.getText(searchRange);
        
        // Find all occurrences of the search text
        let searchIndex = -1;
        let currentIndex = 0;
        let occurrenceCount = 0;
        
        // Count which occurrence this is in the comment text
        const occurrenceInComment = (commentText.substring(0, matchStart).match(new RegExp(this.escapeRegExp(searchText), 'g')) || []).length;
        
        // Find the nth occurrence in the document text
        while (occurrenceCount <= occurrenceInComment && currentIndex < documentText.length) {
            const foundIndex = documentText.indexOf(searchText, currentIndex);
            if (foundIndex === -1) {
                break;
            }
            if (occurrenceCount === occurrenceInComment) {
                searchIndex = foundIndex;
                break;
            }
            occurrenceCount++;
            currentIndex = foundIndex + 1;
        }
        
        if (searchIndex === -1) {
            return null;
        }
        
        // Convert the index back to line/character position
        const beforeMatch = documentText.substring(0, searchIndex);
        const lines = beforeMatch.split('\n');
        
        const resultStartLine = comment.startLine + lines.length - 1;
        const resultStartChar = lines[lines.length - 1].length;
        
        const endIndex = searchIndex + searchText.length;
        const beforeEnd = documentText.substring(0, endIndex);
        const endLines = beforeEnd.split('\n');
        
        const resultEndLine = comment.startLine + endLines.length - 1;
        const resultEndChar = endLines[endLines.length - 1].length;
        
        return {
            start: new vscode.Position(resultStartLine, resultStartChar),
            end: new vscode.Position(resultEndLine, resultEndChar)
        };
    }

    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private clearAllDecorations(): void {
        vscode.window.visibleTextEditors.forEach(editor => {
            this.decorationTypes.forEach(decorationType => {
                editor.setDecorations(decorationType, []);
            });
        });
    }

    public dispose(): void {
        this.decorationTypes.forEach(decorationType => {
            decorationType.dispose();
        });
        this.decorationTypes.clear();
    }
}

interface CommentBlock {
    text: string;
    startLine: number;
    endLine: number;
    startChar: number;
    endChar: number;
    originalLines?: string[];
    cleanedLines?: string[];
}

interface CommentPatterns {
    singleLine: RegExp[];
    multiLineStart: RegExp[];
    multiLineEnd: RegExp[];
}