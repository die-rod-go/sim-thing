type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function readMinimumLevel(): LogLevel {
  const requested = process.env.LOG_LEVEL;
  return requested === "debug" || requested === "warn" || requested === "error"
    ? requested
    : "info";
}

const minimumLevel = readMinimumLevel();

function write(level: LogLevel, scope: string, message: string, context?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel]) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const line = `${timestamp} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const output = level === "error" || level === "warn" ? console.error : console.log;
  if (context === undefined) output(line);
  else output(line, context);
}

export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, context) => write("debug", scope, message, context),
    info: (message, context) => write("info", scope, message, context),
    warn: (message, context) => write("warn", scope, message, context),
    error: (message, context) => write("error", scope, message, context),
  };
}
