import { strict as assert } from "node:assert";
import { globSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const esbuild = await import(
  pathToFileURL(
    globSync(
      "node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js",
    )[0],
  )
);
mkdirSync(".sites-runtime", { recursive: true });
await esbuild.build({
  entryPoints: ["lib/printing.ts"],
  outfile: ".sites-runtime/printing-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { printTotals, orderPayment, printVisible } = await import(
  pathToFileURL(process.cwd() + "/.sites-runtime/printing-test.mjs")
);
const order = {
  id: "order",
  kind: "print_order",
  amountCents: 150000,
  history: [{ text: "private" }],
};
const cash = {
  kind: "print_transaction",
  orderId: "order",
  counterpartyType: "customer",
  transactionDate: "2026-09-17",
};
const rows = [
  order,
  { ...cash, direction: "in", amountCents: 60000 },
  { ...cash, direction: "out", amountCents: 10000 }, // refund
  {
    ...cash,
    direction: "out",
    counterpartyType: "supplier",
    amountCents: 25000,
  },
  { ...cash, direction: "in", amountCents: 9999999, archived: true },
  {
    ...cash,
    direction: "in",
    amountCents: 20000,
    transactionDate: "2026-08-10",
  },
];
assert.deepEqual(printTotals(rows, "2026-09"), {
  income: 60000,
  expenses: 35000,
  balance: 25000,
});
assert.deepEqual(printTotals(rows), {
  income: 80000,
  expenses: 35000,
  balance: 45000,
});
assert.deepEqual(orderPayment(rows, order), { paid: 70000, remaining: 80000 });
assert.deepEqual(
  orderPayment(
    [...rows, { ...cash, direction: "in", amountCents: 90000 }],
    order,
  ),
  { paid: 160000, remaining: 0 },
);
const withTasks = [
  ...rows,
  { id: "mine", kind: "task", assigneeId: "operator", orderId: "order" },
  { id: "other", kind: "task", assigneeId: "other" },
  { id: "open", kind: "task" },
  { id: "legacy", kind: "task", assignee: "Departed person" },
  { id: "client", kind: "client" },
];
const view = printVisible({ role: "print_operator" }, withTasks, "operator");
assert.deepEqual(view.map((r) => r.id).sort(), ["mine", "open", "order"]);
assert.equal("amountCents" in view.find((r) => r.id === "order"), false);
assert.equal("history" in view.find((r) => r.id === "order"), false);
assert.deepEqual(printVisible({ role: "client" }, withTasks, "operator"), []);
console.log(
  "8 printing checks passed: cash periods, voids, refunds, supplier expenses, overpayments and private operator payloads.",
);
