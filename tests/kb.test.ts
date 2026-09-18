import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { canonical, computeHash } from '../src/kb/canonical.ts';
import { KnowledgeBaseClient } from '../src/kb/client.ts';
import type { KnowledgeManifest } from '../src/kb/types.ts';
import { initializeTools, registry } from '../src/tools/index.ts';

describe('Content-Addressable Knowledgebase Client & Registry', () => {
  let tempCacheDir: string;

  beforeEach(() => {
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-kb-test-'));
    initializeTools();
  });

  afterEach(() => {
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  });

  it('should compute identical canonical hashes regardless of key order or line endings', () => {
    const objA = { b: 'world', a: 'hello', tags: ['one', 'two'] };
    const objB = { a: 'hello', b: 'world', tags: ['one', 'two'] };

    expect(canonical(objA)).toBe(canonical(objB));
    expect(computeHash(objA)).toBe(computeHash(objB));

    const textCRLF = 'Line 1\r\nLine 2\r\n';
    const textLF = 'Line 1\nLine 2\n';
    expect(computeHash(textCRLF)).toBe(computeHash(textLF));
  });

  it('should search knowledgebase items with filters', async () => {
    const client = new KnowledgeBaseClient({ cacheDir: tempCacheDir });

    const dummyManifest: KnowledgeManifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      repo: 'dharmax/knowledgebase',
      totalItems: 3,
      items: [
        {
          id: 'patterns/pubsub',
          type: 'pattern',
          title: 'PubSub Architecture',
          description: 'Decoupled event communication',
          target: 'universal',
          tags: ['pubsub', 'events'],
          path: 'patterns/pubsub.md',
          sha256: 'abc123',
          sizeBytes: 100
        },
        {
          id: 'services/ollama',
          type: 'service',
          title: 'Ollama Service',
          description: 'Linux service unit for Ollama',
          target: 'ai-cli',
          tags: ['ollama', 'systemd', 'linux'],
          path: 'services/ollama.yaml',
          sha256: 'def456',
          sizeBytes: 200
        },
        {
          id: 'skills/port-kill',
          type: 'skill',
          title: 'Port Kill',
          description: 'Kill process on port',
          target: 'ai-cli',
          tags: ['port', 'linux'],
          path: 'skills/port-kill.json',
          sha256: '789ghi',
          sizeBytes: 300
        }
      ]
    };

    fs.mkdirSync(tempCacheDir, { recursive: true });
    fs.writeFileSync(path.join(tempCacheDir, 'manifest.json'), JSON.stringify(dummyManifest, null, 2), 'utf8');

    // 1. Search by keyword
    const searchRes = await client.search({ query: 'Ollama' });
    expect(searchRes.length).toBe(1);
    expect(searchRes[0].id).toBe('services/ollama');

    // 2. Filter by type
    const patterns = await client.search({ type: 'pattern' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].id).toBe('patterns/pubsub');

    // 3. Filter by tag
    const linuxItems = await client.search({ tag: 'linux' });
    expect(linuxItems.length).toBe(2);
  });

  it('should verify hash integrity on item retrieval from cache', async () => {
    const client = new KnowledgeBaseClient({ cacheDir: tempCacheDir });
    const content = '# Verified Architecture Pattern\n\nAlways use PubSub.';
    const validHash = computeHash(content);

    const dummyManifest: KnowledgeManifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      repo: 'dharmax/knowledgebase',
      totalItems: 1,
      items: [
        {
          id: 'patterns/pubsub-pattern',
          type: 'pattern',
          title: 'PubSub Architecture',
          description: 'Decoupled event communication',
          target: 'universal',
          tags: ['pubsub'],
          path: 'patterns/pubsub-pattern.md',
          sha256: validHash,
          sizeBytes: content.length
        }
      ]
    };

    // Save manifest and object in cache
    fs.mkdirSync(path.join(tempCacheDir, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(tempCacheDir, 'manifest.json'), JSON.stringify(dummyManifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(tempCacheDir, 'objects', `${validHash}.md`), content, 'utf8');

    const item = await client.getItem('patterns/pubsub-pattern');
    expect(item).not.toBeNull();
    expect(item?.verified).toBe(true);
    expect(item?.meta.sha256).toBe(validHash);
    expect(item?.rawContent).toContain('Always use PubSub');
  });

  it('should detect tampered content with hash mismatch', async () => {
    const client = new KnowledgeBaseClient({ cacheDir: tempCacheDir });
    const originalHash = '1111111111111111111111111111111111111111111111111111111111111111';
    const tamperedContent = '# Tampered Content';

    const dummyManifest: KnowledgeManifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      repo: 'dharmax/knowledgebase',
      totalItems: 1,
      items: [
        {
          id: 'patterns/tampered',
          type: 'pattern',
          title: 'Tampered Pattern',
          description: 'Tampered test',
          target: 'universal',
          tags: ['test'],
          path: 'patterns/tampered.md',
          sha256: originalHash,
          sizeBytes: tamperedContent.length
        }
      ]
    };

    fs.mkdirSync(path.join(tempCacheDir, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(tempCacheDir, 'manifest.json'), JSON.stringify(dummyManifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(tempCacheDir, 'objects', `${originalHash}.md`), tamperedContent, 'utf8');

    const item = await client.getItem('patterns/tampered');
    expect(item).not.toBeNull();
    expect(item?.verified).toBe(false); // Hash mismatch detected!
  });

  it('should have search_knowledgebase and get_knowledge_item tools registered', async () => {
    const searchTool = registry.get('search_knowledgebase');
    const getTool = registry.get('get_knowledge_item');

    expect(searchTool).toBeDefined();
    expect(getTool).toBeDefined();
    expect(searchTool?.category).toBe('kb');
    expect(getTool?.category).toBe('kb');

    const ctx = { store: {} as any, projectRoot: tempCacheDir };
    const searchRes = await searchTool!.execute({ query: 'pubsub' }, ctx);
    expect(searchRes.items).toBeDefined();
    expect(Array.isArray(searchRes.items)).toBe(true);
  });

  it('should retrieve directory bundle skill with embedded sourceCode and verify integrity', async () => {
    const client = new KnowledgeBaseClient({ cacheDir: tempCacheDir });
    const dummyManifest: KnowledgeManifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      repo: 'dharmax/knowledgebase',
      totalItems: 1,
      items: [
        {
          id: 'skills/generate-image-sd',
          type: 'skill',
          title: 'Local SDXL Image Generation',
          description: 'SDXL skill bundle',
          target: 'universal',
          tags: ['image', 'sdxl'],
          path: 'skills/generate-image-sd',
          entrypoint: 'run.ts',
          files: ['skill.json', 'run.ts', 'skill.test.ts'],
          sourceCode: 'export default async function run(ctx) { return { ok: true }; }',
          requirements: { daemons: ['http://lotus:7860/sdapi/v1/sd-models'] },
          sha256: '9999999999999999999999999999999999999999999999999999999999999999',
          sizeBytes: 1024
        }
      ]
    };

    fs.writeFileSync(path.join(tempCacheDir, 'manifest.json'), JSON.stringify(dummyManifest, null, 2), 'utf8');

    const item = await client.getItem('skills/generate-image-sd');
    expect(item).not.toBeNull();
    expect(item?.meta.id).toBe('skills/generate-image-sd');
    expect(item?.meta.entrypoint).toBe('run.ts');
    expect(item?.rawContent).toContain('export default async function run');
    expect(item?.verified).toBe(true);
  });
});
