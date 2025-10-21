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
        
        // Header decorations with actual styling
        this.decorationTypes.set('header1', vscode.window.createTextEditorDecorationType({
            color: 'var(--vscode-textPreformat-foreground)',
            fontWeight: 'bold',
            textDecoration: 'underline'
        }));
        this.decorationTypes.set('header2', vscode.window.createTextEditorDecorationType({
            color: 'var(--vscode-textPreformat-foreground)',
            fontWeight: 'bold'
        }));
        this.decorationTypes.set('header3', vscode.window.createTextEditorDecorationType({
            color: 'var(--vscode-textPreformat-foreground)',
            fontWeight: 'bold'
        }));

        // Replacement decoration that makes original text take no space
        this.decorationTypes.set('replace', vscode.window.createTextEditorDecorationType({
            color: 'transparent',
            textDecoration: 'none; font-size: 0.1px; width: 0px; margin: 0px'
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
            this.parseMarkdownInComment(comment, decorations, document);
        });

        // Apply decorations
        decorations.forEach((ranges, type) => {
            const decorationType = this.decorationTypes.get(type);
            if (decorationType) {
                editor.setDecorations(decorationType, ranges);
            }
        });
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
                    const cleaned = beforeEnd.replace(/^\s*\*\s?/, '');
                    cleanedLines.push(cleaned);
                    break;
                } else {
                    // Middle line - store original and clean it
                    originalLines.push(line);
                    const cleaned = line.replace(/^\s*\*\s?/, '');
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
        document: vscode.TextDocument
    ): void {
        const text = comment.text;
        
        // Parse markdown patterns and replace with formatted content
        // Process ALL inline formatting FIRST, before any headers
        this.parseAndReplace(text, /\*\*(.*?)\*\*/g, 'bold', comment, decorations, document);
        this.parseAndReplace(text, /(?<!\*)\*([^*]+?)\*(?!\*)/g, 'italic', comment, decorations, document);
        this.parseAndReplace(text, /`([^`]*)`/g, 'code', comment, decorations, document);
        this.parseAndReplace(text, /~~(.*?)~~/g, 'strikethrough', comment, decorations, document);
        
        // Process headers LAST (this will only hide ## markers and add header styling)
        this.parseHeadersWithNestedFormatting(text, comment, decorations, document);
    }



    private parseAndReplace(
        text: string,
        pattern: RegExp,
        decorationType: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument
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
                
                // Get position for the entire match (including syntax characters)
                const position = this.getDocumentPosition(fullStart, fullEnd, comment, document, text);
                
                if (position) {
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
                                fontStyle: decorationType === 'italic' ? 'italic' : undefined,
                                textDecoration: decorationType === 'strikethrough' ? 'line-through' : 
                                              decorationType === 'header1' ? 'underline' : undefined,
                                color: (decorationType === 'header1' || decorationType === 'header2' || decorationType === 'header3') ? 
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
        document: vscode.TextDocument
    ): void {
        // Process different header levels - use negative lookahead to prevent overlaps
        this.parseHeaderLevel(text, /^### (.*$)/gm, 'header3', comment, decorations, document);
        this.parseHeaderLevel(text, /^##(?!#) (.*$)/gm, 'header2', comment, decorations, document);
        this.parseHeaderLevel(text, /^#(?!#) (.*$)/gm, 'header1', comment, decorations, document);
    }

    private parseHeaderLevel(
        text: string,
        pattern: RegExp,
        decorationType: string,
        comment: CommentBlock,
        decorations: Map<string, vscode.DecorationOptions[]>,
        document: vscode.TextDocument
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