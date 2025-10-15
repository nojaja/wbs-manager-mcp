import readline from 'readline';

/**
 * MessageHandler is called for each received line from stdin.
 * @param {string} line - received raw line
 */
export type MessageHandler = (line: string) => void;

/**
 * StdioTransport
 * Read lines from stdin (using readline) and provide a send() method to write
 * one-line JSON messages to stdout. Emits debug logs to stderr.
 */
import Logger from '../logger';

/**
 * StdioTransport provides line-based stdin reading and stdout JSON writing.
 */
export class StdioTransport {
  private rl: readline.Interface | null = null;
  private handler: MessageHandler | null = null;

  /**
   * Start listening to stdin line events.
   * @returns {void}
   */
  start() {
    this.rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    this.rl.on('line', (line) => {
      if (this.handler) this.handler(line);
    });

    this.rl.on('close', () => {
      Logger.info('[MCP Server] StdioTransport: stdin closed');
      process.exit(0);
    });
  }

  /**
   * Register a handler to be called for each incoming line.
   * @param {MessageHandler} handler
   * @returns {void}
   */
  onMessage(handler: MessageHandler) {
    this.handler = handler;
  }

  /**
   * Send an object as a single-line JSON string to stdout.
   * @param {any} obj
   * @returns {void}
   */
  send(obj: any) {
    const str = JSON.stringify(obj);
    // debug friendly pretty print to stderr
    try {
      Logger.debug('[MCP Server] Sending', null, { pretty: JSON.stringify(obj, null, 2) });
    } catch (e) {
      Logger.error('[MCP Server] Sending (stringify failed)', null, { err: e instanceof Error ? e.message : String(e) });
    }
    process.stdout.write(str + '\n');
  }

  /**
   * Stop the transport and cleanup resources.
   * @returns {void}
   */
  stop() {
    this.rl?.close();
    this.rl = null;
    this.handler = null;
  }
}
