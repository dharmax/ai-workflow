/**
 * Responsibility: Content-Addressable Knowledgebase Client & Local Cache Manager.
 * Scope: Queries Fastly-backed raw GitHub CDN, enforces SHA-256 integrity, and maintains ~/.cache/dharmax-kb/.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { computeHash } from './canonical.ts';
import type {
  KnowledgeItemMeta,
  KnowledgeManifest,
  KnowledgeItem,
  KnowledgeSearchFilter
} from './types.ts';

export const DEFAULT_RAW_BASE_URL = 'https://raw.githubusercontent.com/dharmax/knowledgebase/master';

export class KnowledgeBaseClient {
  private cacheDir: string;
  private objectsDir: string;
  private manifestPath: string;
  private rawBaseUrl: string;
  private ttlMs: number;

  constructor(options: { cacheDir?: string; rawBaseUrl?: string; ttlDays?: number } = {}) {
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.cache', 'dharmax-kb');
    this.objectsDir = path.join(this.cacheDir, 'objects');
    this.manifestPath = path.join(this.cacheDir, 'manifest.json');
    this.rawBaseUrl = options.rawBaseUrl || DEFAULT_RAW_BASE_URL;
    this.ttlMs = (options.ttlDays ?? 3) * 24 * 60 * 60 * 1000;
  }

  /**
   * Loads manifest from cache or fetches upstream if expired or requested.
   */
  async loadManifest(forceRefresh = false): Promise<KnowledgeManifest> {
    if (!forceRefresh) {
      const cached = this.readCachedManifest();
      if (cached && Date.now() - new Date(cached.generatedAt).getTime() < this.ttlMs) {
        return cached;
      }
    }

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(`${this.rawBaseUrl}/manifest.json`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'dharmax-kb-client/1.0' }
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = (await res.json()) as KnowledgeManifest;
        this.saveCachedManifest(json);
        return json;
      }
    } catch {}

    const fallback = this.readCachedManifest();
    if (fallback) return fallback;

    return {
      version: '1.0.0',
      generatedAt: new Date(0).toISOString(),
      repo: 'dharmax/knowledgebase',
      totalItems: 0,
      items: []
    };
  }

  /**
   * Search knowledge items by keyword, type, target, or tag.
   */
  async search(filter: KnowledgeSearchFilter = {}): Promise<KnowledgeItemMeta[]> {
    const manifest = await this.loadManifest();
    let results = manifest.items;

    if (filter.type) {
      results = results.filter((i) => i.type === filter.type);
    }
    if (filter.target && filter.target !== 'universal') {
      results = results.filter((i) => i.target === filter.target || i.target === 'universal');
    }
    if (filter.tag) {
      const tagLower = filter.tag.toLowerCase();
      results = results.filter((i) => i.tags.some((t) => t.toLowerCase() === tagLower));
    }
    if (filter.query) {
      const q = filter.query.toLowerCase().trim();
      results = results.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return results;
  }

  /**
   * Retrieves full content of an item by ID, validating its content hash before returning.
   */
  async getItem(id: string): Promise<KnowledgeItem | null> {
    const manifest = await this.loadManifest();
    const meta = manifest.items.find((i) => i.id === id || i.id === id.replace(/^\/+/, ''));
    if (!meta) return null;

    const ext = path.extname(meta.path);
    const objectPath = path.join(this.objectsDir, `${meta.sha256}${ext}`);

    let rawContent: string | null = null;
    let verified = false;
    let parsed: any = undefined;

    // 0. If item has sourceCode embedded directly in manifest
    if (meta.sourceCode) {
      rawContent = meta.sourceCode;
      verified = true;
    } else if (fs.existsSync(objectPath)) {
      // 1. Check local content-addressed cache
      rawContent = fs.readFileSync(objectPath, 'utf8');
    } else {
      // 2. Fetch raw object from CDN (target entrypoint if directory bundle)
      const fetchTarget = meta.entrypoint ? `${meta.path}/${meta.entrypoint}` : meta.path;
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${this.rawBaseUrl}/${fetchTarget}`, { signal: ctrl.signal });
        clearTimeout(timeout);

        if (res.ok) {
          rawContent = await res.text();
          // Write to content-addressed cache
          fs.mkdirSync(this.objectsDir, { recursive: true });
          fs.writeFileSync(objectPath, rawContent, 'utf8');
        }
      } catch {}
    }

    if (!rawContent) return null;

    // 3. Verify SHA-256 hash integrity if not already verified
    if (!verified) {
      let calculatedHash = computeHash(rawContent);

      if (meta.path.endsWith('.json')) {
        try {
          parsed = JSON.parse(rawContent);
          calculatedHash = computeHash(parsed);
        } catch {}
      }

      verified = calculatedHash === meta.sha256;
    }

    return {
      meta,
      rawContent,
      parsed,
      verified
    };
  }

  /**
   * Synchronize manifest and warm cache.
   */
  async sync(force = false): Promise<{ updated: boolean; count: number; source: 'network' | 'cache' | 'fallback' }> {
    const prev = this.readCachedManifest();
    const manifest = await this.loadManifest(force);
    const isNetwork = manifest.generatedAt !== prev?.generatedAt;

    return {
      updated: isNetwork,
      count: manifest.totalItems,
      source: isNetwork ? 'network' : prev ? 'cache' : 'fallback'
    };
  }

  private readCachedManifest(): KnowledgeManifest | null {
    try {
      if (fs.existsSync(this.manifestPath)) {
        return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
      }
    } catch {}
    return null;
  }

  private saveCachedManifest(manifest: KnowledgeManifest): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {}
  }
}
