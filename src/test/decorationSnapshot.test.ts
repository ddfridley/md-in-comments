import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MarkdownCommentProvider } from '../markdownCommentProvider';

/**
 * Decoration snapshot for comparison
 */
interface DecorationSnapshot {
    line: number;
    startChar: number;
    endChar: number;
    type: string;
    content?: string;
}

interface SnapshotFile {
    file: string;
    decorations: DecorationSnapshot[];
}

/**
 * Convert DecorationOptions to a serializable snapshot format
 */
function decorationToSnapshot(decoration: vscode.DecorationOptions, type: string): DecorationSnapshot {
    const snapshot: DecorationSnapshot = {
        line: decoration.range.start.line,
        startChar: decoration.range.start.character,
        endChar: decoration.range.end.character,
        type: type
    };
    
    // Include renderOptions content if present (for replacements)
    const renderOpts = decoration.renderOptions as any;
    if (renderOpts?.before?.contentText) {
        snapshot.content = renderOpts.before.contentText;
    }
    
    return snapshot;
}

/**
 * Sort decorations for consistent comparison
 */
function sortDecorations(decorations: DecorationSnapshot[]): DecorationSnapshot[] {
    return decorations.sort((a, b) => {
        if (a.line !== b.line) { return a.line - b.line; }
        if (a.startChar !== b.startChar) { return a.startChar - b.startChar; }
        if (a.type !== b.type) { return a.type.localeCompare(b.type); }
        return 0;
    });
}

/**
 * Get the workspace root path
 */
function getWorkspaceRoot(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }
    return workspaceFolders[0].uri.fsPath;
}

/**
 * Get the snapshots directory path
 */
function getSnapshotsDir(): string {
    return path.join(getWorkspaceRoot(), 'src', 'test', 'snapshots');
}

/**
 * Get the fixtures directory path
 */
function getFixturesDir(): string {
    return path.join(getWorkspaceRoot(), 'src', 'test', 'fixtures');
}

/**
 * Load expected snapshot from file
 */
function loadSnapshot(filename: string): SnapshotFile | null {
    const snapshotPath = path.join(getSnapshotsDir(), `${filename}.json`);
    if (fs.existsSync(snapshotPath)) {
        const content = fs.readFileSync(snapshotPath, 'utf-8');
        return JSON.parse(content);
    }
    return null;
}

/**
 * Save snapshot to file (for updating snapshots)
 */
