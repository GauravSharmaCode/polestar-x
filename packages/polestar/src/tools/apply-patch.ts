import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";
import { withFileMutationQueue } from "../../../coding-agent/src/core/tools/file-mutation-queue.ts";

// Custom types for OpenCode-style patch
export interface UpdateFileChunk {
	old_lines: string[];
	new_lines: string[];
	change_context?: string;
	is_end_of_file?: boolean;
}

export type Hunk =
	| { type: "add"; path: string; contents: string }
	| { type: "delete"; path: string }
	| { type: "update"; path: string; move_path?: string; chunks: UpdateFileChunk[] };

const BOM_CODE = 0xfeff;
const BOM = String.fromCharCode(BOM_CODE);

function splitBOM(text: string) {
	if (text.charCodeAt(0) === BOM_CODE) {
		return { bom: true, text: text.slice(1) };
	}
	return { bom: false, text };
}

function parsePatchHeader(
	lines: string[],
	startIdx: number,
): { filePath: string; movePath?: string; nextIdx: number } | null {
	const line = lines[startIdx];

	if (line.startsWith("*** Add File:")) {
		const filePath = line.slice("*** Add File:".length).trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Delete File:")) {
		const filePath = line.slice("*** Delete File:".length).trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Update File:")) {
		const filePath = line.slice("*** Update File:".length).trim();
		let movePath: string | undefined;
		let nextIdx = startIdx + 1;

		// Check for move directive
		if (nextIdx < lines.length && lines[nextIdx].startsWith("*** Move to:")) {
			movePath = lines[nextIdx].slice("*** Move to:".length).trim();
			nextIdx++;
		}

		return filePath ? { filePath, movePath, nextIdx } : null;
	}

	return null;
}

function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
	const chunks: UpdateFileChunk[] = [];
	let i = startIdx;

	while (i < lines.length && !lines[i].startsWith("***")) {
		if (lines[i].startsWith("@@")) {
			// Parse context line
			const contextLine = lines[i].substring(2).trim();
			i++;

			const oldLines: string[] = [];
			const newLines: string[] = [];
			let isEndOfFile = false;

			// Parse change lines
			while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("***")) {
				const changeLine = lines[i];

				if (changeLine === "*** End of File") {
					isEndOfFile = true;
					i++;
					break;
				}

				if (changeLine.startsWith(" ")) {
					const content = changeLine.substring(1);
					oldLines.push(content);
					newLines.push(content);
				} else if (changeLine.startsWith("-")) {
					oldLines.push(changeLine.substring(1));
				} else if (changeLine.startsWith("+")) {
					newLines.push(changeLine.substring(1));
				}

				i++;
			}

			chunks.push({
				old_lines: oldLines,
				new_lines: newLines,
				change_context: contextLine || undefined,
				is_end_of_file: isEndOfFile || undefined,
			});
		} else {
			i++;
		}
	}

	return { chunks, nextIdx: i };
}

function parseAddFileContent(lines: string[], startIdx: number): { content: string; nextIdx: number } {
	let content = "";
	let i = startIdx;

	while (i < lines.length && !lines[i].startsWith("***")) {
		if (lines[i].startsWith("+")) {
			content += `${lines[i].substring(1)}\n`;
		}
		i++;
	}

	if (content.endsWith("\n")) {
		content = content.slice(0, -1);
	}

	return { content, nextIdx: i };
}

function stripHeredoc(input: string): string {
	const heredocMatch = input.match(/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/);
	if (heredocMatch) {
		return heredocMatch[2];
	}
	return input;
}

