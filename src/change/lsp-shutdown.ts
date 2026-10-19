import type {ChildProcess} from 'node:child_process';
import type {MessageConnection} from 'vscode-jsonrpc/node';

/** Bound protocol shutdown, dispose the transport, then reap the owned process group. */
export async function closeLspTransport(connection: MessageConnection | null, child: ChildProcess | null): Promise<void> {
 async function bounded(work: Promise<unknown>, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   await Promise.race([work, new Promise<void>(resolve => { timer = setTimeout(resolve, milliseconds); })]);
  } catch {
   // A closed/broken transport still needs disposal and process cleanup.
  } finally { clearTimeout(timer); }
 }
 const exited = child ? new Promise<void>(resolve => {
  if (child.exitCode !== null || child.signalCode !== null) resolve();
  else { child.once('exit', () => resolve()); child.once('error', () => resolve()); }
 }) : Promise.resolve();
 try {
  if (connection) await bounded((async () => {
   await connection.sendRequest('shutdown');
   await connection.sendNotification('exit');
  })(), 500);
 } finally {
  try { connection?.dispose(); } catch {}
  if (child) {
   const signal = (value: NodeJS.Signals) => {
    try {
     if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, value);
     else if (child.exitCode === null && child.signalCode === null) child.kill(value);
    } catch (error) {
     if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
   };
   try {
    signal('SIGTERM');
    await bounded(exited, 250);
   } finally {
    // The sidecar may own tsserver children even after the launcher exits.
    signal('SIGKILL');
    await bounded(exited, 250);
    child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
   }
  }
 }
}
