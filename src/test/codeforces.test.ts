import * as assert from 'assert';

import { CodeforcesClient, Contest } from '../cf_client';
import { TestCase } from '../runner';

suite('Codeforces client', function (this: Mocha.Suite) {
    this.timeout(5000);
    const client = new CodeforcesClient("/tmp/codeforcesHelper");

    test('Loads contest by id', async () => {
        const contest1: Contest = (await client.getContestById(1))!;
        assert.equal(contest1.name, "Codeforces Beta Round 1");
        assert.equal(contest1.problems.length, 3);
        assert.equal(contest1.getProblem("A")?.name, "Theatre Square");
        assert.equal(contest1.getProblem("B")?.name, "Spreadsheet");
        assert.equal(contest1.getProblem("C")?.name, "Ancient Berland Circus");

        const contest2195: Contest = (await client.getContestById(2195))!;
        assert.equal(contest2195.name, "Codeforces Round 1080 (Div. 3)");
        assert.equal(contest2195.problems.length, 8);
        assert.equal(contest2195.getProblem("A")?.name, "Sieve of Erato67henes");
        assert.equal(contest2195.getProblem("H")?.name, "Codeforces Heuristic Contest 001");
        assert.equal(contest2195.getProblem("I"), undefined);
    });

    test('Loads contest from contest page', async () => {
        const contest1: Contest = (await client.getContestById(2197))!;
        assert.equal(contest1.name, "Codeforces Round 1079 (Div. 2)");
        assert.equal(contest1.problems.length, 7);
        assert.equal(contest1.getProblem("A")?.name, "Friendly Numbers");
        assert.equal(contest1.getProblem("B")?.name, "Array and Permutation");
        assert.equal(contest1.getProblem("C")?.name, "Game with a Fraction");
        assert.equal(contest1.getProblem("D")?.name, "Another Problem about Beautiful Pairs");
        assert.equal(contest1.getProblem("E1")?.name, "Interactive Graph (Simple Version)");
        assert.equal(contest1.getProblem("E2")?.name, "Interactive Graph (Hard Version)");
        assert.equal(contest1.getProblem("F")?.name, "Double Bracket Sequence");
    });

    async function loadSampleTestCases(contestId: number, problemIndex: string) : Promise<TestCase[]> {
        const contest = await client.getContestById(contestId);
        const problem = contest!.getProblem(problemIndex);
        return await problem!.getTestCases();
    }

    test('Loads test cases for problem 1A', async () => {
        const testCases = await loadSampleTestCases(1, "A");
        assert.equal(testCases.length, 1);
        assert.equal(testCases[0].input, "6 6 4\n");
        assert.equal(testCases[0].expectedOutput, "4\n");
    });


    test('Loads test cases for problem 1000B', async () => {
        const testCases = await loadSampleTestCases(1000, "B");
        assert.equal(testCases.length, 3);
        assert.equal(testCases[0].input, "3 10\n4 6 7\n");
        assert.equal(testCases[0].expectedOutput, "8\n");
        assert.equal(testCases[1].input, "2 12\n1 10\n");
        assert.equal(testCases[1].expectedOutput, "9\n");
        assert.equal(testCases[2].input, "2 7\n3 4\n");
        assert.equal(testCases[2].expectedOutput, "6\n");
    });

    test('Loads test cases for problem 1500D', async () => {
        const testCases = await loadSampleTestCases(1500, "D");
        assert.equal(testCases.length, 2);
        assert.equal(testCases[0].expectedOutput, "9\n4\n0\n");
        assert.equal(testCases[1].expectedOutput, "16\n9\n4\n0\n");
    });

    test('Loads test cases for problem 1900A', async () => {
        const testCases = await loadSampleTestCases(1900, "A");
        assert.equal(testCases.length, 1);
        assert.equal(testCases[0].input, "5\n3\n...\n7\n##....#\n7\n..#.#..\n4\n####\n10\n#...#..#.#\n");
        assert.equal(testCases[0].expectedOutput, "2\n2\n5\n0\n2\n");
    });


    test('Loads test cases for problem 2195A', async () => {
        const testCases = await loadSampleTestCases(2195, "A");
        assert.equal(testCases.length, 1);
        assert.equal(testCases[0].input, "2\n5\n1 7 6 7 67\n5\n1 3 5 7 8\n");
        assert.equal(testCases[0].expectedOutput, "YES\nNO\n");
    });
});
