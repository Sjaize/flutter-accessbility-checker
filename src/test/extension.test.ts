import * as assert from 'assert';
import * as vscode from 'vscode';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as myExtension from '../../extension';

export function run(): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			// Place your test logic here
			assert.strictEqual(-1, [1, 2, 3].indexOf(5));
			assert.strictEqual(-1, [1, 2, 3].indexOf(0));
			resolve();
		} catch (err) {
			reject(err);
		}
	});
}
