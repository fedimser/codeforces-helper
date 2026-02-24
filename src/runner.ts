import * as vscode from 'vscode';
import { spawn } from 'child_process';

import { LanguageConfig } from './language_config';

/** Test case for a problem. */
export interface TestCase {
    testCaseId: number,
    input: string,
    expectedOutput: string,
    actualOutput?: string,
    verdict?: string,
}

/** Results of running a program on single input. */
export interface RunResult {
    exitCode: number,
    executionTimeMillis: number, // Time it took to run program.
    stdOut: string,
    stdErr: string,
    timedOut: boolean,
}

export class Runner {
    /**
     * Executes given command, passing given input to it as standard input.
     * 
     * If execution took more than timeoutMillis, execution is aborted and result will have `timedOut=true`.
     * 
     * @param runCmd Command to execute.
     * @param input Text that should be piped to standard input.
     * @param timeoutMillis Maximum time to run program.
     */
    public static async runTestCase(
        runCmd: string,
        input: string,
        timeoutMillis: number
    ): Promise<RunResult> {
        const runArgs = runCmd.split(" ");
        const startTime = Date.now();
        const child = spawn(runArgs[0], runArgs.slice(1), {
            stdio: ['pipe', 'pipe', 'pipe']  // in, out, err.
        });

        let stdOut = '';
        let stdErr = '';
        let timedOut = false;
        let finished = false;

        // Collect stdin and stdout.
        child.stdout.on('data', (data) => { stdOut += data.toString(); });
        child.stderr.on('data', (data) => { stdErr += data.toString(); });

        // Send input to stdin.
        child.stdin.write(input);
        child.stdin.end();

        // Send SIGTERM if the child process runs longer than timeoutMillis.
        const timeoutHandle = setTimeout(() => {
            if (!finished) {
                timedOut = true;
                child.kill();
            }
        }, timeoutMillis);

        return new Promise<RunResult>((resolve) => {
            child.on('close', (code) => {
                finished = true;
                clearTimeout(timeoutHandle);
                resolve({
                    exitCode: code ?? -1,
                    executionTimeMillis: Date.now() - startTime,
                    stdOut,
                    stdErr,
                    timedOut
                });
            });

            child.on('error', (err) => {
                finished = true;
                clearTimeout(timeoutHandle);
                resolve({
                    exitCode: -1,
                    executionTimeMillis: Date.now() - startTime,
                    stdOut,
                    stdErr: stdErr + '\n' + err.message,
                    timedOut
                });
            });
        });
    }

    public static async compile(srcPath: string, outPath: string, config: LanguageConfig): Promise<number | undefined> {
        const cmdLine = config.compileCommand!.replace("$src", srcPath).replace("$out", outPath);
        const task = new vscode.Task(
            { type: 'compile' },
            vscode.TaskScope.Global,
            'Compile ' + config.name,
            'codeforces-helper',
            new vscode.ShellExecution(cmdLine),
        );

        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Shared,
            clear: true
        };

        const execution = await vscode.tasks.executeTask(task);

        return new Promise(resolve => {
            const disposable = vscode.tasks.onDidEndTaskProcess(e => {
                if (e.execution === execution) {
                    disposable.dispose();
                    resolve(e.exitCode);
                }
            });
        });
    }
}