export function parsePatch(patchText: string): { hunks: Hunk[] } {
	const normalizedPatch = patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const cleaned = stripHeredoc(normalizedPatch.trim());
	const lines = cleaned.split("\n");
	const hunks: Hunk[] = [];
	let i = 0;

	const beginMarker = "*** Begin Patch";
	const endMarker = "*** End Patch";

	const beginIdx = lines.findIndex((line) => line.trim() === beginMarker);
	const endIdx = lines.findIndex((line) => line.trim() === endMarker);

	if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
		throw new Error("Invalid patch format: missing Begin/End markers");
	}

	i = beginIdx + 1;

	while (i < endIdx) {
		const header = parsePatchHeader(lines, i);
		if (!header) {
			i++;
			continue;
		}

		if (lines[i].startsWith("*** Add File:")) {
			const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx);
			hunks.push({
				type: "add",
				path: header.filePath,
				contents: content,
			});
			i = nextIdx;
		} else if (lines[i].startsWith("*** Delete File:")) {
			hunks.push({
				type: "delete",
				path: header.filePath,
			});
			i = header.nextIdx;
		} else if (lines[i].startsWith("*** Update File:")) {
			const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx);
			hunks.push({
				type: "update",
				path: header.filePath,
				move_path: header.movePath,
				chunks,
			});
			i = nextIdx;
		} else {
			i++;
		}
	}

	return { hunks };
}

function normalizeUnicode(str: string): string {
	return str
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[“”„‟]/g, '"')
		.replace(/[‐‑‒–—―]/g, "-")
		.replace(/…/g, "...")
		.replace(/ /g, " ");
}

type Comparator = (a: string, b: string) => boolean;

function tryMatch(lines: string[], pattern: string[], startIndex: number, compare: Comparator, eof: boolean): number {
	if (eof) {
		const fromEnd = lines.length - pattern.length;
		if (fromEnd >= startIndex) {
			let matches = true;
			for (let j = 0; j < pattern.length; j++) {
				if (!compare(lines[fromEnd + j], pattern[j])) {
					matches = false;
					break;
				}
			}
			if (matches) return fromEnd;
		}
	}

	for (let i = startIndex; i <= lines.length - pattern.length; i++) {
		let matches = true;
		for (let j = 0; j < pattern.length; j++) {
			if (!compare(lines[i + j], pattern[j])) {
				matches = false;
				break;
			}
		}
		if (matches) return i;
	}

	return -1;
}

function seekSequence(lines: string[], pattern: string[], startIndex: number, eof = false): number {
	if (pattern.length === 0) return -1;

	const exact = tryMatch(lines, pattern, startIndex, (a, b) => a === b, eof);
	if (exact !== -1) return exact;

	const rstrip = tryMatch(lines, pattern, startIndex, (a, b) => a.trimEnd() === b.trimEnd(), eof);
	if (rstrip !== -1) return rstrip;

	const trim = tryMatch(lines, pattern, startIndex, (a, b) => a.trim() === b.trim(), eof);
	if (trim !== -1) return trim;

	const normalized = tryMatch(
		lines,
		pattern,
		startIndex,
		(a, b) => normalizeUnicode(a.trim()) === normalizeUnicode(b.trim()),
		eof,
	);
	return normalized;
}

