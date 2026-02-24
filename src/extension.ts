import * as vscode from 'vscode';

import { CodeforcesHelper } from "./cf_helper";
import { TestCasesFileSystem } from "./test_cases_file_system";

export function activate(context: vscode.ExtensionContext) {
	const cfHelper = new CodeforcesHelper(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('problemsView', cfHelper)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('codeforcesHelper.compileAndRun', () => cfHelper.compileAndRun())
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('codeforcesHelper.submit', () => cfHelper.submit(true))
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('codeforcesHelper')) {
				cfHelper.config = vscode.workspace.getConfiguration('codeforcesHelper');
			}
		})
	);
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(_ => { cfHelper.onActiveEditorChanged(); })
	);

	const tcfs = new TestCasesFileSystem(cfHelper);
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('tcfs', tcfs));
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('readonly', tcfs));

	return cfHelper;
}

export function deactivate() { }