function saveSnapshot(filename: string, snapshot: SnapshotFile): void {
    const snapshotsDir = getSnapshotsDir();
    if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    const snapshotPath = path.join(snapshotsDir, `${filename}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

suite('Decoration Snapshot Tests', () => {
    let provider: MarkdownCommentProvider;

    suiteSetup(async () => {
        // Create our own provider for testing
        // Note: We can't share state with the activated extension because
        // tests run in a different module context (out/) than the bundled extension (dist/)
        provider = new MarkdownCommentProvider();
    });

    suiteTeardown(() => {
        provider.dispose();
    });

    /**
     * Test a fixture file against its snapshot
     */
    async function testFixture(fixtureName: string, updateSnapshot = false): Promise<void> {
        // Determine fixture path - check fixtures folder first, then workspace root
        let fixturePath = path.join(getFixturesDir(), fixtureName);
        if (!fs.existsSync(fixturePath)) {
            // Try workspace root
            fixturePath = path.join(getWorkspaceRoot(), fixtureName);
        }
        
        if (!fs.existsSync(fixturePath)) {
            throw new Error(`Fixture not found: ${fixtureName}`);
        }

        // Open the document
        const document = await vscode.workspace.openTextDocument(fixturePath);
        await vscode.window.showTextDocument(document);
        
        // Wait for extension to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get decorations from provider
        const decorationsMap = provider.getDecorations(document);
        
        // Convert to snapshot format
        const decorations: DecorationSnapshot[] = [];
        decorationsMap.forEach((options: vscode.DecorationOptions[], type: string) => {
            for (const option of options) {
                decorations.push(decorationToSnapshot(option, type));
            }
        });

        const sortedDecorations = sortDecorations(decorations);
        const snapshot: SnapshotFile = {
            file: fixtureName,
            decorations: sortedDecorations
        };

        if (updateSnapshot) {
            saveSnapshot(fixtureName, snapshot);
            console.log(`Updated snapshot for ${fixtureName}`);
            return;
        }

        // Load expected snapshot
        const expected = loadSnapshot(fixtureName);
        if (!expected) {
            // No snapshot exists - create one
            saveSnapshot(fixtureName, snapshot);
            console.log(`Created new snapshot for ${fixtureName}`);
            return;
        }

        // Compare decorations with detailed diff output
        const actualSet = new Set(sortedDecorations.map(d => JSON.stringify(d)));
        const expectedSet = new Set(expected.decorations.map(d => JSON.stringify(d)));
        
        const added: DecorationSnapshot[] = sortedDecorations.filter(d => !expectedSet.has(JSON.stringify(d)));
        const removed: DecorationSnapshot[] = expected.decorations.filter(d => !actualSet.has(JSON.stringify(d)));
        
        if (added.length > 0 || removed.length > 0) {
            // Build a helpful diff message
            let diffMessage = `\n\nSnapshot mismatch for ${fixtureName}:\n`;
            diffMessage += `  Total: ${sortedDecorations.length} actual vs ${expected.decorations.length} expected\n`;
            diffMessage += `  Added: ${added.length}, Removed: ${removed.length}\n\n`;
            
            if (removed.length > 0) {
                diffMessage += `REMOVED (in snapshot but not in actual):\n`;
                // Group by line for readability
                const removedByLine = new Map<number, DecorationSnapshot[]>();
                for (const d of removed.slice(0, 20)) { // Limit to first 20
                    const line = d.line;
                    if (!removedByLine.has(line)) { removedByLine.set(line, []); }
                    removedByLine.get(line)!.push(d);
                }
                removedByLine.forEach((decs, line) => {
                    diffMessage += `  Line ${line}:\n`;
                    for (const d of decs) {
                        diffMessage += `    - ${d.type} [${d.startChar}-${d.endChar}]${d.content ? ` "${d.content}"` : ''}\n`;
                    }
                });
                if (removed.length > 20) {
                    diffMessage += `  ... and ${removed.length - 20} more\n`;
                }
            }
            
            if (added.length > 0) {
                diffMessage += `\nADDED (in actual but not in snapshot):\n`;
                const addedByLine = new Map<number, DecorationSnapshot[]>();
                for (const d of added.slice(0, 20)) {
                    const line = d.line;
                    if (!addedByLine.has(line)) { addedByLine.set(line, []); }
                    addedByLine.get(line)!.push(d);
                }
                addedByLine.forEach((decs, line) => {
                    diffMessage += `  Line ${line}:\n`;
                    for (const d of decs) {
                        diffMessage += `    + ${d.type} [${d.startChar}-${d.endChar}]${d.content ? ` "${d.content}"` : ''}\n`;
                    }
                });
                if (added.length > 20) {
                    diffMessage += `  ... and ${added.length - 20} more\n`;
                }
            }
            
            diffMessage += `\nTo update snapshot: rm src/test/snapshots/${fixtureName}.json && npm test`;
            
            assert.fail(diffMessage);
        }
    }

    test('simple.ts fixture', async () => {
        await testFixture('simple.ts');
    });

    test('test.ts fixture', async () => {
        await testFixture('test.ts');
    });

    test('README.md fixture', async () => {
        await testFixture('README.md');
    });
});

/**
 * Utility suite for updating snapshots
 * Run with: npm test -- --grep "Update Snapshots"
 */
suite('Update Snapshots', () => {
    let provider: MarkdownCommentProvider;

    suiteSetup(async () => {
        provider = new MarkdownCommentProvider();
    });

    suiteTeardown(() => {
        provider.dispose();
    });

    test.skip('Update all snapshots', async () => {
        const fixtures = ['simple.ts', 'test.ts', 'README.md'];
        
        for (const fixture of fixtures) {
            let fixturePath = path.join(getFixturesDir(), fixture);
            if (!fs.existsSync(fixturePath)) {
                fixturePath = path.join(getWorkspaceRoot(), fixture);
            }
            
            if (fs.existsSync(fixturePath)) {
                const document = await vscode.workspace.openTextDocument(fixturePath);
                await vscode.window.showTextDocument(document);
                await new Promise(resolve => setTimeout(resolve, 500));

                const decorationsMap = provider.getDecorations(document);
                const decorations: DecorationSnapshot[] = [];
                decorationsMap.forEach((options: vscode.DecorationOptions[], type: string) => {
                    for (const option of options) {
                        decorations.push(decorationToSnapshot(option, type));
                    }
                });

                const snapshot: SnapshotFile = {
                    file: fixture,
                    decorations: sortDecorations(decorations)
                };
                saveSnapshot(fixture, snapshot);
                console.log(`Updated snapshot for ${fixture}`);
            }
        }
    });
});
