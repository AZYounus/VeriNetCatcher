import * as vscode from 'vscode';
import verilogParser from './verilogParser';
import { ImplicitNetError } from './verilogParser';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {
	diagnosticCollection = vscode.languages.createDiagnosticCollection('verilog');
	ctx.subscriptions.push(diagnosticCollection);
		vscode.workspace.onDidOpenTextDocument(doc => {
		if (doc.languageId === 'verilog') onChange(doc.fileName);
	}, null, ctx.subscriptions);

	vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.languageId === 'verilog') onChange(e.document.fileName);
	}, null, ctx.subscriptions);
}

function onChange(file: string) {
	diagnosticCollection.clear();
	let implicitNetErrors: ImplicitNetError[] = verilogParser(file);
	let diagnostics: vscode.Diagnostic[] = [];
	implicitNetErrors.forEach(error => {
		const range = new vscode.Range(new vscode.Position(error.line - 1, error.startCol - 1), new vscode.Position(error.line - 1, error.endCol - 1));
		const diagnostic = new vscode.Diagnostic(range, `Implicit net "${error.name}" detected.`, vscode.DiagnosticSeverity.Error);
		diagnostics.push(diagnostic);
	});
	diagnosticCollection.set(vscode.Uri.file(file), diagnostics);
}

// This method is called when your extension is deactivated
export function deactivate() {}
