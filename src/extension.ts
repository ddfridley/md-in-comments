// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MarkdownCommentProvider } from './markdownCommentProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('MD in Comments extension is now active!');

	// Create the markdown comment provider
	const markdownProvider = new MarkdownCommentProvider();

	// Register the decoration provider for all supported languages
	const supportedLanguages = ['typescript', 'javascript', 'javascriptreact', 'typescriptreact', 'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust', 'php', 'markdown', 'instructions'];
	
	// Register text document change listeners for supported languages
	// Only update when switching files or opening new files
	supportedLanguages.forEach(language => {
		const disposable = vscode.workspace.onDidOpenTextDocument((document) => {
			if (document.languageId === language) {
				markdownProvider.updateDecorations(document);
			}
		});
		context.subscriptions.push(disposable);
	});

	// Register for active editor changes to apply decorations
	const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && supportedLanguages.includes(editor.document.languageId)) {
			markdownProvider.forceUpdate(editor.document);
		}
	});
	context.subscriptions.push(activeEditorDisposable);

	// Register for cursor position changes to show raw text on active line
	const cursorDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
		if (supportedLanguages.includes(event.textEditor.document.languageId)) {
			// Update decorations with current active line
			markdownProvider.updateDecorations(event.textEditor.document);
		}
	});
	context.subscriptions.push(cursorDisposable);

	// Register for document content changes to invalidate cache
	const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
		if (supportedLanguages.includes(event.document.languageId)) {
			// Clear cache and force update when document content changes
			markdownProvider.forceUpdate(event.document);
		}
	});
	context.subscriptions.push(documentChangeDisposable);

	// Register for theme changes to reinitialize decorations with new colors
	const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
		// Reinitialize decorations with theme-aware colors
		markdownProvider.reinitializeForTheme();
		// Force update all visible editors
		vscode.window.visibleTextEditors.forEach(editor => {
			if (supportedLanguages.includes(editor.document.languageId)) {
				markdownProvider.forceUpdate(editor.document);
			}
		});
	});
	context.subscriptions.push(themeChangeDisposable);

	// Initialize decorations for the current active editor
	if (vscode.window.activeTextEditor) {
		const doc = vscode.window.activeTextEditor.document;
		if (supportedLanguages.includes(doc.languageId)) {
			markdownProvider.forceUpdate(doc);
		}
	}

	// Register commands
	const toggleCommand = vscode.commands.registerCommand('md-in-comments.toggle', () => {
		markdownProvider.toggle();
		const status = markdownProvider.isEnabled ? 'Enabled' : 'Disabled';
		vscode.window.showInformationMessage(`Markdown in Comments: ${status}`);
	});

	// Register ESC key command to exit comment block text mode
	const escapeCommand = vscode.commands.registerCommand('md-in-comments.escapeCommentBlock', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor && markdownProvider.isEnabled) {
			const currentLine = editor.selection.active.line;
			// Only handle ESC if we're inside a comment block
			if (markdownProvider.isInCommentBlock(editor.document, currentLine)) {
				markdownProvider.exitCommentBlockTextMode(editor);
			}
		}
	});

	context.subscriptions.push(toggleCommand);
	context.subscriptions.push(escapeCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
