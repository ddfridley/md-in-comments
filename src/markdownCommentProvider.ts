import * as vscode from 'vscode';

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
        this.decorationTypes.set('header1', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('header2', vscode.window.createTextEditorDecorationType({}));
        this.decorationTypes.set('header3', vscode.window.createTextEditorDecorationType({}));

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
                    singleLine: [/^\s*\/\/\s*(.*)$/],
                    multiLineStart: [/^\s*\/\*/],
                    multiLineEnd: [/\*\//]
                };
            case 'python':
                return {
                    singleLine: [/^\s*#\s*(.*)$/],
                    multiLineStart: [/^\s*"""/],
                    multiLineEnd: [/"""/]
                };
            default:
                return {
                    singleLine: [/^\s*\/\/\s*(.*)$/, /^\s*#\s*(.*)$/],
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
        this.parseAndReplace(text, /\*\*(.*?)\*\*/g, 'bold', comment, decorations, document);
        this.parseAndReplace(text, /(?<!\*)\*([^*]+?)\*(?!\*)/g, 'italic', comment, decorations, document);
        this.parseAndReplace(text, /`([^`]*)`/g, 'code', comment, decorations, document);
        this.parseAndReplace(text, /~~(.*?)~~/g, 'strikethrough', comment, decorations, document);
        this.parseAndReplace(text, /### (.*$)/gm, 'header3', comment, decorations, document);
        this.parseAndReplace(text, /## (.*$)/gm, 'header2', comment, decorations, document);
        this.parseAndReplace(text, /# (.*$)/gm, 'header1', comment, decorations, document);
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



    private getDocumentPosition(
        matchStart: number,
        matchEnd: number,
        comment: CommentBlock,
        document: vscode.TextDocument,
        commentText: string
    ): { start: vscode.Position; end: vscode.Position } | null {
        // Simple approach: directly find the text in the document
        const searchText = commentText.substring(matchStart, matchEnd);
        
        // Get the document text for the comment block
        let documentSearchStart = new vscode.Position(comment.startLine, 0);
        let documentSearchEnd = new vscode.Position(comment.endLine + 1, 0);
        let searchRange = new vscode.Range(documentSearchStart, documentSearchEnd);
        let documentText = document.getText(searchRange);
        
        // Find the search text in the document
        const searchIndex = documentText.indexOf(searchText);
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