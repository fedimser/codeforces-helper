import assert from "assert";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as fsAsync from "fs/promises";
import * as path from "path";
import { chromium } from "playwright";

import { extractPreContent } from "./html_utils";
import { TestCase } from "./runner";


/** API Object definitions. */
interface CfApiProblemsResponse { problems: CfApiProblem[] }
interface CfApiContest { id: number, name: string }
export interface CfApiProblem { contestId: number, index: string, name: string }

export class Problem {
	public readonly contestId: number;
	public readonly index: string;
	public readonly name: string;
	public readonly statementUrl: string;
	public testCases: TestCase[];
	private testCasesLoaded: boolean;
	public testCasesEdited: boolean;
	public solutionFile: string | undefined = undefined;

	constructor(public readonly client: CodeforcesClient, apiProblem: CfApiProblem) {
		this.contestId = apiProblem.contestId;
		this.index = apiProblem.index;
		this.name = apiProblem.name;
		this.statementUrl = `https://codeforces.com/contest/${this.contestId}/problem/${this.index}`;
		this.testCases = [];
		this.testCasesLoaded = false;
		this.testCasesEdited = false;
	}

	/** Loads test cases for this problem (if not loaded already). */
	public async getTestCases(): Promise<TestCase[]> {
		if (this.testCasesLoaded) {
			return this.testCases;
		}
		this.testCases = await this.client.getSampleTestCases(this);
		this.testCasesLoaded = true;
		return this.testCases;
	}

	/** Resets test cases to sample. */
	public async resetTestCases(): Promise<void> {
		this.testCasesLoaded = false;
		await this.getTestCases();
		this.testCasesEdited = false;
	}

	public addTestCase() {
		const newTestCase: TestCase = { testCaseId: this.testCases.length, input: "...", expectedOutput: "" };
		this.testCases.push(newTestCase);
		this.testCasesEdited = true;
	}

	public clearOutputs(): void {
		for (const tc of this.testCases) {
			tc.actualOutput = undefined;
			tc.verdict = undefined;
		}
	}
}

/** Codeforces contest. */
export class Contest {
	constructor(
		public readonly contestId: number,
		public readonly name: string,
		public readonly problems: Problem[]
	) { }

	public getProblem(index: string): Problem | undefined {
		return this.problems.find(p => p.index === index);
	}
}

/** Encapsulates interaction with Codeforces (via official API or browser). */
export class CodeforcesClient {
	private contestsIndex: Map<number, Contest>;

	constructor(
		public readonly cacheFolder: string
	) {
		this.contestsIndex = new Map<number, Contest>();
		this.rebuildIndex();
	}

	/** Loads contest by id. */
	public async getContestById(contestId: number): Promise<Contest | undefined> {
		if (this.contestsIndex.size === 0) { await this.rebuildIndex(); }
		if (!this.contestsIndex.has(contestId)) { await this.rebuildIndex(/*invalidateCache=*/ true); }
		var contest = this.contestsIndex.get(contestId);
		if (contest && contest.problems.length <= 3 && contest.name.includes("(Div. 2)")) {
			// This contest is missing problems because they are mapped to Div 1 contest.
			contest = await this.loadCorrectProblemList(contest);
		}
		return contest;
	}

	public async getLatestContestId(): Promise<number> {
		if (this.contestsIndex.size === 0) { await this.rebuildIndex(); }
		return Math.max(...this.contestsIndex.keys());
	}

	/** Loads sample test cases from problem page. */
	public async getSampleTestCases(problem: Problem): Promise<TestCase[]> {
		const problemHtml = await this.loadHtmlWithCache(problem.statementUrl);
		const $ = cheerio.load(problemHtml);
		const sampleTestsDiv = $("div.sample-tests").first();

		const inputDivs = sampleTestsDiv.find("div.input");
		const outputDivs = sampleTestsDiv.find("div.output");
		const testsNum = inputDivs.length;
		if (testsNum === 0) {
			this.removeCachedHtml(problem.statementUrl);
			throw Error("Could not load problem statement.");
		}
		assert(testsNum === outputDivs.length, "Different length of inputs and outputs.");

		const testCases: TestCase[] = [];
		for (var i = 0; i < testsNum; ++i) {
			const input = extractPreContent($, inputDivs.eq(i).find("pre"));
			const output = extractPreContent($, outputDivs.eq(i).find("pre"));
			const testCase: TestCase = { testCaseId: i, input: input, expectedOutput: output };
			testCases.push(testCase);
		}
		return testCases;
	}

