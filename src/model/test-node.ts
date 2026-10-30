/**
 * Responsibility: Own the TestNode domain entity and its contracts.
 * Scope: Test execution, Story evidence and technical proof references.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface TestData extends BaseEntityData {
  targetPath: string;
  framework?: string;
  lastRun?: string;
  passed?: boolean;
}

export class TestNode extends WorkflowEntity {
    declare status?: string
    declare filePath?: string
    declare targetPath?: string
    declare framework?: string
    declare lastRun?: string
    declare passed?: boolean
    declare failure?: string
    declare exitCode?: number
    declare durationMs?: number
    declare command?: string[]
    declare output?: string
    declare executionHashes?: Record<string, string>
    declare fixturePath?: string
    declare interfaceName?: string
    declare storyVersion?: number
    declare testState?: 'skipped' | 'not-run' | 'expected-red' | 'green' | 'blocked'
    declare testStateReason?: string
    declare testSourceHash?: string
    declare fixtureHash?: string
    declare storyBasisHash?: string
    declare technicalProofs?: import('./test-proof-types.ts').TechnicalProof[]

    static template = {
        ...baseTemplate,
        filePath: passthroughValidator,
        targetPath: passthroughValidator,
        framework: passthroughValidator,
        lastRun: passthroughValidator,
        passed: passthroughValidator,
        failure: passthroughValidator,
        exitCode: passthroughValidator,
        durationMs: passthroughValidator,
        command: passthroughValidator,
        output: passthroughValidator,
        executionHashes: passthroughValidator,
        fixturePath: passthroughValidator,
        interfaceName: passthroughValidator,
        storyVersion: passthroughValidator,
        testState: passthroughValidator,
        testStateReason: passthroughValidator,
        testSourceHash: passthroughValidator,
        fixtureHash: passthroughValidator,
        storyBasisHash: passthroughValidator,
        technicalProofs: passthroughValidator
    }
    static readonly dcr = new EntityDcr(TestNode, TestNode.template, "TestNode")
}
