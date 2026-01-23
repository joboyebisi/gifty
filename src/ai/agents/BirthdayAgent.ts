import { BaseAgent } from "./BaseAgent";
import { AgentType, AgentMessage } from "./AgentBus";
import { getUpcomingBirthdays } from "../../birthdays/birthdays";
import { loadEnv } from "../../config/env";

export class BirthdayAgent extends BaseAgent {
    constructor() {
        super(AgentType.BIRTHDAY);
    }

    protected async handleMessage(message: AgentMessage): Promise<void> {
        switch (message.type) {
            case "check_upcoming_birthdays":
                await this.checkUpcomingBirthdays(message);
                break;
            case "get_birthday_for_user":
                // Handle specific user lookup
                break;
            default:
                console.log(`[BirthdayAgent] Unknown message type: ${message.type}`);
        }
    }

    private async checkUpcomingBirthdays(message: AgentMessage) {
        console.log("[BirthdayAgent] Checking upcoming birthdays...");
        try {
            // Logic to fetch birthdays from DB
            // We can use the existing getUpcomingBirthdays function
            // Optionally filter by group if provided in payload

            const { days = 7, chatId } = message.payload || {};
            const birthdays = await getUpcomingBirthdays(days);

            // Filter for specific group if needed (requires more complex query joining user_groups)
            // For now, return all found birthdays to the requester

            this.send(message.from, "upcoming_birthdays_result", {
                birthdays,
                chatId,
                originalRequestId: message.id
            });

        } catch (error: any) {
            console.error("[BirthdayAgent] Error checking birthdays:", error);
            this.send(message.from, "error", {
                error: error.message,
                originalRequestId: message.id
            });
        }
    }
}