	/** Rebuilds index mapping all contests to problems. */
	private async rebuildIndex(invalidateCache: boolean = false): Promise<void> {
		const [apiContests, apiProblems] = await Promise.all([
			this.callApiWithCache("contest.list", invalidateCache = invalidateCache),
			this.callApiWithCache("problemset.problems", invalidateCache = invalidateCache),
		]);
		const contestToProblems = new Map<number, Problem[]>();
		const apiProblemsArray = (apiProblems as CfApiProblemsResponse).problems as CfApiProblem[];
		for (const apiProblem of apiProblemsArray) {
			const arr: Problem[] = contestToProblems.get(apiProblem.contestId) ?? [];
			arr.push(new Problem(this, apiProblem));
			contestToProblems.set(apiProblem.contestId, arr);
		}

		this.contestsIndex = new Map<number, Contest>();
		const apiContestsArray = apiContests as CfApiContest[];
		for (const apiContest of apiContestsArray) {
			const problems: Problem[] = contestToProblems.get(apiContest.id) ?? [];
			problems.sort((a, b) => a.index.localeCompare(b.index));
			if (problems.length === 0) {
				// Contest with no problems. Don't add it to index.
				continue;
			}
			const contest = new Contest(apiContest.id, apiContest.name, problems);
			this.contestsIndex.set(apiContest.id, contest);
		}
	}

	/** Calls official Codeforces API, with cache. */
	private async callApiWithCache(methodName: string, invalidateCache: boolean = false): Promise<object> {
		const cacheDir = path.join(this.cacheFolder, "apiCache");
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}
		const filePath = path.join(cacheDir, methodName + ".json");
		if (!fs.existsSync(filePath) || invalidateCache) {
			const result = await CodeforcesClient.callApi(methodName);
			await fsAsync.writeFile(filePath, JSON.stringify(result));
			return result;
		} else {
			const text = await fsAsync.readFile(filePath, "utf-8");
			return JSON.parse(text);
		}
	}

	/** Calls official Codeforces API. */
	private static async callApi(methodName: string): Promise<object> {
		const url = "https://codeforces.com/api/" + methodName;
		const response: Response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const responseObject: object = await response.json() as object;
		if ("status" in responseObject && responseObject["status"] === "OK" && "result" in responseObject) {
			return responseObject["result"] as object;
		} else if ("status" in responseObject && responseObject["status"] === "FAILED" && "comment" in responseObject) {
			throw new Error("Codeforces API returned error: " + responseObject["comment"]);
		} else {
			throw new Error("Codeforces API returned malformed response: " + JSON.stringify(response));
		}
	}

	/** Loads HTML page, with cache. */
	private async loadHtmlWithCache(url: string) {
		const cacheDir = path.join(this.cacheFolder, "htmlCache");
		if (!fs.existsSync(cacheDir)) {
			fs.mkdirSync(cacheDir, { recursive: true });
		}
		const filePath = path.join(cacheDir, url.replace(/[:/.]/g, '_') + ".html");
		if (!fs.existsSync(filePath)) {
			const html = await CodeforcesClient.loadHtml(url);
			await fsAsync.writeFile(filePath, html);
			return html;
		} else {
			return await fsAsync.readFile(filePath, "utf-8");
		}
	}

	private removeCachedHtml(url: string) {
		const filePath = path.join(this.cacheFolder, "htmlCache", url.replace(/[:/.]/g, '_') + ".html");
		fs.unlinkSync(filePath);
	}

	/** Loads HTML page by opening it in browser. */
	private static async loadHtml(url: string): Promise<string> {
		const browser = await chromium.launch({ headless: false });
		const page = await browser.newPage();
		await page.goto(url, { waitUntil: "networkidle" });
		const html: string = await page.content();
		await browser.close();
		return html;
	}

	/** Gets problem list for those contests whose full list of problems is not available via API. */
	private async loadCorrectProblemList(contest: Contest): Promise<Contest> {
		const contestUrl = `https://codeforces.com/contest/${contest.contestId}`;
		const contestHtml = await this.loadHtmlWithCache(contestUrl);
		const $ = cheerio.load(contestHtml);
		const problemsTable = $('table.problems');
		const links = problemsTable.find("a");
		const problems: Problem[] = [];
		for (var i = 0; i < links.length; i++) {
			const link = links.eq(i);
			const href = $(link).attr("href") ?? "";
			if (!href.includes("/problem/")) { continue; }
			const index = href.substring(href.lastIndexOf('/') + 1);
			const name = $(link).text().trim();
			if (name === index) {
				// This link is from the first column, where text is the index.
				continue;
			}
			problems.push(new Problem(this, { contestId: contest.contestId, name: name, index: index }));
		}
		return new Contest(contest.contestId, contest.name, problems);
	}
}