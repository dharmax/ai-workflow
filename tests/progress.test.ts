import { describe, it, expect } from 'bun:test';
import { Writable } from 'node:stream';
import { ProgressIndicator } from '../src/terminal/progress.ts';

describe('ProgressIndicator (ai-workflow Terminal UI)', () => {
  it('respects silent mode completely without writing', () => {
    let written = '';
    const mockStream = new Writable({
      write(chunk, _encoding, callback) {
        written += chunk.toString();
        callback();
      }
    }) as any;
    mockStream.isTTY = true;

    const progress = new ProgressIndicator({ silent: true, stream: mockStream });
    progress.start('Initializing');
    progress.update('Working');
    progress.renderBar(5, 10, 'testing');
    progress.stop('Done');

    expect(written).toBe('');
  });

  it('outputs clean newline steps when stream is not a TTY', () => {
    let written = '';
    const mockStream = new Writable({
      write(chunk, _encoding, callback) {
        written += chunk.toString();
        callback();
      }
    }) as any;
    mockStream.isTTY = false;

    const progress = new ProgressIndicator({ stream: mockStream });
    progress.start('Starting task');
    progress.update('Performing step 1');
    progress.renderBar(5, 10, 'files');
    progress.stop('Finished task', 'success');

    expect(written).toContain('➜ Starting task\n');
    expect(written).toContain('➜ Performing step 1\n');
    expect(written).toContain('[50%] (5/10) files\n');
    expect(written).toContain('✔ Finished task\n');
    // Must NOT contain ANSI escape sequences in non-TTY mode
    expect(written).not.toContain('\x1b[?25l');
    expect(written).not.toContain('\x1b[2K');
  });

  it('renders progress bar and cleans up cursor in TTY mode', () => {
    let written = '';
    const mockStream = new Writable({
      write(chunk, _encoding, callback) {
        written += chunk.toString();
        callback();
      }
    }) as any;
    mockStream.isTTY = true;
    mockStream.columns = 80;

    const progress = new ProgressIndicator({ stream: mockStream });
    progress.start('Scanning');
    expect(written).toContain('\x1b[?25l'); // Hidden cursor
    expect(written).toContain('Scanning');

    progress.renderBar(50, 100, 'processing');
    expect(written).toContain('50%');

    progress.stop('Completed', 'success');
    expect(written).toContain('\x1b[?25h'); // Restored cursor
    expect(written).toContain('Completed');
  });
});