function computeReplacements(
	originalLines: string[],
	filePath: string,
	chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
	const replacements: Array<[number, number, string[]]> = [];
	let lineIndex = 0;

	for (const chunk of chunks) {
		if (chunk.change_context) {
			const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex);
			if (contextIdx === -1) {
				throw new Error(`Failed to find context '${chunk.change_context}' in ${filePath}`);
			}
			lineIndex = contextIdx;
		}

		if (chunk.old_lines.length === 0) {
			const insertionIdx =
				originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
					? originalLines.length - 1
					: originalLines.length;
			replacements.push([insertionIdx, 0, chunk.new_lines]);
			continue;
		}

		let pattern = chunk.old_lines;
		let newSlice = chunk.new_lines;
		let found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file);

		if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === "") {
			pattern = pattern.slice(0, -1);
			if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") {
				newSlice = newSlice.slice(0, -1);
			}
			found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file);
		}

		if (found !== -1) {
			replacements.push([found, pattern.length, newSlice]);
			lineIndex = found + pattern.length;
		} else {
			throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`);
		}
	}

	replacements.sort((a, b) => a[0] - b[0]);
	return replacements;
}

function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
	const result = [...lines];

	for (let i = replacements.length - 1; i >= 0; i--) {
		const [startIdx, oldLen, newSegment] = replacements[i];
		result.splice(startIdx, oldLen);
		for (let j = 0; j < newSegment.length; j++) {
			result.splice(startIdx + j, 0, newSegment[j]);
		}
	}

	return result;
}

export function deriveNewContentsFromChunks(
	filePath: string,
	chunks: UpdateFileChunk[],
	originalText: string,
): { content: string; bom: boolean } {
	const normalizedOriginal = originalText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const originalContent = splitBOM(normalizedOriginal);
	const originalLines = originalContent.text.split("\n");

	if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") {
		originalLines.pop();
	}

	const replacements = computeReplacements(originalLines, filePath, chunks);
	const newLines = applyReplacements(originalLines, replacements);

	if (newLines.length === 0 || newLines[newLines.length - 1] !== "") {
		newLines.push("");
	}

	const next = splitBOM(newLines.join("\n"));
	return {
		content: next.text,
		bom: originalContent.bom || next.bom,
	};
}

const applyPatchParams = Type.Object({
	patchText: Type.String({
		description: "The full patch text conforming to *** Begin Patch / *** End Patch format",
	}),
});

export const applyPatchTool: ToolDefinition<typeof applyPatchParams> = {
	name: "apply_patch",
	label: "Apply Patch",
	description: "Apply a custom patch to modify, add, or delete project files.",
	parameters: applyPatchParams,
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const { hunks } = parsePatch(params.patchText);

		if (hunks.length === 0) {
			throw new Error("No file modifications found in patch.");
		}

		const results: string[] = [];

		for (const hunk of hunks) {
			const absolutePath = path.resolve(ctx.cwd, hunk.path);

			await withFileMutationQueue(absolutePath, async () => {
				if (hunk.type === "add") {
					if (existsSync(absolutePath)) {
						const existingContent = readFileSync(absolutePath, "utf-8").trim();
						if (existingContent.length > 0) {
							throw new Error(`File already exists and is not empty: ${hunk.path}`);
						}
					}
					mkdirSync(path.dirname(absolutePath), { recursive: true });
					writeFileSync(absolutePath, hunk.contents, "utf-8");
					results.push(`Added new file: ${hunk.path}`);
				} else if (hunk.type === "delete") {
					if (existsSync(absolutePath)) {
						unlinkSync(absolutePath);
						results.push(`Deleted file: ${hunk.path}`);
					} else {
						results.push(`File to delete did not exist: ${hunk.path}`);
					}
				} else if (hunk.type === "update") {
					if (!existsSync(absolutePath)) {
						throw new Error(`File does not exist to update: ${hunk.path}`);
					}
					const originalText = readFileSync(absolutePath, "utf-8");
					const { content, bom } = deriveNewContentsFromChunks(hunk.path, hunk.chunks, originalText);
					const textToWrite = bom ? BOM + content : content;
					writeFileSync(absolutePath, textToWrite, "utf-8");

					if (hunk.move_path) {
						const moveAbsolutePath = path.resolve(ctx.cwd, hunk.move_path);
						mkdirSync(path.dirname(moveAbsolutePath), { recursive: true });
						writeFileSync(moveAbsolutePath, textToWrite, "utf-8");
						unlinkSync(absolutePath);
						results.push(`Updated and moved file: ${hunk.path} -> ${hunk.move_path}`);
					} else {
						results.push(`Updated file: ${hunk.path}`);
					}
				}
			});
		}

		return {
			content: [{ type: "text", text: results.join("\n") }],
			details: {
				results,
			},
		};
	},
};
