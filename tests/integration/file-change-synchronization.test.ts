import {it, expect, spyOn} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../../src/graph/store.ts';
import {WorkflowEntity} from '../../src/model/workflow-entity.ts';
import {FileNode, TestNode, UserStory} from '../../src/model/ontology.ts';
import {ensureAstFresh, indexCodebase} from '../../src/graph/indexer.ts';
import {currentTestEvidence, recordTestOutcome} from '../../src/graph/test-artifacts.ts';

it('developer changes a source file; graph dependents learn of it and existing test proof becomes stale', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-file-change-us-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'src/core.ts'), 'export const value = 2;\n');
    fs.writeFileSync(path.join(root, 'src/consumer.ts'), "import {value} from './core.ts'; export const answer = () => value;\n");
    fs.writeFileSync(path.join(root, 'tests/consumer.test.ts'),
        "import {it,expect} from 'bun:test'; import {answer} from '../src/consumer.ts'; it('returns the answer',()=>expect(answer()).toBe(2));\n");

    const store = new WorkflowStore(root);
    try {
        await indexCodebase(store, root);
        await store.upsertEntity(UserStory.dcr, {
            id: 'US-FILE-CHANGE', title: 'Developer synchronizes an externally edited source file',
            actor: 'Developer', intent: 'Keep graph dependencies and test evidence truthful',
            initialState: 'The source, importer, and passing test are indexed',
            action: 'Change the source file and refresh the project graph',
            expectedResult: 'The new source hash is indexed, dependent files and tests are notified, and old test evidence is not current',
            status: 'accepted'
        });
        const testId = 'test:tests/consumer.test.ts';
        const test = await store.getEntity<TestNode>(testId, TestNode.dcr);
        expect(test).not.toBeNull();
        await store.withTestArtifactWrite(testId, async () => {
            await store.relate(testId, 'verifies', 'US-FILE-CHANGE');
            await store.relate(testId, 'verifies', 'src/consumer.ts');
        });
        const run = Bun.spawnSync(['bun', 'test', 'tests/consumer.test.ts'], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
        expect(run.exitCode, run.stderr.toString()).toBe(0);
        await recordTestOutcome(store, ['tests/consumer.test.ts'], {
            passed: run.success, exitCode: run.exitCode,
            command: ['bun', 'test', 'tests/consumer.test.ts'],
            output: run.stdout.toString() + run.stderr.toString()
        });
        expect((await currentTestEvidence(store, [testId]))[0]?.passed).toBe(true);
        const previous = await store.getEntity<FileNode>('src/core.ts', FileNode.dcr);
        const originalHash = previous?.hash;
        const runTime = (await store.getEntity<TestNode>(testId, TestNode.dcr))?.lastRun;
        const notifiedFiles: string[] = [], notifiedTests: string[] = [];
        const originalFile = FileNode.prototype.handleEvent;
        const originalBase = WorkflowEntity.prototype.handleEvent;
        const fileSpy = spyOn(FileNode.prototype, 'handleEvent').mockImplementation(function (this: FileNode, type, source, data, visited) {
            if (type === 'fileChanged') notifiedFiles.push(this.path ?? '');
            return originalFile.call(this, type, source, data, visited);
        });
        const baseSpy = spyOn(WorkflowEntity.prototype, 'handleEvent').mockImplementation(function (this: WorkflowEntity, type, source, data, visited) {
            if (type === 'fileChanged' && this instanceof TestNode) notifiedTests.push(this.filePath ?? '');
            return originalBase.call(this, type, source, data, visited);
        });
        try {
            expect((await ensureAstFresh(store, root)).updatedFiles).toEqual([]);
            expect(notifiedFiles).toEqual([]);
            fs.writeFileSync(path.join(root, 'src/core.ts'), 'export const value = 3;\n');
            const change = await ensureAstFresh(store, root);
            expect(change.updatedFiles).toContain('src/core.ts');
            expect(notifiedFiles).toContain('src/core.ts');
            expect(notifiedFiles).toContain('src/consumer.ts');
            expect(notifiedTests).toContain('tests/consumer.test.ts');
        } finally {
            baseSpy.mockRestore();
            fileSpy.mockRestore();
        }
        const updated = await store.getEntity<FileNode>('src/core.ts', FileNode.dcr);
        expect(updated?.hash).toBeDefined();
        expect(updated?.hash).not.toBe(originalHash);
        expect((await currentTestEvidence(store, [testId]))[0]?.passed).toBe(false);
        expect((await store.getEntity<TestNode>(testId, TestNode.dcr))?.lastRun).toBe(runTime);
        const rerun = Bun.spawnSync(['bun', 'test', 'tests/consumer.test.ts'], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
        expect(rerun.success).toBe(false);
        expect((await store.getIncoming('US-FILE-CHANGE', 'verifies')).length).toBe(1);
    } finally {
        store.close();
        fs.rmSync(root, {recursive: true, force: true});
    }
}, 30_000);
