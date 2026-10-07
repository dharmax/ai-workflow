# AIWF Agency Constitution

**Authority:** architectural invariant for every Actor, discovery, tool, skill, codelet, routing and shell change.

AIWF wraps a general reasoning model. Its infrastructure must make that model **more capable, grounded, safe and efficient** — never reduce solvable goals to a pre-enumerated capability catalog.

## Constitutional rules

1. **The Actor is the general problem solver.**  
   The user supplies a goal. The Actor determines what it needs to know or do, chooses a method, gathers evidence, acts, observes, replans and finishes.

2. **Goal precedes capability.**  
   Never begin architecture from “which tool handles this phrase?”. Begin from the desired outcome and required evidence/actions. Capabilities are means.

3. **General knowledge is valid methodology; project facts require evidence.**  
   The model may already know algorithms, engineering practice, project-management concepts, debugging methods, etc. It may use that knowledge to decide *how* to solve a problem. Claims about the current repository/project/runtime must be grounded in observations from this run or preserved session evidence.

4. **Discovery is an optimization, never a competence boundary.**  
   Semantic discovery may expose efficient specialized capabilities. Zero, failed, slow or misleading discovery must make AIWF less efficient at worst — not unable to solve an otherwise solvable goal.

5. **Bootstrap competence must be discovery-independent.**  
   From the first Actor step, a tiny universal substrate must be sufficient to inspect the environment, execute general project operations, and construct a temporary helper when no specialized capability exists.

6. **Self-extension is a first-class escape hatch.**  
   If no existing capability fits, the Actor may compose primitives or create a temporary script/codelet/helper. Persistence/promotion is optional and justified by reuse; one-off work should remain ephemeral.

7. **External knowledge is a legitimate escape hatch.**  
   If the model does not know the method, it may use available documentation/web/external knowledge facilities. Lack of one external provider is not proof that the goal is impossible if another route remains.

8. **Modes optimize; they do not define competence.**  
   DEV/PRODUCT/DESIGN/TRIAGE may influence prompts, routing and preferred tools. A wrong or unavailable mode classification must not make a generally solvable request insoluble.

9. **Optimizations may not become prerequisites.**  
   Registry ranking, System-1, semantic tags, cached context, specialist tools, codelets, skills and model routing may accelerate or improve work. None may become a mandatory entrance gate unless the goal genuinely depends on it.

10. **Tool failure is evidence, not surrender permission.**  
    A failed/absent tool means “replan”. AIWF may claim inability only after the concrete required evidence/action is genuinely inaccessible, unsafe, unauthorized, or requires user input.

11. **No phrase-shaped architecture.**  
    Never add production logic for “second”, “least”, “critical path”, a specific acceptance prompt, or another linguistic symptom when general reasoning + evidence can solve the class of problem.

12. **Outcome proves agency.**  
    Tool-selection, classifier and unit tests are mechanism evidence only. Actor competence is accepted only through realistic end-to-end journeys on the ordinary configured route.

## Bootstrap-completeness test

A proposed bootstrap substrate is acceptable only if, with semantic discovery disabled, the Actor can still:

- inspect project/repository evidence;
- execute deterministic CLI/shell operations;
- combine multiple observations;
- create and execute a temporary helper for a novel computation;
- recover from a failed operation;
- answer a grounded unfamiliar request.

The smallest substrate that passes wins.

## Merge law

Any Actor/discovery/tool-routing change that violates this constitution or fails the Agency Gate in `docs/agency-restoration-plan.md` **must not merge**, regardless of component test coverage.

When an optimization conflicts with agency, agency wins.
