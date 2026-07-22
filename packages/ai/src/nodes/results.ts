import type { ExpenseView, GroupBalances } from "@lunchledger/shared";

/** Structured outcome of the executor node, consumed by the response generator. */
export type ExecResult =
  | {
      kind: "expense_added";
      amountMinor: number;
      payerName: string;
      participantNames: string[];
      guestNames: string[];
      /** Equal per-head share in minor units, or null if the split was uneven. */
      shareMinorEach: number | null;
    }
  | { kind: "balances"; balances: GroupBalances }
  | { kind: "settled"; fromName: string; toName: string; amountMinor: number }
  | { kind: "history"; expenses: ExpenseView[] }
  | { kind: "group_created"; name: string }
  | { kind: "member_added"; name: string }
  | { kind: "member_removed"; name: string }
  | { kind: "who_should_pay"; name: string; balanceMinor: number }
  | { kind: "noop" };
