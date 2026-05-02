export interface ParsedArgs extends Record<string, any> {
  _: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }

    const trimmed = value.slice(2);
    const equalIndex = trimmed.indexOf("=");

    if (equalIndex >= 0) {
      const key = trimmed.slice(0, equalIndex);
      const parsedValue = trimmed.slice(equalIndex + 1);
      assignArg(args, key, parsedValue);
      continue;
    }

    const nextValue = argv[index + 1];

    if (nextValue && !nextValue.startsWith("--")) {
      assignArg(args, trimmed, nextValue);
      index += 1;
      continue;
    }

    assignArg(args, trimmed, true);
  }

  return args;
}

export function asArray(value: any): any[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function splitCsv(values: any): string[] {
  return asArray(values)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function printAndExit(message: string, code: number = 0): never {
  const stream = code === 0 ? process.stdout : process.stderr;
  stream.write(`${message}\n`);
  process.exit(code);
}

export function requireArg(args: ParsedArgs, key: string, helpText: string): any {
  if (!args[key]) {
    printAndExit(helpText, 1);
  }

  return args[key];
}

function assignArg(args: ParsedArgs, key: string, value: any): void {
  if (Object.hasOwn(args, key)) {
    const current = args[key];
    args[key] = Array.isArray(current) ? [...current, value] : [current, value];
    return;
  }

  args[key] = value;
}
