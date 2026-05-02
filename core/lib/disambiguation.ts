/**
 * @file disambiguation.js
 * @brief Auto-generated header for disambiguation.js. Needs detailed responsibility and scope.
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
export async function promptMultiChoice({ message, options, defaultIndex }) {
  const rl = readline.createInterface({ input, output });
  console.log(message);
  options.forEach((opt, i) => console.log(`${i + 1}. ${opt.label} ${i === defaultIndex ? "(recommended)" : ""}`));
  const answer = await rl.question("Select an option: ");
  rl.close();
  return options[parseInt(answer) - 1] || options[defaultIndex];
}