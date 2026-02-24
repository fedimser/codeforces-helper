import * as assert from 'assert';
import * as vscode from 'vscode';
import { mkdtemp, writeFile, rm } from "fs/promises";
import * as os from 'os';
import * as path from 'path';

import { CodeforcesHelper } from '../cf_helper';

suite('CodeforcesHelper UI', function (this: Mocha.Suite) {
	this.timeout(20000);

	let tempDir: string;
	let cfHelper: CodeforcesHelper;

	this.beforeAll(async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "cfhelper-ui-test"));

		const extension = vscode.extensions.getExtension('DmytroFedoriaka.codeforces-helper-fedimser')!;
		await extension.activate();
		assert.equal(extension.isActive, true);
		cfHelper = extension.exports;
		await vscode.commands.executeCommand('workbench.view.extension.codeforcesHelper');  // Show side panel.
	});

	this.afterAll(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test('Runs tests on correct Python solution', async () => {
		await cfHelper.loadContest(59);
		await cfHelper.selectProblem("A");

		const filePath = path.join(tempDir, 'A.py');
		const pyCode = "s=input();n,k=len(s),len([c for c in s if 'a'<=c<='z']);print(s.lower() if k>=n-k else s.upper())";
		await writeFile(filePath, pyCode);
		const doc = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(doc, { preview: false });

		await cfHelper.compileAndRun();

		const problem = cfHelper.getCurrentProblem();
		assert.equal(problem.index, "A");
		assert.equal(problem.name, "Word");
		assert.equal(problem.testCases.length, 3);
		for (const testCase of problem.testCases) {
			assert.equal(testCase.verdict, "OK");
		}
	});

	test('Runs tests on incorrect Python solution', async () => {
		await cfHelper.loadContest(59);
		await cfHelper.selectProblem("A");

		const filePath = path.join(tempDir, 'A-wrong.py');
		const pyCode = "print(input().lower())";
		await writeFile(filePath, pyCode);
		const doc = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(doc, { preview: false });

		await cfHelper.compileAndRun();

		const problem = cfHelper.getCurrentProblem();
		assert.equal(problem.testCases.length, 3);
		assert.equal(problem.testCases[0].verdict, "OK");
		assert.equal(problem.testCases[1].verdict, "WA");
		assert.equal(problem.testCases[2].verdict, "OK");
	});

	test('Runs tests on correct C++ solution', async () => {
		await cfHelper.loadContest(59);
		await cfHelper.selectProblem("A");

		const filePath = path.join(tempDir, 'A.cpp');
		const cppCode = `#include <bits/stdc++.h>
int main(){
  std::string s; std::cin>>s;
  int k=std::count_if(s.begin(),s.end(),[](char c){return 'a'<=c&&c<='z';});
  for(char &c:s) c = k>=s.size()-k ? tolower(c) : toupper(c);
  std::cout<<s;
}`;
		await writeFile(filePath, cppCode);
		const doc = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(doc, { preview: false });

		await cfHelper.compileAndRun();

		const problem = cfHelper.getCurrentProblem();
		assert.equal(problem.testCases.length, 3);
		for (const testCase of problem.testCases) {
			assert.equal(testCase.verdict, "OK");
		}
	});

	async function writeToActiveEditorAndSave(text: string) {
		const editor: vscode.TextEditor = vscode.window.activeTextEditor!;
		const fullRange = new vscode.Range(
			editor.document.positionAt(0),
			editor.document.positionAt(editor.document.getText().length)
		);
		await editor.edit(editBuilder => { editBuilder.replace(fullRange, text); });
		await editor.document.save();
	}

	test('Adds a test case', async () => {
		await cfHelper.loadContest(59);
		await cfHelper.selectProblem("A");

		cfHelper.addTestCase();
		await cfHelper.openTestCase(3, "input.txt");
		await writeToActiveEditorAndSave("foobAR");
		await cfHelper.openTestCase(3, "output.txt");
		await writeToActiveEditorAndSave("foobar");

		const problem = cfHelper.getCurrentProblem();
		assert.equal(problem.testCases.length, 4);
		assert.equal(problem.testCases[3].input, "foobAR");
		assert.equal(problem.testCases[3].expectedOutput, "foobar");
	});
});
