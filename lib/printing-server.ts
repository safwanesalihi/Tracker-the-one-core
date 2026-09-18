import { database } from "@/lib/database";
import { insertRecord } from "@/lib/flow-server";
import type { RecordItem } from "@/lib/model";
import { printSchemas, type PrintKind } from "@/lib/printing";
import { isManager, type WorkspaceContext } from "@/lib/workspace";

// Called only after authentication, origin validation and membership resolution.
export async function mutatePrinting(
  workspace: WorkspaceContext,
  userId: string,
  actor: string,
  body: Record<string, unknown>,
  rows: RecordItem[],
) {
  const fail = (error: string, status: number) => ({ error, status });
  if (!["print-save", "print-task-status"].includes(String(body.action)))
    return fail("Action invalide.", 400);
  const manager = isManager(workspace.role);
  const existing = body.id ? rows.find((r) => r.id === body.id) : undefined;
  if (body.id && !existing) return fail("Élément introuvable.", 404);
  if (existing && body.revision !== existing.revision)
    return fail("Cet élément a changé. Actualisez avant de réessayer.", 409);
  const now = new Date().toISOString();
  let item: RecordItem;
  if (body.action === "print-task-status") {
    if (!existing || existing.kind !== "task" || existing.archived)
      return fail("Tâche introuvable.", 404);
    if (
      !manager &&
      (workspace.role !== "print_operator" ||
        (existing.assigneeId
          ? existing.assigneeId !== userId
          : !!existing.assignee?.trim()))
    )
      return fail("Cette tâche ne vous est pas attribuée.", 403);
    if (!["À faire", "En cours", "Validé"].includes(String(body.status)))
      return fail("Statut invalide.", 400);
    item = { ...existing, status: body.status as RecordItem["status"] };
  } else {
    if (!manager)
      return fail("Réservé au propriétaire et aux administrateurs.", 403);
    const kind = body.kind as PrintKind;
    if (
      !Object.hasOwn(printSchemas, kind) ||
      (existing && existing.kind !== kind)
    )
      return fail("Type invalide.", 400);
    const parsed = printSchemas[kind].safeParse(body.data);
    if (!parsed.success) return fail(parsed.error.issues[0].message, 400);
    item = {
      ...existing,
      ...parsed.data,
      id: existing?.id || crypto.randomUUID(),
      kind,
      revision: existing?.revision || 1,
      createdAt: existing?.createdAt || now,
    };
    if (item.orderId) {
      const order = rows.find(
        (r) => r.id === item.orderId && r.kind === "print_order",
      );
      if (!order) return fail("Commande introuvable dans cet espace.", 400);
      if (kind === "task" && order.orderStatus === "cancelled")
        return fail("Cette commande est annulée.", 400);
    }
    if (kind === "task") {
      const assigned = item.assigneeId
        ? await database().query<{ name: string; email: string }>(
            "SELECT name, email FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role IN ('owner', 'admin', 'print_operator')",
            [workspace.id, item.assigneeId],
          )
        : [];
      if (item.assigneeId && !assigned.length)
        return fail("Choisissez un membre de cet espace.", 400);
      item.assignee = assigned[0]?.name || assigned[0]?.email || "";
      // Legacy printing tasks remain editable without studio relationships or approval rules.
      delete item.clientId;
      delete item.projectId;
      delete item.approvalDueAt;
      delete item.signOff;
    }
  }
  item.history = [
    ...(existing?.history || []),
    {
      text: `${actor} · ${existing ? "Modifié" : "Créé"}${body.action === "print-task-status" ? ` · ${item.status}` : ""}`,
      date: now,
    },
  ].slice(-100);
  if (existing) {
    const updated = await database().query(
      "UPDATE records SET data = $1::jsonb, revision = revision + 1 WHERE workspace_id = $2 AND id = $3 AND revision = $4 RETURNING id",
      [JSON.stringify(item), workspace.id, item.id, body.revision],
    );
    if (!updated.length)
      return fail("Modification simultanée. Actualisez votre espace.", 409);
  } else {
    const statement = insertRecord(item, userId, workspace.id);
    await database().query(statement.text, statement.params);
  }
  return { id: item.id, status: 200 };
}
