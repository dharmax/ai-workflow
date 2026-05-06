/**
 * Responsibility: Decouple data from visual presentation.
 * Scope: Handles human-friendly formatting for Shell mode while remaining optional for Skill mode.
 */

export class ShellPresenter {
  static formatProjectSummary(summary: any): string {
    const assessmentStatusBits = Object.entries(summary.assessmentSummary?.byStatus ?? {})
      .sort((left: any, right: any) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([status, count]) => `${count} ${status}`);
    const topAssessmentError = summary.assessmentSummary?.topErrors?.[0] ?? null;
    const lines = [
      `Files indexed: ${summary.fileCount}`,
      `Symbols indexed: ${summary.symbolCount}`,
      `Notes tracked: ${summary.noteCount}`,
      `Tickets: ${summary.activeTickets.length}`,
      `Assessments: ${summary.assessmentCount}${assessmentStatusBits.length ? ` (${assessmentStatusBits.join(", ")})` : ""}`,
      topAssessmentError ? `Top assessment failure: ${topAssessmentError.error} (${topAssessmentError.count})` : null,
      `Codelets: ${summary.codeletCount ?? 0}`,
      `Candidates: ${summary.candidates.length}`
    ].filter(Boolean);

    if (summary.activeTickets.length) {
      lines.push("\nActive Tickets:");
      for (const t of summary.activeTickets) {
        lines.push(`- [${t.lane}] ${t.id}: ${t.title}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  static formatSyncResult(result: any): string {
    const lines = [
      `DB: ${result.dbPath}`,
      `Indexed files: ${result.indexedFiles}`,
      `Symbols: ${result.indexedSymbols}`,
      `Claims: ${result.indexedClaims}`,
      `Notes: ${result.indexedNotes}`,
      `Codelets: ${result.codeletRegistry?.codeletsIndexed ?? 0}`,
      `Imported tickets: ${result.importSummary.importedTickets}`,
      `Reviewed candidates: ${result.lifecycle.reviewed.length}`
    ];
    if (result.projections) {
      lines.push(`Wrote projections: ${result.projections.kanbanPath}, ${result.projections.epicsPath}`);
    }
    return lines.join("\n") + "\n";
  }

  static formatCodeletResult(id: string, result: any): string {
    if (id === "sync") return this.formatSyncResult(result);
    if (id === "project-summary" || id === "summary") return this.formatProjectSummary(result);
    
    if (result && typeof result === "object") {
       return JSON.stringify(result, null, 2) + "\n";
    }
    return String(result) + "\n";
  }
}
