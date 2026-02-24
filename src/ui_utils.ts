import * as vscode from 'vscode';

export function closeAllEditorsWithScheme(scheme: string) {
    const tabs = vscode.window.tabGroups.all
        .flatMap(group => group.tabs)
        .filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === scheme);
    for (const tab of tabs) {
        vscode.window.tabGroups.close(tab, /*preserveFocus=*/ true);
    }
}