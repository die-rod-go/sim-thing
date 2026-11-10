import { clientMessageSchema, parseServerMessage } from "@village/shared";
import type { ClientMessage, ServerMessage } from "@village/shared";
import { clientConfig } from "../client-config";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface SimConnectionHandlers {
  onMessage: (message: ServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onProtocolError: (description: string) => void;
}

export function buildSocketUrl(location: { protocol: string; host: string }): string {
  const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${socketProtocol}//${location.host}${clientConfig.connection.path}`;
}

export function computeReconnectDelayMs(attempt: number): number {
  const { initialReconnectDelayMs, maxReconnectDelayMs, reconnectBackoffFactor } =
    clientConfig.connection;
  return Math.min(initialReconnectDelayMs * reconnectBackoffFactor ** attempt, maxReconnectDelayMs);
}

/** One WebSocket to the sim server that reconnects with exponential backoff until stopped. */
export class SimConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private isStopped = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SimConnectionHandlers,
  ) {}

  start(): void {
    this.isStopped = false;
    this.openSocket();
  }

  stop(): void {
    this.isStopped = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  /** Validates and sends a control; returns false when the socket is not open. */
  send(message: ClientMessage): boolean {
    const validMessage = clientMessageSchema.parse(message);
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(validMessage));
    return true;
  }

  private openSocket(): void {
    this.handlers.onStatusChange("connecting");
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.handlers.onStatusChange("open");
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.handleRawMessage(event.data);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.handlers.onStatusChange("closed");
      this.scheduleReconnect();
    });
  }

  private handleRawMessage(data: unknown): void {
    if (typeof data !== "string") {
      this.handlers.onProtocolError("Received a non-text WebSocket message");
      return;
    }
    let message: ServerMessage;
    try {
      message = parseServerMessage(data);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.handlers.onProtocolError(`Unreadable server message: ${reason}`);
      return;
    }
    this.handlers.onMessage(message);
  }

  private scheduleReconnect(): void {
    if (this.isStopped) return;
    const delayMs = computeReconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isStopped) this.openSocket();
    }, delayMs);
  }
}
