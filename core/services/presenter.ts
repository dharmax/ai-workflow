/**
 * Responsibility: Decouple data from visual presentation.
 * Scope: Handles human-friendly formatting for Shell mode while remaining optional for Skill mode.
 */

export class ShellPresenter {
  static formatProjectSummary(summary: any): string {
    const lines = [
      `Files indexed: ${summary.fileCount}`,
      `Symbols indexed: ${summary.symbolCount}`,
      `Tickets: ${summary.activeTickets.length}`,
      `Codelets: ${summary.codeletCount ?? 0}`
    ];
    
    if (summary.activeTickets.length) {
      lines.push("\nActive Tickets:");
      summary.activeTickets.forEach((t: any) => lines.push(`- [${t.lane}] ${t.id}: ${t.title}`));
    }
    
    return lines.join("\n") + "\n";
  }

  static formatSyncResult(result: any): string {
    return [
      `DB: ${result.dbPath}`,
      `Indexed files: ${result.indexedFiles}`,
      `Symbols: ${result.indexedSymbols}`,
      `Imported tickets: ${result.importSummary.importedTickets}`
    ].join("\n") + "\n";
  }
}
