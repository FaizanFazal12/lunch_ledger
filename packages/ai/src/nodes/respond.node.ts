import { formatMinor } from "@lunchledger/shared";
import type { AgentStateType, AgentStateUpdate } from "../state/graphState.js";
import type { ExecResult } from "./results.js";

/**
 * Response Generator node (deterministic templates). If an earlier node asked for
 * clarification, we surface that; otherwise we describe what was done. Kept template-
 * based for reliability and offline use; an LLM polish pass is a future enhancement.
 */
export function makeRespondNode() {
  return async function respond(state: AgentStateType): Promise<AgentStateUpdate> {
    if (state.clarification !== null && state.clarification.length > 0) {
      return Promise.resolve({ reply: state.clarification });
    }
    const data = state.data as ExecResult | null;
    if (data === null) {
      return Promise.resolve({
        reply: "I'm not sure how to help with that yet. Try adding an expense or asking for balances.",
      });
    }
    return Promise.resolve({ reply: render(data) });
  };
}

/** Most expenses we list in a single chat reply before summarising the rest. */
const HISTORY_LIMIT = 10;

function render(data: ExecResult): string {
  switch (data.kind) {
    case "expense_added": {
      const heads = data.participantNames.length + data.guestNames.length;
      const guestNote =
        data.guestNames.length > 0 ? ` (incl. guest ${data.guestNames.join(", ")})` : "";
      const share =
        data.shareMinorEach !== null
          ? ` Each of ${heads} pays ${formatMinor(data.shareMinorEach)}.`
          : ` Split across ${heads}.`;
      return `Got it — ${data.payerName} paid ${formatMinor(data.amountMinor)}${guestNote}.${share}`;
    }
    case "balances": {
      const lines = data.balances.balances.map((b) => {
        if (b.balanceMinor === 0) return `${b.name}: settled up`;
        return b.balanceMinor > 0
          ? `${b.name}: is owed ${formatMinor(b.balanceMinor)}`
          : `${b.name}: owes ${formatMinor(-b.balanceMinor)}`;
      });
      return `Balances for ${data.balances.groupName}:\n` + lines.map((l) => `  • ${l}`).join("\n");
    }
    case "settled":
      return `Recorded: ${data.fromName} paid ${data.toName} ${formatMinor(data.amountMinor)}.`;
    case "history": {
      const period = data.rangeLabel !== null ? ` for ${data.rangeLabel}` : "";
      if (data.expenses.length === 0) {
        return data.rangeLabel !== null
          ? `No expenses recorded${period}.`
          : "No expenses recorded yet.";
      }
      const shown = data.expenses.slice(0, HISTORY_LIMIT);
      const lines = shown.map((e) => {
        const date = e.occurredAt.slice(0, 10);
        return `  • ${date} — ${e.payerName} paid ${formatMinor(e.amountMinor)} (${e.participants.length} people)`;
      });
      const header = data.rangeLabel !== null ? `Expenses${period}` : "Recent expenses";
      const more =
        data.expenses.length > shown.length
          ? `\n  …and ${data.expenses.length - shown.length} more.`
          : "";
      return `${header}:\n${lines.join("\n")}${more}`;
    }
    case "group_created":
      return `Created the group "${data.name}".`;
    case "member_added":
      return `Added ${data.name} to the group.`;
    case "member_removed":
      return `Removed ${data.name} from the group.`;
    case "who_should_pay": {
      if (data.balanceMinor >= 0) {
        return `Everyone's roughly even — ${data.name} could pay next.`;
      }
      return `${data.name} should pay next (currently owes ${formatMinor(-data.balanceMinor)}).`;
    }
    case "noop":
      return "Okay.";
  }
}
