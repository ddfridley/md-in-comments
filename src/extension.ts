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
	const supportedLanguages = ['typescript', 'javascript', 'python', 'java', 'csharp', 'cpp', 'c', 'go', 'rust', 'php'];
	
	// Register text document change listeners for supported languages
	supportedLanguages.forEach(language => {
		const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.languageId === language) {
				markdownProvider.updateDecorations(event.document);
			}
		});
		context.subscriptions.push(disposable);
	});

	// Register for active editor changes
	const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && supportedLanguages.includes(editor.document.languageId)) {
			markdownProvider.updateDecorations(editor.document);
		}
	});
	context.subscriptions.push(activeEditorDisposable);

	// Initialize decorations for the current active editor
	if (vscode.window.activeTextEditor) {
		const doc = vscode.window.activeTextEditor.document;
		if (supportedLanguages.includes(doc.languageId)) {
			markdownProvider.updateDecorations(doc);
		}
	}

	// Register commands
	const toggleCommand = vscode.commands.registerCommand('md-in-comments.toggle', () => {
		markdownProvider.toggle();
		vscode.window.showInformationMessage(`Markdown in Comments: ${markdownProvider.isEnabled ? 'Enabled' : 'Disabled'}`);
	});

	context.subscriptions.push(toggleCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
