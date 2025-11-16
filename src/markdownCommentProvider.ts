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
    private cachedDecorations: Map<string, Map<string, vscode.DecorationOptions[]>> = new Map(); // Cache decorations by document URI
    private cachedCommentBlocks: Map<string, CommentBlock[]> = new Map(); // Cache comment blocks by document URI

    constructor() {
        this.initializeDecorationTypes();
    }

    public get isEnabled(): boolean {
        return this._isEnabled;
    }

    public toggle(): void {
        this._isEnabled = !this._isEnabled;
        if (this._isEnabled) {
            // Re-apply decorations to all visible editors with force update
            vscode.window.visibleTextEditors.forEach(editor => {
                this.forceUpdate(editor.document);
            });
        } else {
            // Clear all decorations
            this.clearAllDecorations();
        }
    }

    /**
     * Check if the current cursor position is inside a comment block
     * @param document The document to check
     * @param line The line number to check
     * @returns true if the line is inside a comment block (and not a markdown file)
     */
    public isInCommentBlock(document: vscode.TextDocument, line: number): boolean {
        // Don't treat markdown files as comment blocks for ESC key handling
        if (document.languageId === 'markdown' || document.languageId === 'instructions') {
            return false;
        }

        const docUri = document.uri.toString();
        const commentBlocks = this.cachedCommentBlocks.get(docUri);
        
        if (!commentBlocks) {
            return false;
        }

        // Check if the line is within any comment block
        for (const block of commentBlocks) {
            if (line >= block.startLine && line <= block.endLine) {
                return true;
            }
        }

        return false;
    }

    /**
     * Exit comment block text mode by moving cursor outside the block
     * @param editor The text editor
     */
    public exitCommentBlockTextMode(editor: vscode.TextEditor): void {
        const document = editor.document;
        const currentLine = editor.selection.active.line;
        const docUri = document.uri.toString();
        const commentBlocks = this.cachedCommentBlocks.get(docUri);

        if (!commentBlocks) {
            return;
        }

        // Find the comment block containing the cursor
        for (const block of commentBlocks) {
            if (currentLine >= block.startLine && currentLine <= block.endLine) {
                // Move cursor to the line after the comment block
                const newPosition = new vscode.Position(block.endLine + 1, 0);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                // Trigger decoration update
                this.updateDecorations(document);
                return;
            }
        }
    }

    private initializeDecorationTypes(): void {
        // Placeholder decorations - actual styling handled in before content
        this.decorationTypes.set('bold', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('italic', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('code', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('strikethrough', vscode.window.createTextEditorDecorationType({}));
        
        // Dedicated decoration type for line indentation with vertical bar via border
        this.decorationTypes.set('indent', vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            borderWidth: '0 0 0 2px',
            borderStyle: 'solid', 
            borderColor: '#888888'
        }));
        
        // Header decorations with actual styling - darkest to lighter gray tones
        // Base gray reduced by 20% (from #808080 to #666666)
        this.decorationTypes.set('header1', vscode.window.createTextEditorDecorationType({
            color: '#1a1a1a',  // Darkest gray (was #303030, now much darker)
            fontWeight: 'bold',
            textDecoration: 'underline; font-size: 1.5em'  // 150% size
        }));
        this.decorationTypes.set('header2', vscode.window.createTextEditorDecorationType({
            color: '#333333',  // Dark gray (was #505050, now darker)
            fontWeight: 'bold',
            textDecoration: 'underline; font-size: 1.25em'  // 125% size with underline
        }));
        this.decorationTypes.set('header3', vscode.window.createTextEditorDecorationType({
            color: '#333333',  // Medium gray (was #888888, now darker - this is base -20%)
            fontWeight: 'bold',
            textDecoration: 'underline'
        }));
        // Headers 4-7 use same format as Header 3 but with smaller font sizes
        this.decorationTypes.set('header4', vscode.window.createTextEditorDecorationType({
            color: '#333333',
            fontWeight: 'bold',
            textDecoration: 'underline; font-size: 0.95em'  // 95% of normal size with underline
        }));
        this.decorationTypes.set('header5', vscode.window.createTextEditorDecorationType({
            color: '#333333',
            fontWeight: 'bold',
            textDecoration: 'underline; font-size: 0.9em'  // 90% of normal size with underline
        }));
        this.decorationTypes.set('header6', vscode.window.createTextEditorDecorationType({
            color: '#333333',
            fontWeight: 'bold',
            textDecoration: 'underline; font-size: 0.85em'  // 85% of normal size with underline
        }));
        this.decorationTypes.set('header7', vscode.window.createTextEditorDecorationType({
            color: '#333333',
            fontWeight: 'bold',
            textDecoration: 'underline; font-size: 0.8em'  // 80% of normal size with underline
        }));

        // Gray color for comment block content - made darker
        this.decorationTypes.set('commentGray', vscode.window.createTextEditorDecorationType({
            color: '#4d4d4d'  // Darker gray (was #666666)
        }));

        // Replacement decoration that makes original text take no space
        this.decorationTypes.set('replace', vscode.window.createTextEditorDecorationType({
            opacity: '0',
            letterSpacing: '-999px',
            textDecoration: 'none; font-size: 0.01em'
        }));
        
        // Syntax highlighting colors for code blocks
        // Darker colors that work better with light backgrounds
        this.decorationTypes.set('syntax-keyword', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #AF00DB' },  // Dark purple for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme (inside light background)
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-string', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #A31515' },  // Dark red for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-number', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #098658' },  // Dark green for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-function', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #795E26' },  // Dark yellow for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-comment', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #008000' },  // Dark green for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-variable', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #001080' },  // Dark blue for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-property', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #001080' },  // Dark blue for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }));
        this.decorationTypes.set('syntax-operator', vscode.window.createTextEditorDecorationType({
            light: { textDecoration: 'none; color: #000000' },  // Black for light theme
            dark: { textDecoration: 'none; color: #FFFFFF' },   // White for dark theme
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
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
        
        const previousActiveLine = this.lastActiveLine;
        // Update the last active line
        this.lastActiveLine = activeLine;

        // Check if we have cached decorations for this document
        const docUri = document.uri.toString();
        let allDecorations = this.cachedDecorations.get(docUri);
        let commentBlocks = this.cachedCommentBlocks.get(docUri);
        
        // If no cache, parse and cache
        if (!allDecorations || !commentBlocks) {
            allDecorations = new Map();
            this.decorationTypes.forEach((_, key) => {
                allDecorations!.set(key, []);
            });

            const text = document.getText();

            // Special handling for markdown files - treat entire content as markdown
            // Support both 'markdown' and 'instructions' (for .github/copilot-instructions.md)
            if (document.languageId === 'markdown' || document.languageId === 'instructions') {
                const markdownBlock: CommentBlock = {
                    text: text,
                    startLine: 0,
                    endLine: document.lineCount - 1,
                    startChar: 0,
                    endChar: document.lineAt(document.lineCount - 1).text.length,
                    originalLines: text.split('\n')
                };
                commentBlocks = [markdownBlock];
                this.parseMarkdownFile(text, markdownBlock, allDecorations, document, -1); // Pass -1 to include all lines
            } else {
                // Extract and process comments from code files
                commentBlocks = this.extractComments(text, document.languageId);
                commentBlocks.forEach(comment => {
                    this.parseMarkdownInComment(comment, allDecorations!, document, -1); // Pass -1 to include all lines
                });
            }
            
            this.cachedDecorations.set(docUri, allDecorations);
            this.cachedCommentBlocks.set(docUri, commentBlocks);
        }

        // Find which comment block contains the active line
        // Only apply block-level exclusion for code files with comment blocks,
        // not for markdown files where the entire file is one "block"
        let activeCommentBlock: CommentBlock | null = null;
        const isMarkdownFile = document.languageId === 'markdown' || document.languageId === 'instructions';
        if (!isMarkdownFile) {
            for (const block of commentBlocks) {
                if (activeLine >= block.startLine && activeLine <= block.endLine) {
                    activeCommentBlock = block;
                    break;
                }
            }
        }

        // Filter decorations to exclude all lines in the active comment block
        const filteredDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
        allDecorations.forEach((decorationList, type) => {
            const filtered = decorationList.filter(decoration => {
                const line = decoration.range.start.line;
                // If there's an active comment block (in code files), exclude all lines in it
                if (activeCommentBlock) {
                    return line < activeCommentBlock.startLine || line > activeCommentBlock.endLine;
                }
                // Otherwise, just exclude the active line (for non-comment lines and markdown files)
                return line !== activeLine;
            });
            filteredDecorations.set(type, filtered);
        });

        // Apply decorations
        filteredDecorations.forEach((ranges, type) => {
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
        // Clear cache to force re-parse
        this.cachedDecorations.delete(document.uri.toString());
        this.cachedCommentBlocks.delete(document.uri.toString());
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
                    singleLine: [/\/\/\s*(.*)$/],  // Matches // anywhere on the line
                    multiLineStart: [/^\s*\/\*/],
                    multiLineEnd: [/\*\//]
                };
            case 'python':
                return {
                    singleLine: [/#\s*(.*)$/],  // Matches # anywhere on the line
                    multiLineStart: [/^\s*"""/],
                    multiLineEnd: [/"""/]
                };
            case 'markdown':
                return {
                    singleLine: [],  // No single-line comments in markdown
                    multiLineStart: [],  // No comment extraction needed - entire file is markdown
                    multiLineEnd: []
                };
            default:
                return {
                    singleLine: [/\/\/\s*(.*)$/, /#\s*(.*)$/],
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
        const isSingleLine = comment.startLine === comment.endLine;
        
        if (isSingleLine) {
            // Single-line comments: limited features only (no headers, lists, code blocks, gray overlay)
            this.parseSingleLineComment(text, comment, decorations, document, activeLine);
        } else {
            // Multi-line comments: full markdown support
            this.parseMultiLineComment(text, comment, decorations, document, activeLine);
        }
    }

    private parseSingleLineComment(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // NO gray color overlay for single-line comments
        // NO code blocks, headers, or lists
        // Only inline formatting: bold, italic, code, strikethrough
        
        const codeBlockRanges: Array<{start: number, end: number}> = []; // Empty - no code blocks in single lines
        
        // Parse inline formatting only - pass false for applyGrayColor to preserve original comment color
        this.parseAndReplace(text, /\*\*(.*?)\*\*/g, 'bold', comment, decorations, document, activeLine, codeBlockRanges, false);
        this.parseAndReplace(text, /(?<!\*)\*([^*]+?)\*(?!\*)/g, 'italic', comment, decorations, document, activeLine, codeBlockRanges, false);
        this.parseAndReplace(text, /(?<!`)`([^`\n]+)`(?!`)/g, 'code', comment, decorations, document, activeLine, codeBlockRanges, false);
        this.parseAndReplace(text, /~~(.*?)~~/g, 'strikethrough', comment, decorations, document, activeLine, codeBlockRanges, false);
    }

    private parseMultiLineComment(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Full markdown support for multi-line comments
        
        // Identify code block regions to exclude from markdown processing
        const codeBlockRanges = this.getCodeBlockRanges(text);
        
        // Apply gray color to comment block, but exclude code block content
        this.applyGrayColorExcludingCodeBlocks(comment, document, decorations, codeBlockRanges, text);
        
        // Apply syntax highlighting to code blocks
        this.applySyntaxHighlightingToCodeBlocks(text, comment, decorations, document, activeLine, codeBlockRanges);
        
        // Replace comment block delimiters with horizontal lines
        this.replaceCommentDelimiters(comment, decorations, document, activeLine);
        
        // Hide asterisk line prefixes (decorative * at start of lines)
        this.hideAsteriskPrefixes(comment, decorations, document, activeLine);
        
        // Replace code block markers (```) with horizontal lines
        this.replaceCodeBlockDelimiters(text, comment, decorations, document, activeLine);
        
        // Add 1ch indent to all non-empty lines in the comment block
        this.addLineIndentation(comment, decorations, document, activeLine);
        
        // Parse markdown patterns and replace with formatted content
        // Process ALL inline formatting FIRST, before any headers or lists
        this.parseAndReplace(text, /\*\*(.*?)\*\*/g, 'bold', comment, decorations, document, activeLine, codeBlockRanges);
        this.parseAndReplace(text, /(?<!\*)\*([^*]+?)\*(?!\*)/g, 'italic', comment, decorations, document, activeLine, codeBlockRanges);
        // Match single backticks but not triple backticks (code blocks) - [^`\n]+ prevents matching across lines
        this.parseAndReplace(text, /(?<!`)`([^`\n]+)`(?!`)/g, 'code', comment, decorations, document, activeLine, codeBlockRanges);
        this.parseAndReplace(text, /~~(.*?)~~/g, 'strikethrough', comment, decorations, document, activeLine, codeBlockRanges);
        
        // Process links and images (must be before lists to avoid conflicts)
        this.parseLinks(text, comment, decorations, document, activeLine, codeBlockRanges);
        this.parseImages(text, comment, decorations, document, activeLine, codeBlockRanges);
        
        // Process task lists
        this.parseTaskLists(text, comment, decorations, document, activeLine);
        
        // Process lists (bullets and numbered)
        this.parseLists(text, comment, decorations, document, activeLine);
        
        // Process headers LAST (this will only hide ## markers and add header styling)
        this.parseHeadersWithNestedFormatting(text, comment, decorations, document, activeLine);
    }

    private parseMarkdownFile(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Markdown files: full markdown support without comment-specific processing
        // NO gray color overlay, NO comment delimiter replacement
        
        // Identify HTML comment regions to exclude from markdown processing
        const htmlCommentRanges: Array<{start: number, end: number}> = [];
        const htmlCommentPattern = /<!--[\s\S]*?-->/g;
        let htmlMatch;
        while ((htmlMatch = htmlCommentPattern.exec(text)) !== null) {
            htmlCommentRanges.push({
                start: htmlMatch.index,
                end: htmlMatch.index + htmlMatch[0].length
            });
        }
        
        // Identify code block regions to exclude from markdown processing
        const codeBlockRanges = this.getCodeBlockRanges(text);
        
        // Combine HTML comments and code blocks into exclusion ranges
        const exclusionRanges = [...htmlCommentRanges, ...codeBlockRanges];
        
        // Apply syntax highlighting to code blocks (not HTML comments)
        this.applySyntaxHighlightingToCodeBlocks(text, comment, decorations, document, activeLine, codeBlockRanges);
        
        // Replace code block markers (```) with horizontal lines
        this.replaceCodeBlockDelimiters(text, comment, decorations, document, activeLine);
        
        // Parse markdown patterns and replace with formatted content
        // Process ALL inline formatting FIRST, before any headers or lists
        // Pass false for applyLineStartIndent since this is a pure markdown file, not a comment block
        this.parseAndReplace(text, /\*\*(.*?)\*\*/g, 'bold', comment, decorations, document, activeLine, exclusionRanges, true, false);
        this.parseAndReplace(text, /(?<!\*)\*([^*]+?)\*(?!\*)/g, 'italic', comment, decorations, document, activeLine, exclusionRanges, true, false);
        // Match single backticks but not triple backticks (code blocks) - [^`\n]+ prevents matching across lines
        this.parseAndReplace(text, /(?<!`)`([^`\n]+)`(?!`)/g, 'code', comment, decorations, document, activeLine, exclusionRanges, true, false);
        this.parseAndReplace(text, /~~(.*?)~~/g, 'strikethrough', comment, decorations, document, activeLine, exclusionRanges, true, false);
        
        // Process links and images (must be before lists to avoid conflicts)
        this.parseLinks(text, comment, decorations, document, activeLine, exclusionRanges);
        this.parseImages(text, comment, decorations, document, activeLine, exclusionRanges);
        
        // Process task lists
        this.parseTaskLists(text, comment, decorations, document, activeLine, exclusionRanges);
        
        // Process lists (bullets and numbered)
        this.parseLists(text, comment, decorations, document, activeLine, exclusionRanges);
        
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
        
        // Replace opening /* with any number of asterisks on first line
        const firstLine = comment.originalLines[0];
        const openMatch = firstLine.match(/\/\*+/);  // Match /* followed by any number of *
        if (openMatch && openMatch.index !== undefined) {
            const startPos = new vscode.Position(comment.startLine, openMatch.index);
            const endPos = new vscode.Position(comment.startLine, openMatch.index + openMatch[0].length);
            
            // Skip decoration if it's on the active line
            if (comment.startLine !== activeLine) {
                // Hide the /* or /***** etc.
                replaceList.push({
                    range: new vscode.Range(startPos, endPos)
                });
                
                // Add horizontal line at position 0 to connect with vertical border
                // Use box-drawing character for top-left corner connection
                const lineStartPos = new vscode.Position(comment.startLine, 0);
                decorations.get('bold')?.push({
                    range: new vscode.Range(lineStartPos, lineStartPos),
                    renderOptions: {
                        before: {
                            contentText: '┏' + '━'.repeat(79),  // Top-left corner with heavy horizontal line (matches 2px border)
                            color: '#888888',  // Match vertical border color
                            margin: '0 0 0 -3px'  // Pull left to align with border
                        }
                    }
                });
            }
        }
        
        // Replace closing */ with any number of asterisks on last line
        const lastLine = comment.originalLines[comment.originalLines.length - 1];
        const closeMatch = lastLine.match(/\*+\//);  // Match any number of * followed by /
        if (closeMatch && closeMatch.index !== undefined) {
            const startPos = new vscode.Position(comment.endLine, closeMatch.index);
            const endPos = new vscode.Position(comment.endLine, closeMatch.index + closeMatch[0].length);
            
            // Skip decoration if it's on the active line
            if (comment.endLine !== activeLine) {
                // Hide the */ or ****/ etc.
                replaceList.push({
                    range: new vscode.Range(startPos, endPos)
                });
                
                // Add horizontal line at position 0 to connect with vertical border
                // Use box-drawing character for bottom-left corner connection
                const lineStartPos = new vscode.Position(comment.endLine, 0);
                decorations.get('bold')?.push({
                    range: new vscode.Range(lineStartPos, lineStartPos),
                    renderOptions: {
                        before: {
                            contentText: '┗' + '━'.repeat(79),  // Bottom-left corner with heavy horizontal line (matches 2px border)
                            color: '#888888',  // Match vertical border color
                            margin: '0 0 0 -3px'  // Pull left to align with border
                        }
                    }
                });
            }
        }
        
        decorations.set('replace', replaceList);
    }

    private hideAsteriskPrefixes(
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
        const indentList = decorations.get('indent') || [];
        
        // Process each line in the comment block (skip first and last which are /* and */)
        for (let i = 1; i < comment.originalLines.length - 1; i++) {
            const line = comment.originalLines[i];
            const lineNumber = comment.startLine + i;
            
            // Skip decoration if it's on the active line
            if (lineNumber === activeLine) {
                continue;
            }
            
            // Match lines that start with optional whitespace, then "*" optionally followed by space
            // This handles " * ", "* ", " *", and "*" patterns (JavaDoc-style comment formatting)
            const asteriskMatch = line.match(/^(\s*)\*(\s?)$/);
            if (asteriskMatch && asteriskMatch.index !== undefined) {
                const startChar = asteriskMatch.index; // Start from beginning (includes whitespace)
                const endChar = startChar + asteriskMatch[0].length; // Full match length (entire line)
                
                const startPos = new vscode.Position(lineNumber, startChar);
                const endPos = new vscode.Position(lineNumber, endChar);
                
                // Hide the entire line if it's just whitespace + asterisk + optional space
                replaceList.push({
                    range: new vscode.Range(startPos, endPos)
                });
                
                // Add 1ch indent at the position where content will start (after the hidden prefix)
                indentList.push({
                    range: new vscode.Range(endPos, endPos),
                    renderOptions: {
                        before: {
                            contentText: '',
                            margin: '0 0 0 1ch'
                        }
                    }
                });
                continue; // Skip to next line
            }
            
            // Match lines with content after the asterisk: " * text" or "* text"
            const asteriskWithContentMatch = line.match(/^(\s*)\*\s/);
            if (asteriskWithContentMatch && asteriskWithContentMatch.index !== undefined) {
                const startChar = asteriskWithContentMatch.index;
                const endChar = startChar + asteriskWithContentMatch[0].length;
                
                const startPos = new vscode.Position(lineNumber, startChar);
                const endPos = new vscode.Position(lineNumber, endChar);
                
                // Hide just the prefix: " * " or "* "
                replaceList.push({
                    range: new vscode.Range(startPos, endPos)
                });
                
                // No need to add indent here since addLineIndentation handles it globally
            }
        }
        
        decorations.set('replace', replaceList);
        decorations.set('indent', indentList);
    }

    private addLineIndentation(
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number
    ): void {
        // Add vertical bar at the leftmost position for all non-empty lines in the comment block
        const indentList = decorations.get('indent') || [];
        
        for (let lineNum = comment.startLine; lineNum <= comment.endLine; lineNum++) {
            // Skip the active line
            if (lineNum === activeLine) {
                continue;
            }
            
            const lineText = document.lineAt(lineNum).text;
            const trimmedLine = lineText.trim();
            
            // Skip comment delimiter lines only
            if (trimmedLine === '/*' || trimmedLine === '*/' || 
                trimmedLine.startsWith('/*') || trimmedLine.endsWith('*/')) {
                continue;
            }
            
            // Always place the vertical bar at position 0 (leftmost) for all lines including empty
            // Use whole line range so the border appears on the entire line
            // Add space at position 0 to create gap between border and text
            const startPos = new vscode.Position(lineNum, 0);
            const endPos = new vscode.Position(lineNum, Number.MAX_SAFE_INTEGER);
            
            // Add vertical bar decoration to entire line with 1rem space before content
            indentList.push({
                range: new vscode.Range(startPos, endPos),
                renderOptions: {
                    before: {
                        contentText: '  ',  // Two spaces for better visibility
                        margin: '0 0 0 1rem'  // 1rem left margin
                    }
                }
            });
        }
        
        decorations.set('indent', indentList);
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
                    // Start of code block - start AFTER this line
                    inCodeBlock = true;
                    blockStart = currentPos + line.length + 1; // +1 for newline, start on next line
                } else {
                    // End of code block - end BEFORE this line
                    ranges.push({
                        start: blockStart,
                        end: currentPos // End before the closing ```
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
            
            // Apply patterns in order - later ones will layer on top
            // Strings (high priority to avoid conflicts)
            const strings = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
            this.applySyntaxPattern(codeContent, strings, 'syntax-string', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // Comments (highest priority, override everything)
            const comments = /\/\/.*$/gm;
            this.applySyntaxPattern(codeContent, comments, 'syntax-comment', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // Keywords
            const keywords = /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|new|this|super|extends|implements|interface|type|enum|public|private|protected|static|readonly|null|undefined|true|false|void|any|string|number|boolean)\b/g;
            this.applySyntaxPattern(codeContent, keywords, 'syntax-keyword', codeBlock.start, comment, decorations, document, activeLine, text);
            
            // Function calls
            const functions = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
            this.applySyntaxPattern(codeContent, functions, 'syntax-function', codeBlock.start, comment, decorations, document, activeLine, text, 1);
            
            // Numbers
            const numbers = /\b\d+\.?\d*\b/g;
            this.applySyntaxPattern(codeContent, numbers, 'syntax-number', codeBlock.start, comment, decorations, document, activeLine, text);
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
            
            // Detect theme and use opposite color for horizontal line
            const themeKind = vscode.window.activeColorTheme.kind;
            const isLightTheme = themeKind === vscode.ColorThemeKind.Light;
            const lineColor = isLightTheme ? '#cccccc' : '#555555'; // Light color for dark bg, dark color for light bg
            
            decorations.get('bold')?.push({
                range: new vscode.Range(position.start, position.start),
                renderOptions: {
                    before: {
                        contentText: horizontalLine,
                        color: lineColor
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
        activeLine: number,
        exclusionRanges: Array<{start: number, end: number}> = []
    ): void {
        // Match unordered list items: - item or * item (but not ** for bold)
        const bulletPattern = /^(\s*)[-*]\s+(.*)$/gm;
        // Match ordered list items: 1. item, 2. item, etc.
        const numberedPattern = /^(\s*)(\d+)\.\s+(.*)$/gm;
        // Task list pattern to skip - no ^ anchor since we're testing extracted text
        const taskPattern = /^\s*-\s+\[([ xX])\]/;
        
        let match;
        const replaceList = decorations.get('replace') || [];
        
        // Process bullet points
        bulletPattern.lastIndex = 0;
        while ((match = bulletPattern.exec(text)) !== null) {
            // Check if match is within any exclusion range (code blocks, HTML comments)
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            const isInExcludedRange = exclusionRanges.some(range => 
                matchStart >= range.start && matchStart < range.end
            );
            
            if (isInExcludedRange) {
                continue;
            }
            
            const indent = match[1] || '';
            const content = match[2];
            
            // Skip if this is a task list item - check the content for [ ] or [x]
            if (/^\[([ xX])\]/.test(content)) {
                continue;
            }
            
            // Skip if this is just a comment delimiter line (empty or whitespace-only content)
            // These are asterisk prefixes in JavaDoc-style comments, not actual list items
            if (!content || content.trim() === '') {
                continue;
            }
            
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
                
                // Replace with bullet character with margin-left for indent (2ch = 1ch base + 1ch list)
                const decorationList = decorations.get('bold') || [];
                decorationList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.start),
                    renderOptions: {
                        before: {
                            contentText: '• ',
                            color: '#808080',
                            margin: '0 0 0 2ch'  // 2 character width left margin for indent
                        }
                    }
                });
                decorations.set('bold', decorationList);
            }
        }
        
        // Process numbered lists
        numberedPattern.lastIndex = 0;
        while ((match = numberedPattern.exec(text)) !== null) {
            // Check if match is within any exclusion range (code blocks, HTML comments)
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            const isInExcludedRange = exclusionRanges.some(range => 
                matchStart >= range.start && matchStart < range.end
            );
            
            if (isInExcludedRange) {
                continue;
            }
            
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
                
                // Replace with styled number with margin-left for indent (2ch = 1ch base + 1ch list)
                const decorationList = decorations.get('bold') || [];
                decorationList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.start),
                    renderOptions: {
                        before: {
                            contentText: `${number}. `,
                            color: '#808080',
                            fontWeight: 'bold',
                            margin: '0 0 0 2ch'  // 2 character width left margin for indent
                        }
                    }
                });
                decorations.set('bold', decorationList);
            }
        }
        
        decorations.set('replace', replaceList);
    }

    private parseLinks(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number,
        codeBlockRanges: Array<{start: number, end: number}>
    ): void {
        // Match markdown links: [text](url)
        const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const replaceList = decorations.get('replace') || [];
        
        linkPattern.lastIndex = 0;
        while ((match = linkPattern.exec(text)) !== null) {
            const linkText = match[1];
            const url = match[2];
            const fullStart = match.index;
            const fullEnd = fullStart + match[0].length;
            
            // Skip if this match is inside a code block
            const isInCodeBlock = codeBlockRanges.some(range => 
                fullStart >= range.start && fullEnd <= range.end
            );
            if (isInCodeBlock) {
                continue;
            }
            
            // Get position for the entire link
            const position = this.getDocumentPosition(fullStart, fullEnd, comment, document, text);
            
            if (position) {
                // Skip decoration if it's on the active line
                if (position.start.line === activeLine || position.end.line === activeLine) {
                    continue;
                }
                
                // Hide the original link syntax
                replaceList.push({
                    range: new vscode.Range(position.start, position.end)
                });
                
                // Show only the link text with underline to indicate it's a link
                const decorationList = decorations.get('code') || [];
                decorationList.push({
                    range: new vscode.Range(position.start, position.start),
                    renderOptions: {
                        before: {
                            contentText: linkText,
                            color: '#0066cc',
                            textDecoration: 'underline'
                        }
                    }
                });
                decorations.set('code', decorationList);
            }
        }
        
        decorations.set('replace', replaceList);
    }

    private parseImages(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number,
        codeBlockRanges: Array<{start: number, end: number}>
    ): void {
        // Match markdown images: ![alt](url)
        const imagePattern = /!\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const replaceList = decorations.get('replace') || [];
        
        imagePattern.lastIndex = 0;
        while ((match = imagePattern.exec(text)) !== null) {
            const altText = match[1];
            const url = match[2];
            const fullStart = match.index;
            const fullEnd = fullStart + match[0].length;
            
            // Skip if this match is inside a code block
            const isInCodeBlock = codeBlockRanges.some(range => 
                fullStart >= range.start && fullEnd <= range.end
            );
            if (isInCodeBlock) {
                continue;
            }
            
            // Get position for the entire image syntax
            const position = this.getDocumentPosition(fullStart, fullEnd, comment, document, text);
            
            if (position) {
                // Skip decoration if it's on the active line
                if (position.start.line === activeLine || position.end.line === activeLine) {
                    continue;
                }
                
                // Hide the original image syntax
                replaceList.push({
                    range: new vscode.Range(position.start, position.end)
                });
                
                // Show only the alt text with italic style to indicate it's an image
                const decorationList = decorations.get('italic') || [];
                decorationList.push({
                    range: new vscode.Range(position.start, position.start),
                    renderOptions: {
                        before: {
                            contentText: `🖼️ ${altText}`,
                            fontStyle: 'italic',
                            color: '#666666'
                        }
                    },
                    hoverMessage: new vscode.MarkdownString(`Image: ![${altText}](${url})`)
                });
                decorations.set('italic', decorationList);
            }
        }
        
        decorations.set('replace', replaceList);
    }

    private parseTaskLists(
        text: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument,
        activeLine: number,
        exclusionRanges: Array<{start: number, end: number}> = []
    ): void {
        // Match task list items: - [ ] unchecked or - [x] checked
        const taskPattern = /^(\s*)-\s+\[([ xX])\]\s+(.*)$/gm;
        let match;
        const replaceList = decorations.get('replace') || [];
        
        taskPattern.lastIndex = 0;
        while ((match = taskPattern.exec(text)) !== null) {
            // Check if match is within any exclusion range (code blocks, HTML comments)
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;
            const isInExcludedRange = exclusionRanges.some(range => 
                matchStart >= range.start && matchStart < range.end
            );
            
            if (isInExcludedRange) {
                continue;
            }
            
            const indent = match[1] || '';
            const checkState = match[2];
            const content = match[3];
            const markerStart = match.index + indent.length;
            const markerEnd = markerStart + (match[0].length - indent.length - content.length);
            
            // Get position for the task marker
            const markerPosition = this.getDocumentPosition(markerStart, markerEnd, comment, document, text);
            
            if (markerPosition) {
                // Skip decoration if it's on the active line
                if (markerPosition.start.line === activeLine) {
                    continue;
                }
                
                // Hide the original marker (- [ ] or - [x])
                replaceList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.end)
                });
                
                // Replace with checkbox character with margin-left for indent (2ch = 1ch base + 1ch list)
                const isChecked = checkState.toLowerCase() === 'x';
                const checkbox = isChecked ? '☑' : '☐';
                const decorationList = decorations.get('bold') || [];
                decorationList.push({
                    range: new vscode.Range(markerPosition.start, markerPosition.start),
                    renderOptions: {
                        before: {
                            contentText: `${checkbox} `,
                            color: isChecked ? '#4CAF50' : '#808080',
                            margin: '0 0 0 2ch'  // 2 character width left margin for indent
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
        codeBlockRanges: Array<{start: number, end: number}> = [],
        applyGrayColor: boolean = true,
        applyLineStartIndent: boolean = true
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
                    
                    // Check if this element is at the start of the line (position.start.character is 0 or only whitespace before)
                    const lineText = document.lineAt(position.start.line).text;
                    const textBeforeElement = lineText.substring(0, position.start.character).trim();
                    const isAtLineStart = textBeforeElement === '' || textBeforeElement === '*' || /^\*+$/.test(textBeforeElement);
                    
                    // Add formatted content before the hidden text
                    const decorationOptions: vscode.DecorationOptions = {
                        range: new vscode.Range(position.start, position.start), // Zero-width range at start
                        renderOptions: {
                            before: {
                                contentText: content,
                                fontWeight: decorationType === 'bold' ? 'bold' : undefined,
                                fontStyle: decorationType === 'italic' ? 'italic' : 
                                           (decorationType === 'header3' || decorationType === 'header4' || 
                                            decorationType === 'header5' || decorationType === 'header6' || 
                                            decorationType === 'header7') ? 'italic' : undefined,
                                textDecoration: decorationType === 'strikethrough' ? 'line-through' : 
                                              decorationType === 'header1' ? 'underline' : undefined,
                                color: applyGrayColor && (decorationType === 'bold' || decorationType === 'italic' || decorationType === 'strikethrough') ? '#4d4d4d' : 
                                       (decorationType === 'header1' || decorationType === 'header2' || decorationType === 'header3' ||
                                        decorationType === 'header4' || decorationType === 'header5' || 
                                        decorationType === 'header6' || decorationType === 'header7') ? 
                                       'var(--vscode-textPreformat-foreground)' : undefined,
                                backgroundColor: decorationType === 'code' ? 'var(--vscode-textCodeBlock-background)' : undefined,
                                border: decorationType === 'code' ? '1px solid var(--vscode-textBlockQuote-border)' : undefined,
                                margin: decorationType === 'code' ? '0px 2px' : 
                                        (isAtLineStart && applyLineStartIndent) ? '0 0 0 1rem' : undefined,  // Add 1rem left margin if at line start for vertical bar spacing

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
        // Headers 4-7 are parsed first (longest to shortest) to avoid overlap
        this.parseHeaderLevel(text, /^####### (.*$)/gm, 'header7', comment, decorations, document, activeLine);
        this.parseHeaderLevel(text, /^###### (.*$)/gm, 'header6', comment, decorations, document, activeLine);
        this.parseHeaderLevel(text, /^##### (.*$)/gm, 'header5', comment, decorations, document, activeLine);
        this.parseHeaderLevel(text, /^#### (.*$)/gm, 'header4', comment, decorations, document, activeLine);
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