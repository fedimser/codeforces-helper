const vscode = acquireVsCodeApi();

const divSelectContest = document.getElementById('divSelectContest');
const divProblemsList = document.getElementById('divProblemList');
const divTestCases = document.getElementById('divTestCases');
const inputContestId = document.getElementById('inputContestId');

/** Restore state. */
render(vscode.getState() ?? {});

/** UI event handlers. */
document.getElementById('btnLoadContest').addEventListener('click', () => {
    vscode.postMessage({ type: 'loadContest', data: inputContestId.value });
});
document.getElementById('btnLatest').addEventListener('click', () => {
    vscode.postMessage({ type: 'loadLatestContest' });
});

/** Handlers for messages passed from extension to this webview. */
window.addEventListener('message', event => {
    console.log("AAA event received: ", event)
    switch (event.data.type) {
        case "render":
            vscode.setState(event.data.data);
            render(event.data.data);
            break;
    }
});

/** Entry point to render this webview. */
function render(data) {
    if (!data.contest) {
        // Show "Select contest" view.
        divSelectContest.style.display = "block";
        divProblemsList.style.display = "none";
        divTestCases.style.display = "none";
        return;
    }
    renderContest(data.contest);
}

/** Displays problems list and test cases for selected problem. */
function renderContest(data) {
    divSelectContest.style.display = "none";
    divProblemsList.style.display = "block";
    divTestCases.style.display = "block";

    inputContestId.value = data.contestId;
    divProblemsList.innerHTML = data.contestName + "&nbsp;&nbsp;";

    // Link to hide current content info and show initial state ("Load contest") again.
    const aLoadAnother = document.createElement("a");
    aLoadAnother.textContent = "Load another..."
    aLoadAnother.href = "";
    divProblemsList.appendChild(aLoadAnother);
    aLoadAnother.addEventListener("click", (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'loadAnotherContest' });
    });

    const ul = document.createElement("ul");
    for (const problem of data.problems) {
        const li = document.createElement("li");
        const a1 = document.createElement("a");
        a1.textContent = problem.index + ". " + problem.name;
        a1.addEventListener("click", (event) => {
            event.preventDefault();
            vscode.postMessage({ type: 'selectProblem', data: problem.index });
        });
        a1.href = "";
        if (problem.index === data.selectedProblemIndex) {
            a1.style.fontWeight = "bold";
        }
        const a2 = document.createElement("a");
        a2.textContent = "stmt";
        a2.href = problem.statementUrl;
        a2.target = "_blank";
        li.appendChild(a1);
        li.appendChild(document.createTextNode(" ("));
        li.appendChild(a2);
        li.appendChild(document.createTextNode(")"));
        ul.appendChild(li);
    }

    divProblemsList.appendChild(ul);

    const aSubmit = document.createElement("a");
    aSubmit.textContent = "Submit!";
    aSubmit.href = "https://codeforces.com/contest/" + data.contestId + "/submit/" + data.selectedProblemIndex;
    aSubmit.addEventListener("click", (event) => {
        vscode.postMessage({ type: 'submit' });
    });
    aSubmit.title = "Submit solution (F6)";
    divProblemsList.appendChild(aSubmit);

    if (data.testCases.length == 0) {
        divTestCases.innerHTML = "Loading test cases...";
    } else {
        renderTestCases(data);
    }
}

function renderTestCases(data) {
    divTestCases.innerHTML = "";
    const table = document.createElement("table");
    table.innerHTML = "<tr><td>Input</td><td>Output</td><td>Expected</td></td>";

    for (tc of data.testCases) {
        const tr = document.createElement("tr");
        if (tc.verdict == "OK") {
            tr.classList.add("verdict-ok");
        } else if (tc.verdict) {
            tr.classList.add("verdict-fail");
        }
        tr.appendChild(makeCell(tc.input, tc.testCaseId, "input.txt"));
        tr.appendChild(makeCell(tc.actualOutput ?? "", tc.testCaseId, "actual.txt"));
        tr.appendChild(makeCell(tc.expectedOutput, tc.testCaseId, "output.txt"));
        table.appendChild(tr);
    }

    divTestCases.appendChild(table);

    if (data.showAddTestCase) {
        const btnAddTestCase = document.createElement("button");
        btnAddTestCase.textContent = "Add";
        btnAddTestCase.addEventListener("click", (event) => {
            vscode.postMessage({ type: 'addTestCase' });
        });
        btnAddTestCase.title = "Add test case"
        divTestCases.appendChild(btnAddTestCase);
    }

    if (data.showResetTestCase) {
        const btnResetTestCases = document.createElement("button");
        btnResetTestCases.textContent = "Reset";
        btnResetTestCases.addEventListener("click", (event) => {
            vscode.postMessage({ type: 'resetTestCases' });
        });
        btnResetTestCases.title = "Reload samples from problem statement";
        divTestCases.appendChild(btnResetTestCases);
    }

    // Checker mode slector.
    const selectCheckerMode = document.createElement('select');
    data.checkerModes.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = mode;
        selectCheckerMode.appendChild(option);
    });
    selectCheckerMode.value = data.selectedCheckerMode
    selectCheckerMode.addEventListener('change', (event) => {
        vscode.postMessage({ type: 'setCheckerMode', data: event.target.value });
    });
    const divChecker = document.createElement('div');
    console.log(data.checkerModes);
    const aRun = document.createElement('a');
    aRun.textContent = "Run!";
    aRun.addEventListener("click", (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'compileAndRun' });
    });
    aRun.href = "";
    aRun.title = "Run test cases (F5)";
    divChecker.innerText = "Checker:"
    divChecker.appendChild(selectCheckerMode);
    //divChecker.innerHTML += "&nbsp;";
    divChecker.appendChild(aRun);
    divTestCases.append(divChecker);
}

function makeCell(text, testCaseId, fileName) {
    const td = document.createElement("td");
    td.innerText = text;
    td.addEventListener("click", (event) => {
        event.preventDefault();
        vscode.postMessage({ type: 'openTestCase', data: { testCaseId: testCaseId, fileName: fileName } });
    });
    return td;
}