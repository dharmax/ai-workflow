#!/usr/bin/env node
import { runCodeletScript } from "./_run-codelet.ts";

await runCodeletScript({ codeletId: "project-summary" });
