import { readFileSync } from 'fs';

const keywords: string[] = [
    "always", "and", "assign", "automatic",
    "begin", "buf", "bufif0", "bufif1",
    "case", "casex", "casez", "cell",
    "cmos", "config", "deassign", "default",
    "defparam", "design", "disable", "edge",
    "else", "end", "endcase", "endconfig",
    "endfunction", "endgenerate", "endmodule", "endprimitive",
    "endspecify", "endtable", "endtask", "event",
    "for", "force", "forever", "fork",
    "function", "generate", "genvar", "highz0",
    "highz1", "if", "ifnone", "incdir",
    "include", "initial", "inout", "input",
    "instance", "integer", "join", "larger",
    "liblist", "library", "localparam", "macromodule",
    "medium", "module", "nand", "negedge",
    "nmos", "nor", "noshow-cancelled", "not",
    "notif0", "notif1", "or", "output",
    "parameter", "pmos", "posedge", "primitive",
    "pull0", "pull1", "pullup", "pulldown",
    "pulsestyle_ondetect", "pulsestyle_onevent", "rcmos", "real",
    "realtime", "reg", "release", "repeat",
    "rnmos", "rpmos", "rtran", "rtranif0",
    "rtranif1", "scalared", "show-cancelled", "signed",
    "small", "specify", "specpa", "strong0",
    "strong1", "supply0", "supply1", "table",
    "task", "time", "tran", "tranif0",
    "tranif1", "tri", "tri0", "tri1",
    "triand", "trior", "trireg", "use",
    "vectored", "wait", "wand", "weak0",
    "weak1", "while", "wire", "wor",
    "xnor", "xor"
];

const operators: string[] = [
    "+", "&", "<", "?",
    "-", "&&", "==", "*",
    "|", "===", "**", "||",
    "<=", "^", ">=", "%",
    "~", ">=", "~^", "!= ",
    "^~", "!==", "<<", ">",
    ">>", "<<<", ">>>", "="
];


const TokenType = {
    Identifier: 0,       // ^[a-zA-Z_][a-zA-z\d_\$]*$
    NumberLiteral: 1,    // 4'b0101, 8'hFF, 'd100, -6'sd9 plain integers, 'b, 'd, 'o, 'h, 's, -12
    StringLiteral: 2,    // "anything in double quotes" <- have to get something to sew it together
    Operator: 3,         
    Keyword: 4,          
    Comment: 5,          // // single-line, /* multi-line */
    Unknown: 6
} as const
type TokenType = typeof TokenType[keyof typeof TokenType];

export interface Token {
    type: TokenType;
    value: string;
}

export interface ImplicitNetError {
    line: number;
    startCol: number;
    endCol: number;
    name: string;
};

export default function verilogParser(file: string): ImplicitNetError[] {
    let [tokens, lines] = tokenizeFile(file);
    let declarationMap: Map<string, number> = new Map<string, number>();
    let implicitNetErrors: ImplicitNetError[] = [];
    let declarationKeywords: string[] = ['reg', 'wire'];

    // add all declared identifiers to declarationMap with their bit lengths
    let inDeclaration: boolean = false;
    let declarationBitLength: number = 0;
    let declarationIdentifier: string = "";
    tokens.forEach((token, index) => {
        if (!inDeclaration && declarationKeywords.includes(token.value)) {
            inDeclaration = true;
        }
        if (inDeclaration && token.type === TokenType.Identifier) {
            declarationIdentifier = token.value;
        }

        if (inDeclaration && token.type === TokenType.Unknown && /^\[\d*:\d*\]$/.test(token.value)) {
            let bitRange: string[] = token.value.slice(1, -1).split(':');
            declarationBitLength = Math.abs(parseInt(bitRange[0]) - parseInt(bitRange[1]));
        }

        if (inDeclaration && declarationBitLength !== 0 && declarationIdentifier !== "") {
            declarationMap.set(declarationIdentifier, declarationBitLength);
            inDeclaration = false;
            declarationBitLength = 0;
            declarationIdentifier = "";
        }
    });

    // check for implicit nets
    // TODO: this assumes that an identifier always follows an operator or assign, double check this is true
    let inOperation: boolean = false;
    tokens.forEach((token, index) => {
        if (token.type === TokenType.Operator || (token.type === TokenType.Keyword && token.value === "assign")) {
            inOperation = true;
        }

        if (inOperation && token.type === TokenType.Identifier) {
            if (!declarationMap.has(token.value)) {
                implicitNetErrors.push({
                    line: 0,
                    startCol: 0,
                    endCol: 0,
                    name: token.value
                });
            }
            inOperation = false;
        }
    });

    // find line and column numbers for implicit net errors
    implicitNetErrors.forEach(error => {
        lines.forEach((line, lineIndex) => {
            if (line.includes(error.name)) {
                error.line = lineIndex + 1;
                error.startCol = line.indexOf(error.name) + 1;
                error.endCol = error.startCol + error.name.length;
            }
        });
    });
    return implicitNetErrors;
};

function tokenizeFile(file: string): [Token[], string[]] {
    let tokens: Token[] = [];
    const fileContent: string = readFileSync(file, 'utf-8');
    const lines: string[] = fileContent.split('\n');
    let inStringLiteral: boolean = false;
    let inMultiLineComment: boolean = false;
    let stringLiteralBuffer: string = "";
    let commentLiteralBuffer: string = "";
    lines.forEach((line, index) => {
        line = line.trim();
        if (!inStringLiteral && !inMultiLineComment &&line == '')
        {
            return;
        }
        if (!inStringLiteral && !inMultiLineComment &&line.startsWith('//')) {
            tokens.push({
                type: TokenType.Comment,
                value: line
            });
            return;
        }

        if (line.startsWith('/*')) {
            inMultiLineComment = true;
            commentLiteralBuffer += line + " ";
            return;
        }

        if (inMultiLineComment) {
            commentLiteralBuffer += line + " ";
            if (line.includes('*/')) {
                inMultiLineComment = false;
                tokens.push({
                    type: TokenType.Comment,
                    value: commentLiteralBuffer.trim()
                });
                commentLiteralBuffer = "";
            }
            return;
        }

        let words: string[] = line.split(" ").filter(Boolean);
        words[words.length - 1] = words[words.length - 1].replace(';', '');
        words.forEach(word => {
            if (word.startsWith('"') && !inStringLiteral) {
                inStringLiteral = true;
                stringLiteralBuffer += word + " ";
            } else if (inStringLiteral) {
                stringLiteralBuffer += word + " ";
                if (word.endsWith('"')) {
                    inStringLiteral = false;
                    tokens.push({
                        type: TokenType.StringLiteral,
                        value: stringLiteralBuffer.trim()
                    });
                    stringLiteralBuffer = "";
                }
            } else if (keywords.includes(word)) {
                tokens.push({
                    type: TokenType.Keyword,
                    value: word
                });
            } else if (operators.includes(word)) {
                tokens.push({
                    type: TokenType.Operator,
                    value: word
                });
            } else if (/^[a-zA-Z_][a-zA-Z0-9_\$]*$/.test(word)) {
                tokens.push({
                    type: TokenType.Identifier,
                    value: word
                });
            } else if (/^([-\d]|'[bdohs])$/.test(word)) {
                tokens.push({
                    type: TokenType.NumberLiteral,
                    value: word
                });
            } else {
                tokens.push({
                    type: TokenType.Unknown,
                    value: word
                });
            }
        })
    });
    return [tokens, lines];
};

let finalTokens = verilogParser("/home/azyounus/helloworld/src/testbench.v");