import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';

export type SpawnOptions = {
    // absolute or project-relative path to node executable or script
    command?: string;
    args?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
};

export class CliRunner extends EventEmitter {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private stdoutBuffer = '';
    private stdoutFragment = '';
    private stdoutLines: string[] = [];
    private stderrBuffer = '';
    private _autoExitTimer: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    private exitWaitTimeout = 2000;

    start(options: SpawnOptions = {}, exitWaitTimeout?: number) {
        if (this.proc) throw new Error('process already started');

        const cwd = options.cwd || process.cwd();
        // If the caller provided an executable command, use it directly
        let command: string;
        let args: string[];
        if (options.command) {
            command = options.command;
            args = options.args || [];
        } else {
            // Do not include repository-specific fallbacks here. Require caller to provide the command.
            throw new Error('No command provided. CliRunner.start requires options.command to be set.');
        }

        // If the caller provided an env object, use it as-is. Otherwise use process.env.
        // Do NOT merge the two; caller's env replaces the parent's env when provided.
        const childEnv = options.env ? options.env : process.env;

        this.proc = spawn(command, args, {
            cwd,
            env: childEnv,
            stdio: 'pipe',
        });

        this.proc.stdout.setEncoding('utf8');

        this.proc.stdout.on('data', (chunk: string) => {
            this.stdoutBuffer += chunk;
            // split into full lines and keep fragment for the last partial line
            this.stdoutFragment += chunk;
            const parts = this.stdoutFragment.split('\n');
            this.stdoutFragment = parts.pop() || '';
            for (const p of parts) {
                const line = p.trim();
                if (line) this.stdoutLines.push(line);
            }
            this.emit('stdout', chunk);
        });

        this.proc.stderr.on('data', (chunk: string) => {
            this.stderrBuffer += chunk;
            this.emit('stderr', chunk);
        });

        this.proc.on('exit', (code, signal) => {
            this.emit('exit', { code, signal });
            this.proc = null;
            if (this._autoExitTimer) {
                clearTimeout(this._autoExitTimer);
                this._autoExitTimer = null;
            }
        });

        this.proc.on('error', (err) => this.emit('error', err));

        if (typeof exitWaitTimeout === 'number') {
            this.exitWaitTimeout = exitWaitTimeout;
            // schedule auto exit: if process still running after timeout, try to close it
            this._autoExitTimer = setTimeout(() => {
                if (this.proc) {
                    // Emit error to indicate auto-exit occurred (make tests fail on auto-exit)
                    this.emit('error', new Error('auto-exit timeout reached'));
                    // still attempt graceful shutdown
                    this.sendCtrlC().catch(() => { });
                }
            }, this.exitWaitTimeout);
        }

        return this;
    }

    write(data: string) {
        if (!this.proc || !this.proc.stdin.writable) throw new Error('process not started or stdin not writable');
        this.proc.stdin.write(data);
    }

    writeln(data: string) {
        this.write(data + '\n');
    }

    // internal primitive used by both modes
    private _readStdoutOnce(timeout = 2000): Promise<string> {
        // If queued lines are available, return them immediately and clear the queue
        if (this.stdoutLines.length > 0) {
            const out = this.stdoutLines.join('\n');
            this.stdoutLines = [];
            return Promise.resolve(out);
        }

        // If process not running and no queued lines, reject with timeout
        if (!this.proc) return Promise.reject(new Error('stdout timeout'));

        return new Promise((resolve, reject) => {
            if (this.stdoutLines.length > 0) {
                const out = this.stdoutLines.join('\n');
                this.stdoutLines = [];
                return resolve(out);
            }

            const onData = () => {
                if (this.stdoutLines.length > 0) {
                    this.removeListener('stdout', onData);
                    clearTimeout(t);
                    const out = this.stdoutLines.join('\n');
                    this.stdoutLines = [];
                    resolve(out);
                }
            };
            const t = setTimeout(() => {
                this.removeListener('stdout', onData);
                this.stdoutLines = [];
                reject(new Error('stdout timeout'));
            }, timeout);
            this.on('stdout', onData);
        });
    }

