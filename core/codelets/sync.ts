/**
 * Responsibility: Execute project synchronization.
 */
import { syncProject } from "../services/sync.ts";


export async function run(options: any, hub: any) {
  const result = await syncProject({
    projectRoot: hub.context.projectRoot,
    writeProjections: Boolean(options.writeProjections || options["write-projections"])
  });

  // Enforce protocol check
  const enforcer = hub.resolve("enforcer");
  const protocol = await enforcer.validateState();
  
  return {
    ...result,
    protocol
  };
}
