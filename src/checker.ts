import { TestCase } from "./runner";
import { RunResult } from "./runner";


/** How correctness of the output is defined. */
export enum CheckerMode {
    None = "none",
    Strict = "Strictly the same",
    CompareTokens = "wcmp (tokens)",
    CompareDoubles4 = "rcmp4 (doubles, err=1e-4)",
    CompareDoubles6 = "rcmp6 (doubles, err=1e-6)",
    CompareDoubles9 = "rcmp9 (doubles, err=1e-9)",
}

/** Checks solution output against expected output. */
export class Checker {
    constructor(public readonly mode: CheckerMode) { }

    /** Checks run result against expected output. */
    public check(testCase: TestCase, result: RunResult): void {
        testCase.actualOutput = result.stdOut;
        if (result.timedOut) {
            testCase.actualOutput = "TL " + result.executionTimeMillis + "ms";
            testCase.verdict = "TL";
            return;
        }
        if (result.exitCode !== 0) {
            testCase.actualOutput = "RE " + result.exitCode;
            testCase.verdict = "RE";
            return;
        }
        if (!this.matchOutputs(testCase.actualOutput, testCase.expectedOutput)) {
            testCase.verdict = "WA";
            return;
        }
        testCase.verdict = "OK";
    }

    /** Splits both inputs into tokens by whitespace and compares that resulting lists are equal. */
    private matchOutputs(actualOutput: string, expectedOutput: string): boolean {
        switch (this.mode) {
            case CheckerMode.None:
                return true;
            case CheckerMode.Strict:
                return actualOutput === expectedOutput;
            case CheckerMode.CompareTokens:
                return Checker.matchOutputsAsTokens(actualOutput, expectedOutput);
            case CheckerMode.CompareDoubles4:
                return Checker.matchOutputsAsDoubles(actualOutput, expectedOutput, 1e-4);
            case CheckerMode.CompareDoubles6:
                return Checker.matchOutputsAsDoubles(actualOutput, expectedOutput, 1e-6);
            case CheckerMode.CompareDoubles9:
                return Checker.matchOutputsAsDoubles(actualOutput, expectedOutput, 1e-9);
        }

    }

    private static matchOutputsAsTokens(actualOutput: string, expectedOutput: string): boolean {
        const outputTokens = actualOutput.trim().split(/\s+/);
        const expectedTokens = expectedOutput.trim().split(/\s+/);
        if (outputTokens.length !== expectedTokens.length) { return false; }
        for (let i = 0; i < outputTokens.length; i++) {
            if (outputTokens[i] !== expectedTokens[i]) { return false; }
        }
        return true;
    }

    private static matchOutputsAsDoubles(actualOutput: string, expectedOutput: string, tolerance: number): boolean {
        const outputTokens = actualOutput.trim().split(/\s+/);
        const expectedTokens = expectedOutput.trim().split(/\s+/);
        if (outputTokens.length !== expectedTokens.length) { return false; }
        for (let i = 0; i < outputTokens.length; i++) {
            if (outputTokens[i] === expectedTokens[i]) { continue; }
            if (!Checker.doubleCompare(expectedTokens[i], outputTokens[i], tolerance)) {
                return false;
            }
        }
        return true;
    }
    /** Port of doubleCompare from https://github.com/MikeMirzayanov/testlib/blob/master/testlib.h. */
    private static doubleCompare(expectedStr: string, resultStr: string, maxDoubleError: number): boolean {
        const expected: number = parseFloat(expectedStr);
        const result: number = parseFloat(resultStr);

        if (isNaN(expected) || isNaN(result)) {
            return expectedStr === "NaN" && resultStr === "NaN";
        }
        if (!isFinite(expected)) {
            if (expected > 0) { return result > 0 && !isFinite(result); }
            else { return result < 0 && !isFinite(result); }
        }
        if (!isFinite(result)) {
            return false;
        }

        maxDoubleError += 1e-15;
        if (Math.abs(result - expected) <= maxDoubleError) {
            return true;
        }
        const minv = Math.min(expected * (1 - maxDoubleError), expected * (1 + maxDoubleError));
        const maxv = Math.max(expected * (1 - maxDoubleError), expected * (1 + maxDoubleError));
        return result >= minv && result <= maxv;
    }
}