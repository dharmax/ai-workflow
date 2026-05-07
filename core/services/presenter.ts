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
    if (result.protocol) {
      lines.push("");
      lines.push(`Protocol: ${result.protocol.ok ? "✅ verified" : "🚨 unverified"}`);
      for (const v of result.protocol.violations) {
        lines.push(`- Violation: ${v}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  static formatCodeletResult(id: string, result: any): string {
    if (id === "sync") return this.formatSyncResult(result);
    if (id === "project-summary" || id === "summary") return this.formatProjectSummary(result);
    if (id === "execute-ticket") return this.formatExecuteTicketResult(result);
    if (id === "extract-ticket" || id === "ticket") return this.formatExtractTicketResult(result);
    if (id === "extract-guidelines") return this.formatGuidanceResult(result);
    if (id === "audit") return this.formatAuditResult(result);
    if (id === "dogfood") return this.formatDogfoodResult(result);
    
    if (result && typeof result === "object") {
       return JSON.stringify(result, null, 2) + "\n";
    }
    return String(result) + "\n";
  }

  static formatExecuteTicketResult(result: any): string {
    const lines = [
      `Mode: ${result.mode}`,
      `Repair target: ${result.repairTargetRoot}`,
      `Ticket: ${result.ticketId || result.id}`,
      `Status: ${result.status ?? (result.success ? "ok" : "failed")}`,
      `Ready: ${result.executionPlan?.ready ? "yes" : "no"}`
    ].filter(Boolean);

    if (result.executionPlan?.verificationCommands?.length) {
      lines.push(`Verification: ${result.executionPlan.verificationCommands.map((item: any) => item.command).join(" | ")}`);
    }
    if (result.verification?.results?.length) {
      lines.push(`Baseline: ${result.verification.ok ? "green" : "red"}`);
      for (const res of result.verification.results) {
        lines.push(`- ${res.exitCode === 0 ? "PASS" : "FAIL"} ${res.command} | ${res.snippet}`);
      }
    }
    if (result.changedFiles?.length) {
      lines.push(`Changed files: ${result.changedFiles.join(", ")}`);
    }
    if (result.error) {
      lines.push(`Error: ${result.error}`);
    }
    return lines.join("\n") + "\n";
  }

  static formatGuidanceResult(result: any): string {
    const lines = [];
    lines.push("Active Guardrails:");
    for (const item of result.activeGuardrails) {
      lines.push(`- [${item.severity}] ${item.summary} (${item.sourceLabel})`);
    }
    lines.push("\nGuidance Bundle:");
    for (const [section, items] of Object.entries(result.guidance)) {
      lines.push(`\n[${section.toUpperCase()}]`);
      (items as any[]).forEach(item => lines.push(`- ${item}`));
    }
    return lines.join("\n") + "\n";
  }

  static formatExtractTicketResult(result: any): string {
    const lines = [
      `Ticket: ${result.ticket?.id ?? result.ticketId}`,
      `Title: ${result.ticket?.title ?? "unknown"}`,
      `Source: ${result.sourcePath ?? "unknown"}`
    ];
    if (result.entity?.lane) {
      lines.push(`Lane: ${result.entity.lane}`);
    }
    if (result.ticket?.body) {
      lines.push("");
      lines.push(result.ticket.body);
    }
    if (Array.isArray(result.workingSet?.files) && result.workingSet.files.length) {
      lines.push("");
      lines.push("Working set files:");
      for (const file of result.workingSet.files) {
        lines.push(`- ${file}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  static formatAuditResult(result: any): string {
    const lines = [
      `Status: ${result.status ?? "unknown"}`
    ];
    const failures = Array.isArray(result.failures) ? result.failures : [];
    if (failures.length) {
      lines.push("Failures:");
      for (const failure of failures) {
        lines.push(`- ${failure}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  static formatDogfoodResult(result: any): string {
    const lines = [
      `Status: ${result.status ?? "unknown"}`,
      `Profile: ${result.profile ?? "unknown"}`
    ];
    const surfaces = Object.entries(result.surfaces ?? {});
    if (surfaces.length) {
      lines.push("Surfaces:");
      for (const [surfaceId, surface] of surfaces) {
        lines.push(`- ${surfaceId}: ${surface.status ?? "unknown"} (${surface.scenarioCount ?? 0} scenarios)`);
      }
    }
    return lines.join("\n") + "\n";
  }
}
