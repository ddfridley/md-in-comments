import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/src/test/**/*.test.js',
	workspaceFolder: '.',
	mocha: {
		timeout: 60000
	}
});
