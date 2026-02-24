import * as vscode from 'vscode';
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from 'path';

import { CodeforcesClient, Contest, Problem } from "./cf_client";
import { Runner, TestCase } from "./runner";
import { LanguageConfig } from "./language_config";
import { Checker, CheckerMode } from "./checker";
import { closeAllEditorsWithScheme } from "./ui_utils";

// Data sent from extension to WebView.
interface ViewProblem { index: string, name: string, statementUrl: string }
interface ViewContest {
	contestId: number,
	contestName: string,
	problems: ViewProblem[],
	selectedProblemIndex: string,
	testCases: TestCase[],
	showAddTestCase: boolean,
	showResetTestCase: boolean,
	checkerModes: string[],
	selectedCheckerMode: string,
}

export class CodeforcesHelper implements vscode.WebviewViewProvider {
	private cfClient: CodeforcesClient;
	public config: vscode.WorkspaceConfiguration;
	public contest: Contest | undefined;
	private checker: Checker = new Checker(CheckerMode.CompareTokens);
	private view: vscode.WebviewView | undefined;
	private output: vscode.OutputChannel;
	private selectedProblemIndex: string = "A";
	private isRunning: boolean = false;

	constructor(
		private readonly context: vscode.ExtensionContext
	) {
		// Load configs.
		this.config = vscode.workspace.getConfiguration('codeforcesHelper');

		// Initialize file storage.
		const cacheFolder = context.globalStorageUri.fsPath;
		if (!fs.existsSync(cacheFolder)) {
			fs.mkdirSync(cacheFolder, { recursive: true });
		}
		this.cfClient = new CodeforcesClient(cacheFolder);

		// Initialize output stream.
		this.output = vscode.window.createOutputChannel("Codeforces");
	}

	async compileAndRun() {
		if (this.isRunning) {
			vscode.window.showWarningMessage("Need to wait until current run finishes.");
			return;
		}

		this.output.clear();
		this.output.show(true);
		// AAAAA vscode.window.showInformationMessage(`You clicked Compile And Run.`);
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("No file selected.");
			return;
		}
		const srcPath: string = editor.document.uri.fsPath;

		const problem = this.contest?.getProblem(this.selectedProblemIndex);
		if (!problem) {
			this.output.appendLine("No problem selected.");
			return;
		}

		problem.solutionFile = srcPath;
		problem.clearOutputs();
		this.renderView();

		// Determine language config from extension.
		const extension = srcPath.substring((srcPath.lastIndexOf(".") ?? -1) + 1);
		const languageConfigs = this.config.get<LanguageConfig[]>("languageConfigs", []);
		var langConfig = languageConfigs.find(conf => conf.extension === extension);
		if (!langConfig) {
			this.output.appendLine(`Unsupported file extension: ${extension}.`);
			return;
		}

		this.isRunning = true;

		// Compile.
		const outPath = srcPath + "_exe";
		if (langConfig.compileCommand) {
			this.output.appendLine("Compiling: " + srcPath);
			const exitCode = await Runner.compile(srcPath, outPath, langConfig);
			if (!(exitCode === 0)) {
				this.isRunning = false;
				return;
			}
			this.output.appendLine(`Compilation successful.`);
		}
		this.output.show(true);

		// Run test cases.
		this.output.appendLine(`Running ${problem.testCases.length} test cases...`);
		const runCmd = langConfig.runCommand.replace("$src", srcPath).replace("$out", outPath);
		const timeoutMs = this.config.get<number>("runTimeoutMs", 2000);
		const output = this.output;
		const runTestCase = async (testCase: TestCase) => {
			const runResult = await Runner.runTestCase(runCmd, testCase.input, timeoutMs);
			this.checker.check(testCase, runResult);
			const verdict: string = testCase.verdict!;
			output.appendLine(`Test case ${testCase.testCaseId}: ${verdict}.`);
			if (verdict === "RE") {
				output.appendLine(runResult.stdErr);
			}
		};
		await Promise.all(problem.testCases.map(runTestCase));

		// Clean up the executable file(s).
		await fsp.rm(outPath, { recursive: true, force: true });

