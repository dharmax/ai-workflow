import {it,expect} from 'bun:test';
import {runInProject as subject} from "./fixtures/greeting-project.ts";
it("Developer verifies work using the normal AI route",async()=>{
const run = subject(process.cwd(), ["bun", "test", "tests/us/reviewer-reliability.test.ts"]); expect(run.exitCode).toBe(0); expect(run.output).toContain("developer obtains independent verification");
});
