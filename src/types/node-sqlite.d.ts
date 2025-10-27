declare module 'node:sqlite' {
	interface DatabaseSyncOptions {
		open?: boolean;
		readOnly?: boolean;
		enableForeignKeyConstraints?: boolean;
		enableDoubleQuotedStringLiterals?: boolean;
		allowExtension?: boolean;
		timeout?: number;
		readBigInts?: boolean;
		returnArrays?: boolean;
		allowBareNamedParameters?: boolean;
		allowUnknownNamedParameters?: boolean;
	}

	interface StatementRunInfo {
		changes: number | bigint;
		lastInsertRowid: number | bigint;
	}

			export class StatementSync {
				all<T = any>(...parameters: unknown[]): T;
				get<T = any>(...parameters: unknown[]): T | undefined;
		run(...parameters: unknown[]): StatementRunInfo;
		close(): void;
	}

	export class DatabaseSync {
		constructor(path: string, options?: DatabaseSyncOptions);
		exec(sql: string): void;
		prepare(sql: string): StatementSync;
		close(): void;
	}
}
