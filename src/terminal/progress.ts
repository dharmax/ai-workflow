/**
 * Responsibility: Robust Terminal Progress Indicator, Spinner, and Progress Bar.
 * Scope: Clean TTY/non-TTY handling, cursor management, stderr streaming, and flicker-free rendering.
 */

export interface ProgressOptions {
  silent?: boolean;
  stream?: NodeJS.WriteStream;
}

export class ProgressIndicator {
  private timer: Timer | null = null;
  private frameIndex = 0;
  private message = '';
  private isTTY: boolean;
  private stream: NodeJS.WriteStream;
  private silent: boolean;
  private stopped = false;
  private mode: 'spinner' | 'bar' = 'spinner';
  private current = 0;
  private total = 0;
  private barLabel = '';

  private static frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private static registeredCleanup = false;

  constructor(options: ProgressOptions = {}) {
    this.stream = options.stream || process.stderr;
    this.isTTY = Boolean(this.stream.isTTY);
    this.silent = Boolean(options.silent);

    if (!ProgressIndicator.registeredCleanup && this.isTTY) {
      ProgressIndicator.registeredCleanup = true;
      const cleanup = () => {
        try {
          process.stderr.write('\x1b[?25h\r\x1b[2K');
        } catch {}
      };
      process.on('exit', cleanup);
      process.on('SIGINT', () => {
        cleanup();
        process.exit(130);
      });
      process.on('SIGTERM', () => {
        cleanup();
        process.exit(143);
      });
    }
  }

  start(initialMessage = ''): this {
    if (this.silent || this.stopped) return this;
    this.mode = 'spinner';
    this.message = initialMessage;

    if (!this.isTTY) {
      if (initialMessage) this.stream.write(`➜ ${initialMessage}\n`);
      return this;
    }

    this.stream.write('\x1b[?25l'); // hide cursor
    this.render();

    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % ProgressIndicator.frames.length;
      this.render();
    }, 80);

    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    return this;
  }

  update(message: string): this {
    if (this.silent || this.stopped) return this;
    this.mode = 'spinner';
    this.message = message;
    if (!this.isTTY) {
      this.stream.write(`➜ ${message}\n`);
    } else {
      this.render();
    }
    return this;
  }

  renderBar(current: number, total: number, label = ''): void {
    if (this.silent || this.stopped) return;
    this.mode = 'bar';
    this.current = current;
    this.total = total;
    this.barLabel = label;

    const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 100;
    if (!this.isTTY) {
      this.stream.write(`[${pct}%] (${current}/${total}) ${label}\n`);
      return;
    }

    this.render();
  }

  stop(finalMessage?: string, symbol: 'success' | 'fail' | 'info' = 'success'): void {
    if (this.stopped) return;
    this.stopped = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.silent) return;

    if (this.isTTY) {
      this.stream.write('\r\x1b[2K\x1b[?25h'); // clear line and restore cursor
      if (finalMessage) {
        const icon = symbol === 'success' ? '\x1b[32m✔\x1b[0m' : symbol === 'fail' ? '\x1b[31m✖\x1b[0m' : '\x1b[36mℹ\x1b[0m';
        this.stream.write(`${icon} ${finalMessage}\n`);
      }
    } else if (finalMessage) {
      this.stream.write(`${symbol === 'success' ? '✔' : symbol === 'fail' ? '✖' : 'ℹ'} ${finalMessage}\n`);
    }
  }

  private render(): void {
    if (!this.isTTY) return;
    const maxCols = this.stream.columns || 80;
    const frame = ProgressIndicator.frames[this.frameIndex];

    if (this.mode === 'bar') {
      const pct = this.total > 0 ? Math.min(100, Math.round((this.current / this.total) * 100)) : 100;
      const width = 20;
      const filled = Math.round((pct / 100) * width);
      const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
      const text = `\r\x1b[2K\x1b[36m${frame} ${bar}\x1b[0m \x1b[1m${pct}%\x1b[0m \x1b[90m(${this.current}/${this.total})\x1b[0m ${this.barLabel}`;
      this.stream.write(text.slice(0, maxCols - 1));
    } else {
      const line = `\r\x1b[2K\x1b[36m${frame}\x1b[0m ${this.message}`;
      this.stream.write(line.slice(0, maxCols - 1));
    }
  }
}
