import * as vscode from 'vscode';
import { CodeBlock } from './code-block';
import { LoggerType } from './logger-type';

const COMMAND = 'code-actions-sample.command';

/**
 * Provides code actions for formatting logger.
 */
export class Formatter implements vscode.CodeActionProvider {

    private threshold = 20;

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
        const codeBlock = this.getLineOfCode(document, range);
        if (!this.isLogger(codeBlock.code)) {
            return;
        }
        const loggerType = this.getLoggerType(document, codeBlock.code);
        if (loggerType === undefined) {
            return;
        }

        let actions: vscode.CodeAction[] = [];

        if (loggerType === LoggerType.default) {
            // Check if logger is already formatted.
            if (/{\d+.*?}/i.test(codeBlock.code)) { return; }
            let fix = this.defaultLoggerFix(document, codeBlock);
            if (fix) {
                actions.push(fix);
            }
        }

        return actions;
    }

    private getLineOfCode(document: vscode.TextDocument, range: vscode.Range): CodeBlock {
        let result = '';
        let startLine = range.start.line;
        let currentLine = startLine - 1;
        let start = startLine;
        while (currentLine >= 0) {
            const text = document.lineAt(currentLine).text.trim();
            // only support statement like "if|while|for|else if|... () {", 
            if (text.includes(';') || /\) *{$/i.test(text) || text.includes('{') || text.includes('}')) { break; }
            if (text !== '') { start = currentLine; }
            result = text + result;
            currentLine--;
        }

        currentLine = startLine;
        while (document.lineCount > currentLine) {
            const text = document.lineAt(currentLine).text.trim();
            result = result + text;
            currentLine++;
            if (result.length === 0 || result.includes(';')) { break; }
        }
        const end = currentLine - 1;
        return { code: result, start, end };
    }

    /**
     * Java variable names can start with a letter or underscore or a dollar sign.
     * number can be in the middle or at the end of the name.
     */
    private isLogger(text: string): boolean {
        const logLevels = ['log', 'debug', 'error', 'fatal', 'info', 'trace', 'warn', 'severe', 'warning', 'config', 'fine', 'finer', 'finest'];
        const regexString = `^([a-zA-Z_$]+[a-zA-Z_$0-9]*)+\\.(${logLevels.map(x => '(' + x + ')').join('|')})\\(.+?;$`;
        const regex = new RegExp(regexString, 'i');
        return regex.test(text.trim());
    }

    private getLoggerType(document: vscode.TextDocument, text: string): LoggerType | undefined {
        let variableName = text.split('.')[0].trim();
        let typeImported = undefined;
        let i = 0;
        for (; i < document.lineCount; i++) {
            const line = document.lineAt(i).text.trim().replace('  ', ' ');
            if (line.includes('{')) { break; }
            switch (line) {
                case 'import java.util.logging.Logger;':
                    typeImported = LoggerType.default;
                    break;

                case 'import org.apache.logging.log4j.Logger;':
                    typeImported = LoggerType.log4j;
                    break;

                default:
                    break;
            }
        }
        for (; i < document.lineCount; i++) {
            const line = document.lineAt(i).text.trim().replace('  ', ' ');
            if (line.includes(`java.util.logging.Logger ${variableName}`)) {
                return LoggerType.default;
            }
            if (line.includes(`org.apache.logging.log4j.Logger ${variableName}`)) {
                return LoggerType.log4j;
            }
            if (line.includes(`Logger ${variableName}`)) {
                return typeImported;
            }
        }
        return typeImported;
    }

    private defaultLoggerFix(document: vscode.TextDocument, codeBlock: CodeBlock): vscode.CodeAction | undefined {
        const fix = new vscode.CodeAction(`Format using arguments`, vscode.CodeActionKind.QuickFix);
        fix.edit = new vscode.WorkspaceEdit();
        const startPosition: vscode.Position = new vscode.Position(codeBlock.start, this.getStartIndexVariable(document, codeBlock));

        const indexSemiColon = document.lineAt(codeBlock.end).text.indexOf(';') + 1;
        const endPosition: vscode.Position = new vscode.Position(codeBlock.end, indexSemiColon);

        const logLevel = codeBlock.code.substring(codeBlock.code.indexOf('.') + 1, codeBlock.code.indexOf('('));
        let replacement: string;
        let message: string;
        if (logLevel === 'log') {
            // codeBlock.code could be this logger.log(Level.SEVERE, "a" + b);
            replacement = codeBlock.code.substring(0, codeBlock.code.indexOf(','));
            message = codeBlock.code.substring(codeBlock.code.indexOf(',') + 1, codeBlock.code.lastIndexOf(')'));
        } else {
            // codeBlock.code could be this logger.severe("a" + b);
            let variableName = codeBlock.code.substring(0, codeBlock.code.indexOf('.'));
            replacement = `${variableName}.log(Level.${logLevel.toUpperCase()}`;
            message = codeBlock.code.substring(codeBlock.code.indexOf('(') + 1, codeBlock.code.lastIndexOf(')'));
        }
        message = message.trim();
        const messageParams = this.standardizeMessage(message);
        let params = '';
        if (messageParams.params.length === 1) {
            params = messageParams.params[0];
        } else {
            params = `new Object[] {${messageParams.params.join(', ')}}`;
        }
        replacement += `, ${messageParams.message}, ${params});`;


        fix.edit.replace(document.uri, new vscode.Range(startPosition, endPosition), replacement);
        return fix;
    }

    private getStartIndexVariable(document: vscode.TextDocument, { start }: CodeBlock): number {
        const variableLine = document.lineAt(start).text;
        let currentIndex = 0;
        while (variableLine[currentIndex] === ' ') {
            currentIndex++;
        }
        return currentIndex;
    }

    public standardizeMessage(messageWithoutArgs: string): { message: string, params: string[] } {
        let params: string[] = [];
        let message = '"';
        // prevent infinite loop
        for (let i = 0; i < this.threshold; i++) {
            // space around "+" could be none or more than one
            if (messageWithoutArgs.startsWith('"')) {
                const nextIndex = this.indexEndDoubleQuote(messageWithoutArgs, 1);
                message += messageWithoutArgs.substring(1, nextIndex);
                messageWithoutArgs = messageWithoutArgs.substring(nextIndex + 1);
            } else if (messageWithoutArgs.startsWith('(')) {
                const nextIndex = this.indexEndRightParentheses(messageWithoutArgs);
                if (nextIndex === -1) {
                    console.log(`message: ${messageWithoutArgs}`);
                    throw new Error("Unsupported message");
                }
                params.push(messageWithoutArgs.substring(0, nextIndex + 1));
                messageWithoutArgs = messageWithoutArgs.substring(nextIndex + 1);
            } else if (/^[a-z_$]/i.test(messageWithoutArgs)) {
                // messageWithoutArgs start with a variable or function call of variable
                // like severe(abc) or severe(abc + ...) or severe(abc+ ...)
                // it can detect simple function call like myMap.get("key") 
                // but not with myMap.get("my key") or myMap.get("key" + 1)
                let index = Math.min(messageWithoutArgs.indexOf('+'), messageWithoutArgs.indexOf(' '));
                message += `{${params.length}}`;
                index = index === -1 ? messageWithoutArgs.length : index;
                params.push(messageWithoutArgs.substring(0, index).replace(".toString()", ""));
                messageWithoutArgs = messageWithoutArgs.substring(index);
            } else {
                console.log(`message: ${messageWithoutArgs}`);
                throw new Error("Invalid message");
            }
            messageWithoutArgs = messageWithoutArgs.trim();
            // end or "+ ...";
            if (messageWithoutArgs.startsWith('+')) {
                messageWithoutArgs = messageWithoutArgs.substring(1).trim();
            }
            if (!messageWithoutArgs) { break; }
        }
        return { message: message + '"', params };
    }

    /**
     * get `"` not `\"`
     * @param message ex: `"level: \"severe\""`
     * @param start 
     * @returns 
     */
    private indexEndDoubleQuote(message: string, start: number): number {
        let index = start;
        for (; index < message.length; index++) {
            if (message[index] === '"' && message[index - 1] !== '\\') {
                break;
            }
        }
        return index;
    }

    /**
     * get index of right parentheses for `message[0]`
     * 
     * curretly couldn't detect fake end parentheses, ex: `("my message )"+message)`
     * @param message ex: `("my index" + (1 + index))`
     * @returns 
     */
    private indexEndRightParentheses(message: string): number {
        let stack = [];
        for (let index = 0; index < message.length; index++) {
            if (message[index] === '(') {
                stack.push('(');
            }
            if (message[index] === ')') {
                stack.pop();
                if (stack.length === 0) {
                    return index;
                }
            }
        }
        return -1;
    }

    private createCommand(): vscode.CodeAction {
        const action = new vscode.CodeAction('Learn more...', vscode.CodeActionKind.Empty);
        action.command = { command: COMMAND, title: 'Learn more about emojis', tooltip: 'This will open the unicode emoji page.' };
        return action;
    }
}