		if (problem.testCases.every(tc => tc.verdict === "OK")) {
			this.output.appendLine("ALL TESTS PASSED!");
		}
		this.isRunning = false;
		this.renderView();
	}

	resolveWebviewView(
		_view: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this.view = _view;
		_view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
		};

		_view.webview.html = this.getHtml(_view.webview);
		this.renderView();

		_view.webview.onDidReceiveMessage(message => {
			switch (message.type) {
				case "loadContest":
					this.loadContest(Number(message.data));
					break;
				case "loadLatestContest":
					this.loadLatestContest();
					break;
				case "loadAnotherContest":
					this.contest = undefined;
					this.renderView();
					break;
				case "selectProblem":
					this.selectProblem(message.data);
					break;
				case "submit":
					this.submit(false);
					break;
				case "openTestCase":
					this.openTestCase(message.data["testCaseId"], message.data["fileName"]);
					break;
				case "addTestCase":
					this.addTestCase();
					break;
				case "resetTestCases":
					this.resetTestCases();
					break;
				case "setCheckerMode":
					this.setCheckerMode(message.data);
					break;
				case "compileAndRun":
					this.compileAndRun();
					break;
				default:
					throw new Error("Received unknown message");
			}

		});
	}

	async loadContest(contestId: number): Promise<void> {
		closeAllEditorsWithScheme("tcfs");
		const contest: Contest | undefined = await this.cfClient.getContestById(contestId);
		if (contest === undefined) {
			vscode.window.showErrorMessage(`No such contest ${contestId}`);
			return;
		}
		this.contest = contest;
		this.selectProblem(contest.problems[0].index);
	}

	private async loadLatestContest(): Promise<void> {
		const contestId = await this.cfClient.getLatestContestId();
		await this.loadContest(contestId);
	}

	getCurrentProblem(): Problem {
		return this.contest!.getProblem(this.selectedProblemIndex)!;
	}


	async selectProblem(problemIndex: string): Promise<void> {
		closeAllEditorsWithScheme("tcfs");
		this.selectedProblemIndex = problemIndex;
		const problem = this.getCurrentProblem();
		if (problem.testCases.length === 0) {
			this.renderView();
		}
		await this.maybeShowAssociatedSource(problem);
		await problem.getTestCases();
		problem.clearOutputs();
		this.renderView();
	}

	// When problem is selected, show associated source file.
	// File becomes associated with problem when user runs "Compile and Run" when both file
	// and problem are active.
	private async maybeShowAssociatedSource(problem: Problem) {
		if (!problem.solutionFile) {
			await this.maybeInitializeAssociatedSource(problem);
		}
		const currentlyActiveFile = vscode.window.activeTextEditor?.document.fileName;
		if (problem.solutionFile && problem.solutionFile !== currentlyActiveFile) {
			const document = await vscode.workspace.openTextDocument(problem.solutionFile);
			await vscode.window.showTextDocument(document, {
				preview: false,
				viewColumn: vscode.ViewColumn.One,
			});
		}
	}

	// If configured and are in worskpace, associate problem with a file using given pattern.
	// If that file does not exist and template is defined, initialize it from template.
	private async maybeInitializeAssociatedSource(problem: Problem): Promise<void> {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return;
		}
		const pattern: string = this.config.get<string>("newProblemPattern", "");
		if (!pattern) {
			return;
		}
		const fileName = path.join(folder.uri.fsPath, pattern.replace("$problemIndex", problem.index));
		if (!fs.existsSync(fileName)) {
			const templatePath = this.config.get<string>("newProblemTemplatePath", "");
			if (templatePath && fs.existsSync(templatePath)) {
				await fsp.copyFile(templatePath, fileName);
			}
		}
		problem.solutionFile = fileName;
	}

	private renderView() {
		if (!this.view) {
			return;
		}
		const view = this.view;

		if (!this.contest) {
			view.webview.postMessage({ "type": "render", "data": {} });
			return;
		}
		const problem = this.getCurrentProblem();
		const viewContest: ViewContest = {
			contestId: this.contest!.contestId,
			contestName: this.contest!.name,
			problems: this.contest!.problems.map(p => ({
				index: p.index, name: p.name, statementUrl: p.statementUrl
			})),
			selectedProblemIndex: this.selectedProblemIndex,
			testCases: problem.testCases,
			showAddTestCase: true,
			showResetTestCase: problem.testCasesEdited,
			checkerModes: Object.entries(CheckerMode).map(x => x[1]),
			selectedCheckerMode: this.checker.mode,
		};
		view.webview.postMessage({ "type": "render", "data": { contest: viewContest } });
	}

	private getHtml(webview: vscode.Webview): string {
		const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "problems.html");
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "problems.js"));
		var html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		html = html.replace("problems.js", scriptUri.toString());
		return html;
	}

	public async submit(openUrl: boolean) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) { return; }

		const text = editor.document.getText();
		vscode.env.clipboard.writeText(text).then(() => {
			vscode.window.showInformationMessage("Editor content copied to clipboard!");
		}, (err) => {
			vscode.window.showErrorMessage("Failed to copy to clipboard: " + err);
		});
		if (openUrl) {
			const url = `https://codeforces.com/contest/${this.contest!.contestId}/submit/${this.selectedProblemIndex}`;
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	}

	// Opens content of a test case as a file.
	// When user saves that file, it will update the test case.
	public async openTestCase(testCaseId: number, fileName: string) {
		var uri = `tcfs:/${this.selectedProblemIndex}/${testCaseId}/${fileName}`;
		if (fileName === "actual.txt") {
			uri = "readonly:" + uri;
		}
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
		await vscode.window.showTextDocument(doc, { preview: true });
	}

	// Adds a new empty test case.
	public async addTestCase() {
		this.getCurrentProblem().addTestCase();
		this.renderView();
	}

	// Resets test cases to sample test cases.
	public async resetTestCases() {
		closeAllEditorsWithScheme("tcfs");
		await this.getCurrentProblem().resetTestCases();
		this.renderView();
	}

	public onTestCaseUpdated() {
		this.getCurrentProblem().testCasesEdited = true;
		this.renderView();
	}

	// Switch to different problem in extension panel if user opened source associated with it.
	public onActiveEditorChanged() {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !this.contest) {
			return;
		}
		const newlyOpenedFile = editor.document.fileName;
		const problems = this.contest.problems.filter(p => p.solutionFile === newlyOpenedFile);
		if (problems.length === 0) {
			return;
		}
		if (problems.find(p => p.index === this.selectedProblemIndex)) {
			return;
		}
		this.selectProblem(problems[0].index);
	}

	public setCheckerMode(mode: CheckerMode) {
		this.checker = new Checker(mode);
		this.output.appendLine(`Using checker: ${this.checker.mode}`);
		this.getCurrentProblem().clearOutputs();
		this.renderView();
	}
}