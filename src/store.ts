import { Database, Statement } from 'bun:sqlite';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Entity, Relation, CodeNote, RunArtifact, TicketContext, ProjectHealth, TicketLane } from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  lane TEXT,
  status TEXT,
  body TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relations (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  metadata TEXT,
  PRIMARY KEY(from_id, to_id, relation)
);

CREATE TABLE IF NOT EXISTS code_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  col INTEGER DEFAULT 0,
  note_type TEXT NOT NULL,
  body TEXT NOT NULL,
  ticket_id TEXT
);

CREATE TABLE IF NOT EXISTS run_artifacts (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  output TEXT,
  lessons TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_lane ON entities(lane);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_id);
CREATE INDEX IF NOT EXISTS idx_notes_file ON code_notes(file_path);
CREATE INDEX IF NOT EXISTS idx_notes_type ON code_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_ticket ON run_artifacts(ticket_id);
`;

export class WorkflowStore {
  public db: Database;
  public root: string;
  private stmtUpsertEntity: Statement;
  private stmtAddRelation: Statement;

  constructor(projectRoot: string = process.cwd()) {
    this.root = path.resolve(projectRoot);
    const dbDir = path.join(this.root, '.ai-workflow', 'state');
    mkdirSync(dbDir, { recursive: true });
    this.db = new Database(path.join(dbDir, 'workflow.db'));
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);

    this.stmtUpsertEntity = this.db.prepare(`
      INSERT INTO entities (id, type, title, lane, status, body, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        lane = COALESCE(excluded.lane, entities.lane),
        status = COALESCE(excluded.status, entities.status),
        body = excluded.body,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    this.stmtAddRelation = this.db.prepare(`
      INSERT INTO relations (from_id, to_id, relation, metadata)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_id, to_id, relation) DO UPDATE SET metadata = excluded.metadata
    `);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  upsertEntity(e: Entity): Entity {
    const now = new Date().toISOString();
    const createdAt = e.createdAt ?? now;
    const updatedAt = now;

    this.stmtUpsertEntity.run(
      e.id, e.type, e.title, e.lane ?? null, e.status ?? null, e.body ?? '',
      JSON.stringify(e.metadata ?? {}), createdAt, updatedAt
    );

    return { ...e, createdAt, updatedAt };
  }

  getEntity(id: string): Entity | null {
    const row: any = this.db.prepare(`SELECT * FROM entities WHERE id = ?`).get(id);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      lane: row.lane,
      status: row.status,
      body: row.body,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  listEntities(filter: { type?: string; lane?: string; status?: string } = {}): Entity[] {
    let sql = `SELECT * FROM entities WHERE 1=1`;
    const params: any[] = [];
    if (filter.type) { sql += ` AND type = ?`; params.push(filter.type); }
    if (filter.lane) { sql += ` AND lane = ?`; params.push(filter.lane); }
    if (filter.status) { sql += ` AND status = ?`; params.push(filter.status); }
    sql += ` ORDER BY updated_at DESC`;

    return this.db.prepare(sql).all(...params).map((row: any) => this.mapEntity(row));
  }

  deleteEntity(id: string) {
    this.db.prepare(`DELETE FROM entities WHERE id = ?`).run(id);
    this.db.prepare(`DELETE FROM relations WHERE from_id = ? OR to_id = ?`).run(id, id);
  }

  addRelation(rel: Relation) {
    this.stmtAddRelation.run(rel.fromId, rel.toId, rel.relation, JSON.stringify(rel.metadata ?? {}));
  }

  removeRelation(fromId: string, toId: string, relation: string) {
    this.db.prepare(`DELETE FROM relations WHERE from_id = ? AND to_id = ? AND relation = ?`).run(fromId, toId, relation);
  }

  getOutgoing(fromId: string, relation?: string): Entity[] {
    let sql = `SELECT e.* FROM entities e JOIN relations r ON e.id = r.to_id WHERE r.from_id = ?`;
    const params: any[] = [fromId];
    if (relation) { sql += ` AND r.relation = ?`; params.push(relation); }
    return this.db.prepare(sql).all(...params).map((row: any) => this.mapEntity(row));
  }

  getIncoming(toId: string, relation?: string): Entity[] {
    let sql = `SELECT e.* FROM entities e JOIN relations r ON e.id = r.from_id WHERE r.to_id = ?`;
    const params: any[] = [toId];
    if (relation) { sql += ` AND r.relation = ?`; params.push(relation); }
    return this.db.prepare(sql).all(...params).map((row: any) => this.mapEntity(row));
  }

  saveCodeNotes(filePath: string, notes: CodeNote[]) {
    this.db.prepare(`DELETE FROM code_notes WHERE file_path = ?`).run(filePath);
    const insert = this.db.prepare(`INSERT INTO code_notes (file_path, line, col, note_type, body, ticket_id) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const n of notes) {
      insert.run(filePath, n.line, n.column ?? 0, n.noteType, n.body, n.ticketId ?? null);
    }
  }

  listCodeNotes(filter: { filePath?: string; noteType?: string } = {}): CodeNote[] {
    let sql = `SELECT * FROM code_notes WHERE 1=1`;
    const params: any[] = [];
    if (filter.filePath) { sql += ` AND file_path = ?`; params.push(filter.filePath); }
    if (filter.noteType) { sql += ` AND note_type = ?`; params.push(filter.noteType); }
    return this.db.prepare(sql).all(...params).map((r: any) => ({
      id: r.id, filePath: r.file_path, line: r.line, column: r.col, noteType: r.note_type, body: r.body, ticketId: r.ticket_id
    }));
  }

  recordRunArtifact(artifact: RunArtifact) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO run_artifacts (id, ticket_id, action, status, output, lessons, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      artifact.id, artifact.ticketId ?? null, artifact.action, artifact.status,
      artifact.output ?? '', JSON.stringify(artifact.lessons ?? {}), artifact.createdAt ?? now
    );
  }

  getRunArtifacts(ticketId?: string): RunArtifact[] {
    const sql = ticketId 
      ? `SELECT * FROM run_artifacts WHERE ticket_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM run_artifacts ORDER BY created_at DESC LIMIT 50`;
    const rows = ticketId ? this.db.prepare(sql).all(ticketId) : this.db.prepare(sql).all();
    return rows.map((r: any) => ({
      id: r.id, ticketId: r.ticket_id, action: r.action, status: r.status, output: r.output,
      lessons: JSON.parse(r.lessons || '{}'), createdAt: r.created_at
    }));
  }

  getTicketContext(ticketId: string): TicketContext | null {
    const ticket = this.getEntity(ticketId);
    if (!ticket) return null;

    const epic = this.getIncoming(ticketId, 'implements')[0] ?? this.getOutgoing(ticketId, 'implements')[0];
    const decisions = this.getIncoming(ticketId, 'governs').concat(this.getOutgoing(ticketId, 'governs'));
    const guidelines = this.listEntities({ type: 'guideline' });
    const linkedFiles = this.getOutgoing(ticketId, 'modifies').map(e => e.id);
    const pastLessons = this.getRunArtifacts(ticketId);

    const linkedSymbols: Array<{ name: string; kind: string; file: string; line: number }> = [];
    for (const f of linkedFiles) {
      const syms = this.getOutgoing(f, 'contains');
      for (const s of syms) {
        linkedSymbols.push({
          name: s.title,
          kind: s.metadata?.kind ?? 'symbol',
          file: f,
          line: s.metadata?.line ?? 1
        });
      }
    }

    return {
      ticket,
      epic,
      decisions,
      guidelines,
      linkedFiles,
      linkedSymbols,
      pastLessons,
      verificationCommand: ticket.metadata?.verificationCommand ?? 'bun test'
    };
  }

  getProjectHealth(): ProjectHealth {
    const modules = this.listEntities({ type: 'module' });
    const tickets = this.listEntities({ type: 'ticket' });
    const notes = this.listCodeNotes();
    const decisions = this.listEntities({ type: 'decision' });

    const laneCounts: Record<TicketLane, number> = {
      'Backlog': 0, 'Todo': 0, 'In Progress': 0, 'Done': 0, 'Blocked': 0
    };
    for (const t of tickets) {
      if (t.lane && laneCounts[t.lane] !== undefined) {
        laneCounts[t.lane]++;
      }
    }

    const moduleHealth = modules.map(m => {
      const files = this.getOutgoing(m.id, 'contains');
      let symbolCount = 0;
      let implementedSymbols = 0;
      let bugsCount = 0;
      let todoCount = 0;

      for (const f of files) {
        const syms = this.getOutgoing(f.id, 'contains');
        symbolCount += syms.length;
        implementedSymbols += syms.filter(s => s.status === 'verified' || s.status === 'implemented').length;
        const fileNotes = notes.filter(n => n.filePath === f.id);
        bugsCount += fileNotes.filter(n => n.noteType === 'BUG' || n.noteType === 'FIXME').length;
        todoCount += fileNotes.filter(n => n.noteType === 'TODO').length;
      }

      const activeTickets = tickets
        .filter(t => t.lane === 'In Progress' && this.getOutgoing(t.id, 'modifies').some(f => files.some(mf => mf.id === f.id)))
        .map(t => t.id);

      const completionPercent = symbolCount > 0 ? Math.round((implementedSymbols / symbolCount) * 100) : 100;

      return {
        name: m.title,
        path: m.id,
        symbolCount,
        implementedSymbols,
        completionPercent,
        bugsCount,
        todoCount,
        activeTickets
      };
    });

    return {
      modules: moduleHealth,
      totalTickets: tickets.length,
      laneCounts,
      openBugsCount: notes.filter(n => n.noteType === 'BUG' || n.noteType === 'FIXME').length,
      acceptedDecisionsCount: decisions.filter(d => d.status === 'accepted').length
    };
  }

  private mapEntity(row: any): Entity {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      lane: row.lane,
      status: row.status,
      body: row.body,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  close() {
    this.db.close();
  }
}
