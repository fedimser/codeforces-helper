import assert from "assert";
import * as vscode from 'vscode';

import { Runner, TestCase } from "./runner";
import { CodeforcesHelper } from "./cf_helper";

/** Fake filesystem to display in-memory test cases. */
export class TestCasesFileSystem implements vscode.FileSystemProvider, vscode.TextDocumentContentProvider {
    constructor(public readonly cfHelper: CodeforcesHelper) { }

    // Retuns corresponding test case and file name.
    private parseUri(uri: vscode.Uri): [TestCase, string] {
        const parts = uri.path.split('/');
        assert(parts.length === 4, `Invalid URI format: ${uri.toString()}`);
        const problemIndex = parts[1];
        const testCaseId = Number(parts[2]);
        const tc: TestCase | undefined = this.cfHelper.contest?.getProblem(problemIndex)?.testCases[testCaseId];
        if (!tc) {
            throw vscode.FileSystemError.FileNotFound(uri.toString());
        }
        return [tc, parts[3]];
    }

    private getText(uri: vscode.Uri): string {
        const [tc, fileName] = this.parseUri(uri);
        if (fileName === "input.txt") {
            return tc.input;
        } else if (fileName === "output.txt") {
            return tc.expectedOutput;
        } else if (fileName === "actual.txt") {
            return tc.actualOutput ?? "";
        }
        throw vscode.FileSystemError.FileNotFound(uri.toString());
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: this.getText(uri).length
        };
    }

    readFile(uri: vscode.Uri): Uint8Array {
        return new TextEncoder().encode(this.getText(uri));
    }

    writeFile(uri: vscode.Uri, content: Uint8Array): void {
        const [tc, fileName] = this.parseUri(uri);
        const text: string = new TextDecoder().decode(content);
        if (fileName === "input.txt") {
            tc.input = text;
        } else if (fileName === "output.txt") {
            tc.expectedOutput = text;
        } else if (fileName === "actual.txt") {
            throw vscode.FileSystemError.NoPermissions("Cannot write.");
        } else {
            throw vscode.FileSystemError.FileNotFound(uri.toString());
        }
        tc.actualOutput = "";
        tc.verdict = undefined;
        this.cfHelper.onTestCaseUpdated();
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.getText(uri);
    }

    // Stubs.
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
    readDirectory(): [string, vscode.FileType][] { return []; }
    createDirectory(): void { }
    delete(): void { }
    rename(): void { }
    watch(): vscode.Disposable { return new vscode.Disposable(() => { }); }
}
