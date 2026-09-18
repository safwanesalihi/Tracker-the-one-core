import { z } from "zod";
import type { RecordItem } from "./model";
import { isManager, type WorkspaceContext } from "./workspace";

export const printOrderStatuses = [
  "new",
  "production",
  "ready",
  "delivered",
  "cancelled",
] as const;
export const printOrderLabels: Record<
  (typeof printOrderStatuses)[number],
  string
> = {
  new: "Nouvelle",
  production: "En production",
  ready: "Prête",
  delivered: "Livrée",
  cancelled: "Annulée",
};
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Date invalide.",
  );
const common = {
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(160),
  description: z.string().max(5000).default(""),
};
const cents = z.number().int().nonnegative().max(100000000000);
export const printSchemas = {
  print_transaction: z
    .object({
      ...common,
      direction: z.enum(["in", "out"]),
      amountCents: cents.positive(),
      transactionDate: date,
      counterparty: z
        .string()
        .trim()
        .min(1, "Indiquez avec qui vous traitez.")
        .max(160),
      counterpartyType: z.enum(["customer", "supplier"]),
      expenseCategory: z.string().trim().min(1).max(80),
      orderId: z.string().max(100).default(""),
      archived: z.boolean().default(false),
    })
    .strict(),
  print_order: z
    .object({
      ...common,
      counterparty: z
        .string()
        .trim()
        .min(1, "Indiquez avec qui vous traitez.")
        .max(160),
      amountCents: cents,
      quantity: z.number().int().positive().max(10000000),
      due: date,
      orderStatus: z.enum(printOrderStatuses),
    })
    .strict(),
  task: z
    .object({
      ...common,
      orderId: z.string().max(100).default(""),
      assigneeId: z.string().max(200).default(""),
      due: z.union([date, z.literal("")]).default(""),
      status: z.enum(["À faire", "En cours", "Validé"]),
    })
    .strict(),
};
export type PrintKind = keyof typeof printSchemas;
export function printVisible(
  workspace: WorkspaceContext,
  rows: RecordItem[],
  userId: string,
) {
  const printing = rows.filter((r) =>
    ["task", "print_order", "print_transaction"].includes(r.kind),
  );
  if (isManager(workspace.role)) return printing;
  if (workspace.role === "client") return [];
  const tasks = printing.filter(
    (r) =>
      r.kind === "task" &&
      ((!r.assigneeId && !r.assignee?.trim()) || r.assigneeId === userId),
  );
  const orderIds = new Set(tasks.map((t) => t.orderId));
  return [
    ...tasks,
    ...printing
      .filter((r) => r.kind === "print_order" && orderIds.has(r.id))
      .map((r) => {
        // Operational order details only; financial history is also private.
        const { amountCents: _amount, history: _history, ...operational } = r;
        void _amount;
        void _history;
        return operational;
      }),
  ];
}
export function printTotals(rows: RecordItem[], month = "") {
  const movements = rows.filter(
    (r) =>
      r.kind === "print_transaction" &&
      !r.archived &&
      (!month || r.transactionDate?.startsWith(month)),
  );
  const income = movements
    .filter((r) => r.direction === "in")
    .reduce((s, r) => s + (r.amountCents || 0), 0);
  const expenses = movements
    .filter((r) => r.direction === "out")
    .reduce((s, r) => s + (r.amountCents || 0), 0);
  return { income, expenses, balance: income - expenses };
}
export function orderPayment(rows: RecordItem[], order: RecordItem) {
  // Customer outflows are refunds; supplier expenses do not reduce customer payments.
  const paid = rows
    .filter(
      (r) =>
        r.kind === "print_transaction" &&
        !r.archived &&
        r.orderId === order.id &&
        r.counterpartyType === "customer",
    )
    .reduce(
      (s, r) => s + (r.direction === "in" ? 1 : -1) * (r.amountCents || 0),
      0,
    );
  return { paid, remaining: Math.max(0, (order.amountCents || 0) - paid) };
}
