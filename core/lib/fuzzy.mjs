import { getNoteRegex, SEMANTICS } from "./registry.mjs";

/** 
 * Fuzzy and sophisticated searching utilities for ai-workflow.
 */

export function findNotesFuzzily(text) {
  const lines = text.split("\n");
  const results = [];
  const regex = getNoteRegex();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(regex);
    if (match) {
      const fullMatch = match[0];
      const body = match[1];
      const type = inferNoteType(fullMatch);
      results.push({
        type,
        body: body.trim(),
        line: i + 1,
        rawLine: line
      });
    }
  }
  return results;
}

export function findProjectEntityFuzzily(query, entities) {
  if (!query || !entities.length) return null;
  
  const upper = query.toUpperCase();
  const exact = entities.find(e => e.id === upper);
  if (exact) return exact;
  
  if (/^\d+$/.test(query)) {
    const padded = query.padStart(3, "0");
    return entities.find(e => e.id.endsWith("-" + padded));
  }
  
  return entities.find(e => e.id.includes(upper));
}

export function countLineColumn(source, offset) {
  const slice = source.slice(0, Math.max(0, offset));
  const lines = slice.split("\n");
  return {
    line: lines.length,
    column: lines.at(-1).length + 1
  };
}

export function extractTaggedNotes(content, { commentPattern, filePath }) {
  const results = [];
  const noteRegex = getNoteRegex();

  for (const match of content.matchAll(commentPattern)) {
    const commentBody = match[1];
    const offset = match.index;
    const { line, column } = countLineColumn(content, offset);

    const innerLines = commentBody.split("\n");
    for (let i = 0; i < innerLines.length; i++) {
      const noteMatch = innerLines[i].match(noteRegex);
      if (noteMatch) {
        const typeText = noteMatch[1] || "TODO";
        const body = noteMatch[2] || "";
        const noteType = inferNoteType(typeText);
        results.push({
          noteType,
          body: body.trim(),
          filePath,
          line: line + i,
          column: i === 0 ? column : 1
        });
      }
    }
  }
  return results;
}

function inferNoteType(matchText) {
  const lower = (matchText || "").toLowerCase();
  for (const [canonical, aliases] of Object.entries(SEMANTICS.NOTES.aliases)) {
    if (aliases.some(a => lower.includes(a.toLowerCase()))) return canonical;
  }
  for (const marker of SEMANTICS.NOTES.markers) {
    if (lower.includes(marker.toLowerCase())) return marker;
  }
  return "TODO";
}