    // read a single queued stdout line (don't clear other queued lines)
    private _readStdoutLineOnce(timeout = 2000): Promise<string> {
        // If queued lines are available, return one immediately
        if (this.stdoutLines.length > 0) {
            return Promise.resolve(this.stdoutLines.shift()!);
        }

        // If process not running and no queued lines, reject with timeout
        if (!this.proc) return Promise.reject(new Error('stdout line timeout'));

        return new Promise((resolve, reject) => {
            if (this.stdoutLines.length > 0) return resolve(this.stdoutLines.shift()!);

            const onData = () => {
                if (this.stdoutLines.length > 0) {
                    this.removeListener('stdout', onData);
                    clearTimeout(t);
                    resolve(this.stdoutLines.shift()!);
                }
            };
            const t = setTimeout(() => {
                this.removeListener('stdout', onData);
                reject(new Error('stdout line timeout'));
            }, timeout);
            this.on('stdout', onData);
        });
    }

    /**
     * readStdout(timeout?: number):
     *  - if called with a number, returns Promise<string> (existing behavior)
     *  - if called with no args, returns a helper with .toJson(timeout?) and .toLines(timeout?) methods
     */
    readStdout(): { toJson: (timeout?: number) => Promise<any>; toLines: (timeout?: number) => Promise<string[]>; clear: () => void };
    readStdout(timeout: number): Promise<string>;
    readStdout(timeout?: number): any {
        if (typeof timeout === 'number') return this._readStdoutOnce(timeout);

        const self = this;
        return {
            toLines: async (t = 2000) => {
                const buf = await self._readStdoutOnce(t);
                if (!buf) return [];
                return buf.split('\n').map((s) => s.trim()).filter(Boolean);
            },
            toJson: async (t = 2000) => {
                const deadline = Date.now() + t;
                while (Date.now() < deadline) {
                    const remaining = Math.max(0, deadline - Date.now());
                    const line = await self._readStdoutLineOnce(remaining);
                    if (!line) break;
                    try {
                        const obj = JSON.parse(line);
                        if (obj) return obj;
                    } catch (e) {
                        // ignore and continue to next line until timeout
                        continue;
                    }
                }
                throw new Error('no JSON found in stdout within timeout');
            },
            clear: () => {
                // discard queued lines and any fragment buffer
                self.stdoutLines = [];
                self.stdoutFragment = '';
                self.stdoutBuffer = '';
            },
        };
    }




    readStderr() {
        return this.stderrBuffer;
    }

    // send Ctrl+C (SIGINT) to child process and wait for exit. Returns a promise that resolves when the child exits.
    sendCtrlC(timeout?: number): Promise<void> {
        const wait = typeof timeout === 'number' ? timeout : this.exitWaitTimeout;

        return new Promise((resolve, reject) => {
            if (!this.proc) return resolve();

            const onExit = () => {
                clearTimeout(to);
                this.removeListener('error', onError);
                resolve();
            };
            const onError = (e: any) => {
                clearTimeout(to);
                this.removeListener('exit', onExit);
                reject(e);
            };

            const to = setTimeout(() => {
                // timeout reached; try force kill and resolve/reject accordingly
                try {
                    if (this.proc) {
                        if (process.platform === 'win32') {
                            const tk = spawn('taskkill', ['/PID', String(this.proc.pid), '/T', '/F']);
                            tk.on('close', () => {
                                resolve();
                            });
                        } else {
                            this.proc.kill('SIGKILL' as any);
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                } catch (e) {
                    reject(e);
                }
            }, wait);

            this.once('exit', onExit);
            this.once('error', onError);

            // Best effort: first close stdin to trigger 'end' handler in the child (the server exits on stdin end)
            try {
                this.proc.stdin.end();
            } catch (e) {
                // ignore
            }

            // then send SIGINT
            try {
                this.proc.kill('SIGINT' as any);
            } catch (e) {
                // ignore
            }
        });
    }

    dispose() {
        if (!this.proc) return;
        try {
            this.proc.kill();
        } catch (e) {
            // ignore
        }
        this.proc = null;
    }
}

export default CliRunner;
