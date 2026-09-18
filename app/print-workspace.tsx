"use client";

import { useState, type FormEvent } from "react";
import WorkspaceFrame, {
  type WorkspaceFrameOptions,
} from "@/app/workspace-frame";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import DashboardPeriod, { dashboardPeriod } from "@/app/dashboard-period";
import DatePicker from "@/app/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  LayoutDashboard,
  ArrowLeftRight,
  Package,
  CheckSquare,
  Users,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Pencil,
  Download,
  RefreshCw,
  Play,
  Pause,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/app/locale-provider";
import TeamPage from "@/app/team";
import type { RecordItem } from "@/lib/model";
import {
  isManager,
  memberName,
  type WorkspaceContext,
  type WorkspaceSummary,
  type WorkspaceMember,
  type MemberChange,
  type Invitation,
} from "@/lib/workspace";
import {
  orderPayment,
  printTotals,
  printOrderStatuses,
  printOrderLabels,
  type PrintKind,
} from "@/lib/printing";

type Props = {
  frameOptions: WorkspaceFrameOptions;
  records: RecordItem[];
  workspace: WorkspaceContext;
  workspaces: WorkspaceSummary[];
  members: WorkspaceMember[];
  user: { id: string; name: string };
  busy: boolean;
  loading: boolean;
  error: string;
  today: string;
  mailConfigured: boolean;
  mutate: (body: unknown) => Promise<unknown>;
  onSwitch: (id: string) => Promise<void>;
  onRefresh: () => void;
  onMember: (change: MemberChange) => Promise<Invitation | void>;
  onLogout: () => void;
};
type Page = "dashboard" | "transactions" | "orders" | "tasks" | "team";
type Editor = {
  kind: PrintKind;
  record?: RecordItem;
  direction?: "in" | "out";
  orderId?: string;
};

