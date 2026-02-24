import * as assert from 'assert';

import { Checker, CheckerMode } from '../checker';
import { TestCase, RunResult } from '../runner';

suite('Checker', function (this: Mocha.Suite) {
    test('Sets verdicts', () => {
        const checker = new Checker(CheckerMode.CompareTokens);
        const testCase: TestCase = { testCaseId: 0, input: "foo", expectedOutput: "bar" };
        const runResult: RunResult = { exitCode: 0, executionTimeMillis: 100, stdOut: "bar", stdErr: "", timedOut: false };

        checker.check(testCase, runResult);
        assert.equal(testCase.verdict, "OK");

        checker.check(testCase, { ...runResult, timedOut: true });
        assert.equal(testCase.actualOutput, "TL 100ms");
        assert.equal(testCase.verdict, "TL");

        checker.check(testCase, { ...runResult, exitCode: 11 });
        assert.equal(testCase.actualOutput, "RE 11");
        assert.equal(testCase.verdict, "RE");

        checker.check(testCase, { ...runResult, stdOut: "barbar" });
        assert.equal(testCase.actualOutput, "barbar");
        assert.equal(testCase.verdict, "WA");
    });

    function runChecker(checker: Checker, expectedOutput: string, actualOutput: string): string {
        const testCase: TestCase = { testCaseId: 0, input: "", expectedOutput: expectedOutput };
        const runResult: RunResult = { exitCode: 0, executionTimeMillis: 100, stdOut: actualOutput, stdErr: "", timedOut: false };
        checker.check(testCase, runResult);
        return testCase.verdict!;
    }

    test('Strict mode', async () => {
        const checker = new Checker(CheckerMode.Strict);
        assert.equal(runChecker(checker, "foo", "foo"), "OK");
        assert.equal(runChecker(checker, "foo", "foo "), "WA");
    });

    test('Comparing tokens', async () => {
        const checker = new Checker(CheckerMode.CompareTokens);
        assert.equal(runChecker(checker, "foo", "foo"), "OK");
        assert.equal(runChecker(checker, "foo", "foo "), "OK");
        assert.equal(runChecker(checker, "foo", "bar"), "WA");
    });

    test('No checker', async () => {
        const checker = new Checker(CheckerMode.None);
        assert.equal(runChecker(checker, "foo", "bar"), "OK");
    });

    test('Double checker', async () => {
        const checker = new Checker(CheckerMode.CompareDoubles4);
        assert.equal(runChecker(checker, "10", "10"), "OK");
        assert.equal(runChecker(checker, "10", "10.0"), "OK");
        assert.equal(runChecker(checker, "10", "10.0009"), "OK");
        assert.equal(runChecker(checker, "10", "10.001"), "OK"); 
        assert.equal(runChecker(checker, "10", "10.0011"), "WA");  // Absolute error 1.1e-3, relative error 1.1e-4.
        assert.equal(runChecker(checker, "10", "9.999"), "OK");
        assert.equal(runChecker(checker, "10", "9.9989"), "WA");

        assert.equal(runChecker(checker, "0.1", "0.1"), "OK");
        assert.equal(runChecker(checker, "0.1", "1e-1"), "OK");
        assert.equal(runChecker(checker, "0.1", "0.10010"), "OK");
        assert.equal(runChecker(checker, "0.1", "0.10011"), "WA");  // Absolute error 1.1e-4, relative error 1.1e-3.

        assert.equal(runChecker(checker, "foo", "foo"), "OK");
        assert.equal(runChecker(checker, "foo", "bar"), "WA");        
    });


});
