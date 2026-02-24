import * as assert from 'assert';

import { Runner } from '../runner';

import { mkdtemp, writeFile, rm } from "fs/promises";
import * as os from "os";
import * as path from "path" ;

suite('Runner', function (this: Mocha.Suite) {
    let tempDir: string;
    let pythonFilePath: string;

    this.beforeAll(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "runner-test"));
        pythonFilePath = path.join(tempDir, "code.py");
    });

    this.afterAll(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    test('Runs Python script', async () => {
        await writeFile(pythonFilePath, "print(int(input())**2)");
        const result = await Runner.runTestCase(`python3 ${pythonFilePath}`, "32", 100);
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdOut, "1024\n");
        assert.equal(result.timedOut, false);
    });

    test('Extracts exit code', async () => {
        await writeFile(pythonFilePath, "exit(5)");
        const result = await Runner.runTestCase(`python3 ${pythonFilePath}`, "", 100);
        assert.equal(result.exitCode, 5); 
    });
});
