#!/usr/bin/env node

import path from "node:path";
import { generateManualHtml } from "./generate-manual-html.ts";

const root = process.cwd();
const result = await generateManualHtml({ root });
process.stdout.write(`${path.relative(root, result.output).replace(/\\/g, "/")}\n`);