export default function PrintWorkspace(p: Props) {
  const { t, tag, date } = useI18n();
  const manager = isManager(p.workspace.role);
  const [page, setPage] = useState<Page>("dashboard");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [month, setMonth] = useState(p.today.slice(0, 7));
  const [periodKey, setPeriodKey] = useState("month");
  const period = dashboardPeriod(p.today, periodKey, month);
  const inPeriod = (r: RecordItem) =>
    !period ||
    (!!r.transactionDate &&
      r.transactionDate >= period.from &&
      r.transactionDate <= period.to);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removingPayment, setRemovingPayment] = useState<RecordItem | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = p.busy || saving || p.loading;
  const money = (cents: number) =>
    new Intl.NumberFormat(tag, { style: "currency", currency: "MAD" }).format(
      cents / 100,
    );
  const orders = p.records.filter((r) => r.kind === "print_order");
  const tasks = p.records.filter((r) => r.kind === "task" && !r.archived);
  const transactions = p.records.filter((r) => r.kind === "print_transaction");
  const totals = printTotals(p.records.filter(inPeriod));
  const activeOrders = orders.filter(
    (r) => !["delivered", "cancelled"].includes(r.orderStatus || "new"),
  );
  const completed = tasks.filter((r) => r.status === "Validé").length;
  const pending = tasks.filter((r) => r.status !== "Validé");
  const overdue = pending.filter((r) => r.due && r.due < p.today);
  const outstanding = orders
    .filter((r) => r.orderStatus !== "cancelled")
    .reduce((sum, r) => sum + orderPayment(p.records, r).remaining, 0);
  const months = Array.from({ length: 6 }, (_, index) => {
    const end = period?.to.slice(0, 7) || p.today.slice(0, 7);
    const d = new Date(`${end}-15T12:00:00`);
    d.setMonth(d.getMonth() - 5 + index);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const values = printTotals(p.records, key);
    return {
      name: date(`${key}-01`, { month: "short", year: "2-digit" }),
      income: values.income / 100,
      expenses: values.expenses / 100,
    };
  });
  const nav = [
    {
      id: "dashboard" as const,
      name: "Tableau de bord",
      icon: LayoutDashboard,
    },
    ...(manager
      ? [
          {
            id: "transactions" as const,
            name: "Entrées & sorties",
            icon: ArrowLeftRight,
          },
        ]
      : []),
    { id: "orders" as const, name: "Commandes", icon: Package },
    { id: "tasks" as const, name: "Tâches", icon: CheckSquare },
    { id: "team" as const, name: "Équipe", icon: Users },
  ];
  function navigate(next: Page) {
    setPage(next);
    setQuery("");
    setFilter("");
    setError("");
    setNotice("");
  }
  async function act(body: unknown) {
    if (disabled) return false;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await p.mutate(body);
      setNotice(t("Enregistré"));
      return true;
    } catch (e) {
      setError(t((e as Error).message));
      return false;
    } finally {
      setSaving(false);
    }
  }
  const matches = (r: RecordItem) =>
    [
      r.name,
      r.counterparty,
      r.assignee,
      r.expenseCategory,
      orders.find((o) => o.id === r.orderId)?.name,
    ].some((v) => v?.toLowerCase().includes(query.toLowerCase()));
  const movements = transactions
    .filter(
      (r) =>
        matches(r) &&
        inPeriod(r) &&
        (filter === "void"
          ? r.archived
          : !r.archived && (!filter || r.direction === filter)),
    )
    .sort(
      (a, b) =>
        (b.transactionDate || "").localeCompare(a.transactionDate || "") ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const shownOrders = orders
    .filter((r) => matches(r) && (!filter || r.orderStatus === filter))
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const shownTasks = tasks
    .filter(
      (r) =>
        matches(r) &&
        (!filter ||
          (filter === "late"
            ? r.due && r.due < p.today && r.status !== "Validé"
            : r.status === filter)),
    )
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  function exportCsv() {
    const rows = [
      [
        t("Date"),
        t("Libellé"),
        t("Type"),
        t("Montant (MAD)"),
        t("Interlocuteur"),
        t("Client / Fournisseur"),
        t("Catégorie"),
        t("Commande"),
      ],
      ...movements.map((r) => [
        r.transactionDate || "",
        r.name,
        t(r.direction === "in" ? "Entrée" : "Sortie"),
        ((r.amountCents || 0) / 100).toFixed(2),
        r.counterparty || "",
        t(r.counterpartyType === "customer" ? "Client" : "Fournisseur"),
        r.expenseCategory || "",
        orders.find((o) => o.id === r.orderId)?.name || "",
      ]),
    ];
    const cell = (value: string) =>
      `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((row) => row.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `impression-${period ? period.from + "_" + period.to : "tout"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const empty = (text: string) => (
    <div className="print-empty">
      <Package size={30} />
      <h3>{t(text)}</h3>
      <p>{t("Les éléments enregistrés apparaîtront ici.")}</p>
    </div>
  );
  const progress = (value: number, label: string) => (
    <div className="print-progress">
      <div>
        <span>{t(label)}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <progress
        max={100}
        value={Math.max(0, Math.min(100, value))}
        aria-label={t(label)}
      />
    </div>
  );

  return (
    <WorkspaceFrame
      {...p.frameOptions}
      navigation={
        <SidebarGroup>
          <SidebarGroupLabel>{t("GESTION DE L’ATELIER")}</SidebarGroupLabel>
          <SidebarMenu>
            {nav.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={page === n.id}
                  onClick={() => navigate(n.id)}
                >
                  <n.icon strokeWidth={1.5} />
                  <span>{t(n.name)}</span>
                  {n.id === "tasks" && pending.length > 0 && (
                    <span className="counter">{pending.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      }
    >
      <main className="print-main" aria-busy={disabled}>
        <header className="topbar">
          <SidebarTrigger aria-label={t("Afficher le menu")} />
          <span>
            <Printer size={15} /> {p.workspace.name} <span>/</span>{" "}
            {t(nav.find((n) => n.id === page)?.name || "")}
          </span>
          <div className="grow" />
          <button
            className="icon-button"
            disabled={disabled}
            onClick={p.onRefresh}
            aria-label={t("Actualiser")}
          >
            <RefreshCw size={16} />
          </button>
        </header>
        <div className="print-content">
          <div className="print-heading">
            <div>
              <p className="print-eyebrow">
                {t("VOTRE ATELIER, EN UN COUP D’ŒIL")}
              </p>
              <h1>{t(nav.find((n) => n.id === page)?.name || "")}</h1>
              <p>
                {t(
                  page === "dashboard"
                    ? "Suivez votre activité, vos paiements et votre production."
                    : page === "transactions"
                      ? "Chaque dirham reçu ou dépensé, au même endroit."
                      : page === "orders"
                        ? "De la demande à la livraison, gardez le fil."
                        : page === "tasks"
                          ? "Une équipe organisée, une production qui avance."
                          : "Gérez les accès à votre espace impression.",
                )}
              </p>
            </div>
            {manager && page !== "team" && (
              <div className="print-actions">
                {(page === "dashboard" || page === "transactions") && (
                  <>
                    <button
                      className="btn"
                      disabled={disabled}
                      onClick={() =>
                        setEditor({
                          kind: "print_transaction",
                          direction: "out",
                        })
                      }
                    >
                      <ArrowUpRight size={16} />
                      {t("Sortie")}
                    </button>
                    <button
                      className="btn primary"
                      disabled={disabled}
                      onClick={() =>
                        setEditor({
                          kind: "print_transaction",
                          direction: "in",
                        })
                      }
                    >
                      <Plus size={16} />
                      {t("Entrée")}
                    </button>
                  </>
                )}
                {page === "orders" && (
                  <button
                    className="btn primary"
                    disabled={disabled}
                    onClick={() => setEditor({ kind: "print_order" })}
                  >
                    <Plus size={16} />
                    {t("Nouvelle commande")}
                  </button>
                )}
                {page === "tasks" && (
                  <button
                    className="btn primary"
                    disabled={disabled}
                    onClick={() => setEditor({ kind: "task" })}
                  >
                    <Plus size={16} />
                    {t("Nouvelle tâche")}
                  </button>
                )}
              </div>
            )}
          </div>
          {(error || p.error) && (
            <div className="print-alert" role="alert">
              {error || t(p.error)}{" "}
              <button onClick={p.onRefresh}>{t("Actualiser")}</button>
            </div>
          )}
          {notice && (
            <p className="print-notice" role="status">
              {notice}
            </p>
          )}
          {(page === "transactions" || (page === "dashboard" && manager)) && (
            <div className="print-period">
              <DashboardPeriod
                value={periodKey}
                onChange={setPeriodKey}
                customMonth={month}
                onMonthChange={setMonth}
              />
              <small>
                {period
                  ? `${date(period.from)} → ${date(period.to, { day: "numeric", month: "short", year: "numeric" })}`
                  : t("Tout l’historique")}
              </small>
            </div>
          )}
          {page === "dashboard" && (
            <>
              <div className="print-stats">
                {manager ? (
                  <>
                    <Stat
                      label={t("Entrées")}
                      value={money(totals.income)}
                      hint={t("Encaissements réels")}
                      tone="green"
                    />
                    <Stat
                      label={t("Sorties")}
                      value={money(totals.expenses)}
                      hint={t("Décaissements réels")}
                      tone="red"
                    />
                    <Stat
                      label={t("Solde de la période")}
                      value={money(totals.balance)}
                      hint={t("Entrées moins sorties")}
                    />
                    <Stat
                      label={t("Reste à encaisser")}
                      value={money(outstanding)}
                      hint={t("Toutes les commandes non annulées")}
                    />
                  </>
                ) : (
                  <>
                    <Stat
                      label={t("À faire")}
                      value={String(pending.length)}
                      hint={t("Vos tâches et celles à prendre")}
                    />
                    <Stat
                      label={t("Terminées")}
                      value={String(completed)}
                      hint={t("Tâches réalisées")}
                      tone="green"
                    />
                    <Stat
                      label={t("En retard")}
                      value={String(overdue.length)}
                      hint={t("Échéance dépassée")}
                      tone="red"
                    />
                  </>
                )}
              </div>
              <div className="print-dashboard-grid">
                {manager && (
                  <section className="print-panel">
                    <div className="print-panel-title">
                      <h2>{t("Mouvements de trésorerie")}</h2>
                      <small>{t("6 mois · MAD")}</small>
                    </div>
                    <div className="print-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={months} barGap={5}>
                          <CartesianGrid
                            vertical={false}
                            strokeDasharray="3 4"
                          />
                          <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis tickLine={false} axisLine={false} width={65} />
                          <Tooltip formatter={(v) => money(Number(v) * 100)} />
                          <Legend />
                          <Bar
                            dataKey="income"
                            name={t("Entrées")}
                            fill="#237b61"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="expenses"
                            name={t("Sorties")}
                            fill="#c4524a"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}
                <section className="print-panel">
                  <div className="print-panel-title">
                    <h2>{t("Production")}</h2>
                    <Package size={18} />
                  </div>
                  <div className="print-production-count">
                    <strong>{activeOrders.length}</strong>
                    <span>{t("commandes en cours")}</span>
                  </div>
                  {progress(
                    tasks.length ? (completed / tasks.length) * 100 : 0,
                    "Tâches terminées",
                  )}
                  <div className="print-stages">
                    {printOrderStatuses.map((status) => (
                      <div key={status}>
                        <span>{t(printOrderLabels[status])}</span>
                        <b>
                          {
                            orders.filter((o) => o.orderStatus === status)
                              .length
                          }
                        </b>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className="print-dashboard-grid">
                <section className="print-panel">
                  <div className="print-panel-title">
                    <h2>{t("Prochaines tâches")}</h2>
                    <button
                      className="btn subtle"
                      onClick={() => navigate("tasks")}
                    >
                      {t("Voir tout")} →
                    </button>
                  </div>
                  {!pending.length
                    ? empty("Aucune tâche en attente")
                    : pending
                        .slice()
                        .sort((a, b) =>
                          (a.due || "9999").localeCompare(b.due || "9999"),
                        )
                        .slice(0, 5)
                        .map((task) => (
                          <div className="print-next-task" key={task.id}>
                            <span
                              className={
                                task.due && task.due < p.today
                                  ? "print-late-dot"
                                  : "print-dot"
                              }
                            />
                            <div>
                              <strong>{task.name}</strong>
                              <small>{task.assignee || t("À prendre")}</small>
                            </div>
                            <span
                              className={
                                task.due && task.due < p.today
                                  ? "print-red"
                                  : ""
                              }
                            >
                              {date(task.due) || "—"}
                            </span>
                          </div>
                        ))}
                </section>
                <section className="print-panel">
                  <div className="print-panel-title">
                    <h2>{t("Charge de l’équipe")}</h2>
                    <Users size={18} />
                  </div>
                  {p.members
                    .filter((m) =>
                      ["owner", "admin", "print_operator"].includes(m.role),
                    )
                    .map((m) => {
                      const assigned = tasks.filter(
                        (task) => task.assigneeId === m.userId,
                      );
                      return (
                        <div className="print-workload" key={m.userId}>
                          <div>
                            <strong>{memberName(m)}</strong>
                            <small>
                              {
                                assigned.filter(
                                  (task) => task.status === "Validé",
                                ).length
                              }{" "}
                              / {assigned.length} {t("terminées")}
                            </small>
                          </div>
                          <progress
                            max={Math.max(1, assigned.length)}
                            value={
                              assigned.filter(
                                (task) => task.status === "Validé",
                              ).length
                            }
                            aria-label={memberName(m)}
                          />
                        </div>
                      );
                    })}
                </section>
              </div>
            </>
          )}
          {["transactions", "orders", "tasks"].includes(page) && (
            <>
              {page === "transactions" && (
                <div className="print-stats">
                  <Stat
                    label={t("Entrées")}
                    value={money(totals.income)}
                    tone="green"
                  />
                  <Stat
                    label={t("Sorties")}
                    value={money(totals.expenses)}
                    tone="red"
                  />
                  <Stat
                    label={t("Solde de la période")}
                    value={money(totals.balance)}
                  />
                </div>
              )}
              <section className="print-panel print-list">
                <div className="print-toolbar">
                  <label className="print-search">
                    <Search size={17} />
                    <input
                      aria-label={t("Rechercher")}
                      placeholder={t("Rechercher…")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <Choice
                    label={t("Filtrer par statut")}
                    value={filter}
                    onChange={setFilter}
                    items={[
                      { value: "", label: t("Tout") },
                      ...(page === "transactions"
                        ? [
                            { value: "in", label: t("Entrées") },
                            { value: "out", label: t("Sorties") },
                            { value: "void", label: t("Annulées") },
                          ]
                        : page === "orders"
                          ? printOrderStatuses.map((value) => ({
                              value,
                              label: t(printOrderLabels[value]),
                            }))
                          : [
                              { value: "À faire", label: t("À faire") },
                              { value: "En cours", label: t("En cours") },
                              { value: "Validé", label: t("Terminées") },
                              { value: "late", label: t("En retard") },
                            ]),
                    ]}
                  />
                  {page === "transactions" && (
                    <button
                      className="btn"
                      onClick={exportCsv}
                      disabled={!movements.length}
                    >
                      <Download size={15} />
                      {t("Exporter CSV")}
                    </button>
                  )}
                </div>
                {page === "transactions" &&
                  (movements.length ? (
                    <div className="print-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {[
                              "Date",
                              "Libellé",
                              "Interlocuteur",
                              "Catégorie",
                              "Commande",
                              "Montant",
                              "Actions",
                            ].map((h) => (
                              <th key={h}>{t(h)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {movements.map((r) => (
                            <tr
                              key={r.id}
                              className={r.archived ? "print-void" : ""}
                            >
                              <td>{date(r.transactionDate)}</td>
                              <td>
                                <span
                                  className={`print-movement-icon ${r.direction === "in" ? "in" : "out"}`}
                                >
                                  {r.direction === "in" ? (
                                    <ArrowDownLeft size={16} />
                                  ) : (
                                    <ArrowUpRight size={16} />
                                  )}
                                </span>
                                {r.name}
                                {r.archived && <small>{t("Annulée")}</small>}
                              </td>
                              <td>
                                {r.counterparty}
                                <small>
                                  {t(
                                    r.counterpartyType === "customer"
                                      ? "Client"
                                      : "Fournisseur",
                                  )}
                                </small>
                              </td>
                              <td>{r.expenseCategory}</td>
                              <td>
                                {orders.find((o) => o.id === r.orderId)?.name ||
                                  "—"}
                              </td>
                              <td
                                className={
                                  r.direction === "in"
                                    ? "print-green"
                                    : "print-red"
                                }
                              >
                                {r.direction === "in" ? "+" : "−"}
                                {money(r.amountCents || 0)}
                              </td>
                              <td>
                                <div className="print-table-actions">
                                  <button
                                    className="btn subtle"
                                    disabled={disabled}
                                    aria-label={`${t("Modifier")} ${r.name}`}
                                    onClick={() =>
                                      setEditor({
                                        kind: "print_transaction",
                                        record: r,
                                      })
                                    }
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button danger"
                                    disabled={disabled}
                                    aria-label={`${t("Supprimer")} ${r.name}`}
                                    onClick={() => {
                                      setError("");
                                      setRemovingPayment(r);
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    empty("Aucun mouvement pour cette période")
                  ))}
                {page === "orders" &&
                  (shownOrders.length ? (
                    <div className="print-order-grid">
                      {shownOrders.map((order) => {
                        const related = tasks.filter(
                          (task) => task.orderId === order.id,
                        );
                        const payment = orderPayment(p.records, order);
                        return (
                          <article className="print-order" key={order.id}>
                            <div className="print-order-top">
                              <span
                                className={`print-status ${order.orderStatus}`}
                              >
                                {t(
                                  printOrderLabels[order.orderStatus || "new"],
                                )}
                              </span>
                              {manager && (
                                <button
                                  className="btn subtle"
                                  disabled={disabled}
                                  aria-label={`${t("Modifier")} ${order.name}`}
                                  onClick={() =>
                                    setEditor({
                                      kind: "print_order",
                                      record: order,
                                    })
                                  }
                                >
                                  <Pencil size={15} />
                                </button>
                              )}
                            </div>
                            <h3>{order.name}</h3>
                            <p>{order.counterparty}</p>
                            <div className="print-order-meta">
                              <span>
                                {order.quantity} {t("unités")}
                              </span>
                              <span
                                className={
                                  order.due &&
                                  order.due < p.today &&
                                  !["delivered", "cancelled"].includes(
                                    order.orderStatus || "",
                                  )
                                    ? "print-red"
                                    : ""
                                }
                              >
                                {date(order.due)}
                              </span>
                            </div>
                            {order.description && (
                              <p className="print-description">
                                {order.description}
                              </p>
                            )}
                            {progress(
                              related.length
                                ? (related.filter(
                                    (task) => task.status === "Validé",
                                  ).length /
                                    related.length) *
                                    100
                                : 0,
                              "Production",
                            )}
                            {manager && (
                              <>
                                <div className="print-order-amount">
                                  <strong>
                                    {money(order.amountCents || 0)}
                                  </strong>
                                  <small>
                                    {t("Reste à encaisser")}:{" "}
                                    {money(payment.remaining)}
                                  </small>
                                </div>
                                {progress(
                                  order.amountCents
                                    ? (payment.paid / order.amountCents) * 100
                                    : 0,
                                  "Paiement",
                                )}
                                <div className="print-actions">
                                  <button
                                    className="btn"
                                    disabled={
                                      disabled ||
                                      order.orderStatus === "cancelled"
                                    }
                                    onClick={() =>
                                      setEditor({
                                        kind: "task",
                                        orderId: order.id,
                                      })
                                    }
                                  >
                                    <Plus size={14} />
                                    {t("Tâche")}
                                  </button>
                                  <button
                                    className="btn"
                                    disabled={disabled}
                                    onClick={() =>
                                      setEditor({
                                        kind: "print_transaction",
                                        orderId: order.id,
                                        direction: "in",
                                      })
                                    }
                                  >
                                    {t("Encaisser")}
                                  </button>
                                </div>
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    empty("Aucune commande")
                  ))}
                {page === "tasks" &&
                  (shownTasks.length ? (
                    <div className="print-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {[
                              "Tâche",
                              "Commande",
                              "Responsable",
                              "Échéance",
                              "Statut",
                              "Temps",
                              "Actions",
                            ].map((h) => (
                              <th key={h}>{t(h)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shownTasks.map((task) => {
                            const running = task.timeEntries?.some(
                              (e) => e.userId === p.user.id && !e.end,
                            );
                            const minutes = Math.floor(
                              (task.timeEntries || []).reduce(
                                (s, e) =>
                                  s +
                                  (e.end
                                    ? Date.parse(e.end) - Date.parse(e.start)
                                    : 0),
                                0,
                              ) / 60000,
                            );
                            return (
                              <tr key={task.id}>
                                <td>
                                  <strong>{task.name}</strong>
                                  <small className="print-description">
                                    {task.description}
                                  </small>
                                </td>
                                <td>
                                  {orders.find((o) => o.id === task.orderId)
                                    ?.name || "—"}
                                </td>
                                <td>{task.assignee || t("À prendre")}</td>
                                <td
                                  className={
                                    task.due &&
                                    task.due < p.today &&
                                    task.status !== "Validé"
                                      ? "print-red"
                                      : ""
                                  }
                                >
                                  {date(task.due) || "—"}
                                </td>
                                <td>
                                  <Choice
                                    label={`${t("Statut")} ${task.name}`}
                                    value={
                                      task.status === "À valider"
                                        ? "En cours"
                                        : task.status || "À faire"
                                    }
                                    disabled={
                                      disabled || p.workspace.role === "viewer"
                                    }
                                    onChange={(status) =>
                                      void act({
                                        action: "print-task-status",
                                        id: task.id,
                                        revision: task.revision,
                                        status,
                                      })
                                    }
                                    items={[
                                      { value: "À faire", label: t("À faire") },
                                      {
                                        value: "En cours",
                                        label: t("En cours"),
                                      },
                                      { value: "Validé", label: t("Terminée") },
                                    ]}
                                  />
                                </td>
                                <td>
                                  <span>
                                    {Math.floor(minutes / 60)}h {minutes % 60}m
                                  </span>
                                  {p.workspace.role !== "viewer" && (
                                    <button
                                      className={`btn subtle ${running ? "print-green" : ""}`}
                                      disabled={disabled}
                                      aria-label={`${t(running ? "Arrêter" : "Démarrer")} ${task.name}`}
                                      onClick={() =>
                                        void act({
                                          action: running
                                            ? "stop-timer"
                                            : "start-timer",
                                          taskId: task.id,
                                        })
                                      }
                                    >
                                      {running ? (
                                        <Pause size={15} />
                                      ) : (
                                        <Play size={15} />
                                      )}
                                    </button>
                                  )}
                                  {running && <small>{t("En cours")}</small>}
                                </td>
                                <td>
                                  {manager && (
                                    <button
                                      className="btn subtle"
                                      disabled={disabled}
                                      aria-label={`${t("Modifier")} ${task.name}`}
                                      onClick={() =>
                                        setEditor({
                                          kind: "task",
                                          record: task,
                                        })
                                      }
                                    >
                                      <Pencil size={15} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    empty("Aucune tâche")
                  ))}
              </section>
            </>
          )}
          {page === "team" && (
            <TeamPage
              key={p.workspace.id}
              workspace={p.workspace}
              members={p.members}
              currentUserId={p.user.id}
              busy={disabled}
              mailConfigured={p.mailConfigured}
              onChange={p.onMember}
              onRefresh={p.onRefresh}
            />
          )}
        </div>
      </main>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !disabled) {
            setEditor(null);
            setError("");
          }
        }}
      >
        <DialogContent className="tracker-modal print-dialog">
          <DialogHeader>
            <DialogTitle>
              {t(
                editor?.record
                  ? "Modifier"
                  : editor?.kind === "print_order"
                    ? "Nouvelle commande"
                    : editor?.kind === "task"
                      ? "Nouvelle tâche"
                      : editor?.direction === "out"
                        ? "Nouvelle sortie"
                        : "Nouvelle entrée",
              )}
            </DialogTitle>
            <DialogDescription>
              {t("Enregistré uniquement dans votre espace Impression.")}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <PrintForm
              key={`${editor.kind}-${editor.record?.id || "new"}-${editor.orderId || ""}`}
              editor={editor}
              orders={orders}
              members={p.members}
              today={p.today}
              disabled={disabled}
              error={error}
              onCancel={() => {
                setEditor(null);
                setError("");
              }}
              onSave={async (data) => {
                if (
                  await act({
                    action: "print-save",
                    kind: editor.kind,
                    id: editor.record?.id,
                    revision: editor.record?.revision,
                    data,
                  })
                )
                  setEditor(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removingPayment}
        onOpenChange={(open) => {
          if (!open && !saving) setRemovingPayment(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Supprimer ce paiement ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Ce mouvement sera définitivement supprimé et les totaux seront recalculés.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="print-alert" role="alert">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("Annuler")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={disabled}
              onClick={(event) => {
                event.preventDefault();
                if (!removingPayment) return;
                void act({
                  action: "print-delete-payment",
                  id: removingPayment.id,
                  revision: removingPayment.revision,
                }).then((ok) => {
                  if (ok) setRemovingPayment(null);
                });
              }}
            >
              {t(saving ? "Suppression…" : "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceFrame>
  );
}

function Choice({
  value,
  defaultValue = "",
  onChange,
  label,
  items,
  name,
  disabled,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label: string;
  items: { value: string; label: string }[];
  name?: string;
  disabled?: boolean;
}) {
  const { dir } = useI18n();
  const [selection, setSelection] = useState(defaultValue);
  const selected = value ?? selection;
  return (
    <>
      <Select
        value={selected || "__none"}
        dir={dir}
        disabled={disabled}
        onValueChange={(next) => {
          const v = next === "__none" ? "" : next;
          setSelection(v);
          onChange?.(v);
        }}
      >
        <SelectTrigger className="pick" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem
              key={item.value || "__none"}
              value={item.value || "__none"}
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name && <input type="hidden" name={name} value={selected} />}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <section className={`print-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </section>
  );
}

function PrintForm({
  editor,
  orders,
  members,
  today,
  disabled,
  error,
  onSave,
  onCancel,
}: {
  editor: Editor;
  orders: RecordItem[];
  members: WorkspaceMember[];
  today: string;
  disabled: boolean;
  error: string;
  onSave: (data: unknown) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const r = editor.record;
  const linked = orders.find((o) => o.id === (editor.orderId || r?.orderId));
  const [direction, setDirection] = useState(
    r?.direction || editor.direction || "in",
  );
  const [partyType, setPartyType] = useState(
    r?.counterpartyType || (direction === "in" ? "customer" : "supplier"),
  );
  const [party, setParty] = useState(
    r?.counterparty || linked?.counterparty || "",
  );
  const [orderId, setOrderId] = useState(r?.orderId || editor.orderId || "");
  const [transactionDate, setTransactionDate] = useState(
    r?.transactionDate || today,
  );
  const [due, setDue] = useState(r?.due || linked?.due || today);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) || "");
    const common = { name: value("name"), description: value("description") };
    const data =
      editor.kind === "print_transaction"
        ? {
            ...common,
            direction,
            amountCents: Math.round(Number(value("amount")) * 100),
            transactionDate,
            counterparty: party,
            counterpartyType: partyType,
            expenseCategory: value("expenseCategory"),
            orderId,
            archived: form.get("archived") === "on",
          }
        : editor.kind === "print_order"
          ? {
              ...common,
              counterparty: party,
              amountCents: Math.round(Number(value("amount")) * 100),
              quantity: Number(value("quantity")),
              due,
              orderStatus: value("orderStatus"),
            }
          : {
              ...common,
              orderId,
              assigneeId: value("assigneeId"),
              due,
              status: value("status"),
            };
    await onSave(data);
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="print-form">
      <fieldset disabled={disabled}>
        <label>
          {t(editor.kind === "task" ? "Tâche" : "Libellé")}
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={r?.name || ""}
            autoFocus
            placeholder={t(
              editor.kind === "print_order"
                ? "Ex. 500 cartes de visite"
                : editor.kind === "task"
                  ? "Ex. Découpe et finition"
                  : "Ex. Acompte ou achat de papier",
            )}
          />
        </label>
        {editor.kind === "print_transaction" && (
          <div className="print-form-row">
            <label>
              {t("Type")}
              <Choice
                label={t("Type")}
                value={direction}
                disabled={disabled}
                onChange={(value) => setDirection(value as "in" | "out")}
                items={[
                  { value: "in", label: t("Entrée") },
                  { value: "out", label: t("Sortie") },
                ]}
              />
            </label>
            <label>
              {t("Date")}
              <DatePicker
                label={t("Date")}
                value={transactionDate}
                onChange={setTransactionDate}
              />
            </label>
          </div>
        )}
        {editor.kind !== "task" && (
          <>
            <div className="print-form-row">
              <label>
                {t("Interlocuteur")}
                <input
                  required
                  maxLength={160}
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                />
              </label>
              {editor.kind === "print_transaction" ? (
                <label>
                  {t("Client / Fournisseur")}
                  <Choice
                    label={t("Client / Fournisseur")}
                    value={partyType}
                    disabled={disabled}
                    onChange={(value) =>
                      setPartyType(value as "customer" | "supplier")
                    }
                    items={[
                      { value: "customer", label: t("Client") },
                      { value: "supplier", label: t("Fournisseur") },
                    ]}
                  />
                </label>
              ) : (
                <label>
                  {t("Quantité")}
                  <input
                    type="number"
                    name="quantity"
                    required
                    min={1}
                    max={10000000}
                    step={1}
                    defaultValue={r?.quantity || 1}
                  />
                </label>
              )}
            </div>
            <div className="print-form-row">
              <label>
                {t(
                  editor.kind === "print_order"
                    ? "Total commande (MAD)"
                    : "Montant (MAD)",
                )}
                <input
                  type="number"
                  name="amount"
                  required
                  step="0.01"
                  min={editor.kind === "print_order" ? 0 : 0.01}
                  max={1000000000}
                  defaultValue={
                    r?.amountCents !== undefined ? r.amountCents / 100 : ""
                  }
                />
              </label>
              {editor.kind === "print_transaction" && (
                <label>
                  {t("Catégorie")}
                  <input
                    name="expenseCategory"
                    list="print-categories"
                    required
                    maxLength={80}
                    defaultValue={
                      r?.expenseCategory ||
                      (direction === "in"
                        ? t("Paiement commande")
                        : t("Fournitures"))
                    }
                  />
                  <datalist id="print-categories">
                    {[
                      "Paiement commande",
                      "Fournitures",
                      "Transport",
                      "Salaires",
                      "Loyer",
                      "Remboursement",
                      "Autre",
                    ].map((v) => (
                      <option key={v} value={t(v)} />
                    ))}
                  </datalist>
                </label>
              )}
            </div>
          </>
        )}
        {editor.kind !== "print_order" && (
          <label>
            {t("Commande liée")}
            <Choice
              label={t("Commande liée")}
              value={orderId}
              disabled={disabled}
              onChange={(value) => {
                setOrderId(value);
                if (
                  partyType === "customer" &&
                  editor.kind === "print_transaction"
                )
                  setParty(
                    orders.find((o) => o.id === value)?.counterparty || party,
                  );
              }}
              items={[
                { value: "", label: t("Sans commande") },
                ...orders
                  .filter(
                    (o) =>
                      editor.kind === "print_transaction" ||
                      o.orderStatus !== "cancelled" ||
                      o.id === orderId,
                  )
                  .map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          </label>
        )}
        {editor.kind === "task" && (
          <label>
            {t("Responsable")}
            <Choice
              label={t("Responsable")}
              name="assigneeId"
              defaultValue={r?.assigneeId || ""}
              disabled={disabled}
              items={[
                { value: "", label: t("À prendre") },
                ...members
                  .filter((m) =>
                    ["owner", "admin", "print_operator"].includes(m.role),
                  )
                  .map((m) => ({ value: m.userId, label: memberName(m) })),
              ]}
            />
          </label>
        )}
        {editor.kind !== "print_transaction" && (
          <div className="print-form-row">
            <label>
              {t("Échéance")}
              <DatePicker label={t("Échéance")} value={due} onChange={setDue} />
            </label>
            <label>
              {t("Statut")}
              <Choice
                label={t("Statut")}
                name={editor.kind === "task" ? "status" : "orderStatus"}
                disabled={disabled}
                defaultValue={
                  editor.kind === "task"
                    ? r?.status === "À valider"
                      ? "En cours"
                      : r?.status || "À faire"
                    : r?.orderStatus || "new"
                }
                items={
                  editor.kind === "task"
                    ? [
                        { value: "À faire", label: t("À faire") },
                        { value: "En cours", label: t("En cours") },
                        { value: "Validé", label: t("Terminée") },
                      ]
                    : printOrderStatuses.map((value) => ({
                        value,
                        label: t(printOrderLabels[value]),
                      }))
                }
              />
            </label>
          </div>
        )}
        <label>
          {t("Notes")}
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={r?.description || ""}
          />
        </label>
        {editor.kind === "print_transaction" && r && (
          <label className="print-checkbox">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={r.archived}
            />
            {t("Annuler ce mouvement (exclu des totaux)")}
          </label>
        )}
        {error && (
          <p role="alert" className="print-alert">
            {error}
          </p>
        )}
        <div className="print-form-footer">
          <button type="button" className="btn" onClick={onCancel}>
            {t("Annuler")}
          </button>
          <button type="submit" className="btn primary">
            {t(disabled ? "Enregistrement…" : "Enregistrer")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
