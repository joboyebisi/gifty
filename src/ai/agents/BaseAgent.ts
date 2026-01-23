import { AgentBus, AgentMessage, AgentType } from "./AgentBus";

export abstract class BaseAgent {
    protected bus: AgentBus;
    protected type: AgentType;

    constructor(type: AgentType) {
        this.type = type;
        this.bus = AgentBus.getInstance();
        this.setupSubscriptions();
    }

    protected setupSubscriptions() {
        this.bus.subscribe(this.type, (message) => {
            this.handleMessage(message);
        });
    }

    protected abstract handleMessage(message: AgentMessage): Promise<void>;

    protected send(to: AgentType, type: string, payload: any) {
        this.bus.send(this.type, to, type, payload);
    }

    protected broadcast(type: string, payload: any) {
        this.bus.broadcast(this.type, type, payload);
    }
}
