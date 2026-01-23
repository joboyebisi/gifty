import { EventEmitter } from "events";

export enum AgentType {
  COORDINATOR = "coordinator",
  BIRTHDAY = "birthday",
  FINANCE = "finance",
  COMMERCE = "commerce",
  PROFILER = "profiler",
}

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType | "all";
  type: string;
  payload: any;
  timestamp: number;
}

export class AgentBus extends EventEmitter {
  private static instance: AgentBus;

  private constructor() {
    super();
  }

  public static getInstance(): AgentBus {
    if (!AgentBus.instance) {
      AgentBus.instance = new AgentBus();
    }
    return AgentBus.instance;
  }

  public publish(message: AgentMessage) {
    // Emit specific event for targeted agent
    if (message.to !== "all") {
      this.emit(`message:${message.to}`, message);
    }
    // Emit global event
    this.emit("message:all", message);

    console.log(`[AgentBus] ${message.from} -> ${message.to}: ${message.type}`);
  }

  public subscribe(agentType: AgentType, callback: (message: AgentMessage) => void) {
    this.on(`message:${agentType}`, callback);
  }

  public broadcast(from: AgentType, type: string, payload: any) {
    this.publish({
      id: crypto.randomUUID(),
      from,
      to: "all",
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  public send(from: AgentType, to: AgentType, type: string, payload: any) {
    this.publish({
      id: crypto.randomUUID(),
      from,
      to,
      type,
      payload,
      timestamp: Date.now(),
    });
  }
}
