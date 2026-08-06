// Гүйлгээний түүх — tnks-data-table суурьтай хүснэгт: client-side өгөгдөл
// (lib/clientTable) + ерөнхий хайлт, огнооны интервал, эрэмбэ, баганын
// харагдац/өргөн, CSV·Excel экспорт. Мөр дээр дарахад дэлгэрэнгүй модал;
// хүлээгдэж буй шилжүүлэгт Хүлээн авах / Цуцлах товч (эрхээр нуугдана).
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { ListFilter } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import {
  TX_TYPES,
  TX_TYPE_LABEL,
  TX_TYPE_BADGE,
  TX_STATUS_LABEL,
  TX_STATUS_BADGE,
  type TxRow,
  type TxStatus,
} from "../lib/transactions";
import { clientFetchResult, type ClientPageParams, type ClientTableOpts } from "../lib/clientTable";

/** tnks-ийн ExportableData (index signature) шаардлагад нийцүүлсэн мөр. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = TxRow & Record<string, any>;

interface Props {
  rows: TxRow[];
  busy: boolean;
  /** act_receive эрхтэй эсэх — Хүлээн авах/Цуцлах товчнуудад. */
  canReceive: boolean;
  onOpen: (tx: TxRow) => void;
  onReceive: (tx: TxRow) => void;
  onCancel: (tx: TxRow) => void;
}

const TX_STATUSES: TxStatus[] = ["pending", "done", "cancelled"];

export default function TxHistoryTable({ rows, busy, canReceive, onOpen, onReceive, onCancel }: Props) {
  const { t } = useTranslation();
  // Баганын шүүлт — багана бүрийн толгойн доорх талбарууд (client-side).
  const [filters, setFilters] = useState<Record<string, string>>({});
  const setF = (k: string, v: string) =>
    setFilters((f) => {
      const n = { ...f };
      if (v) n[k] = v;
      else delete n[k];
      return n;
    });
  const activeFilterCount = Object.keys(filters).length;

  const branchText = useCallback(
    (tx: TxRow): string => {
      if (tx.type === "transfer") return `${tx.from_branch_name ?? t("transactions.noBranch")} → ${tx.to_branch_name ?? "?"}`;
      return tx.from_branch_name ?? t("transactions.noBranch");
    },
    [t]
  );

  const tableOpts = useMemo<ClientTableOpts<TxRow>>(
    () => ({
      searchValues: (tx) => [
        tx.tx_number,
        TX_TYPE_LABEL[tx.type],
        TX_STATUS_LABEL[tx.status],
        branchText(tx),
        tx.created_by_email,
        tx.note,
      ],
      sorters: {
        tx_number: (tx) => tx.tx_number,
        created_at: (tx) => tx.created_at,
        type: (tx) => TX_TYPE_LABEL[tx.type],
        status: (tx) => TX_STATUS_LABEL[tx.status],
        branch: (tx) => branchText(tx),
        item_count: (tx) => tx.item_count,
        created_by_email: (tx) => tx.created_by_email,
        note: (tx) => tx.note,
      },
      // Баганын шүүлт: төрөл/төлөв нь кодоор (select), бусад нь "агуулсан".
      filterValues: {
        tx_number: (tx) => tx.tx_number,
        type: (tx) => tx.type,
        status: (tx) => tx.status,
        branch: (tx) => branchText(tx),
        item_count: (tx) => tx.item_count,
        created_by_email: (tx) => tx.created_by_email,
        note: (tx) => tx.note,
      },
      dateValue: (tx) => tx.created_at,
    }),
    [branchText]
  );

  const fetchDataFn = useCallback(
    async (p: ClientPageParams) => clientFetchResult(rows as Row[], p, tableOpts as ClientTableOpts<Row>, filters),
    [rows, tableOpts, filters]
  );

  const filterCtl =
    "w-full rounded border border-slate-200 px-1.5 py-1 text-xs font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
  const filterRow = (columnId: string) => {
    if (columnId === "type")
      return (
        <select value={filters.type ?? ""} onChange={(e) => setF("type", e.target.value)} className={filterCtl}>
          <option value="">{t("epcTable.filterAll")}</option>
          {TX_TYPES.map((ty) => (
            <option key={ty} value={ty}>{TX_TYPE_LABEL[ty]}</option>
          ))}
        </select>
      );
    if (columnId === "status")
      return (
        <select value={filters.status ?? ""} onChange={(e) => setF("status", e.target.value)} className={filterCtl}>
          <option value="">{t("epcTable.filterAll")}</option>
          {TX_STATUSES.map((st) => (
            <option key={st} value={st}>{TX_STATUS_LABEL[st]}</option>
          ))}
        </select>
      );
    if (columnId === "created_at" || columnId === "actions") return null;
    return (
      <input
        value={filters[columnId] ?? ""}
        onChange={(e) => setF(columnId, e.target.value)}
        placeholder="…"
        className={filterCtl}
      />
    );
  };

  const getColumns = useCallback((): ColumnDef<Row, unknown>[] => {
    const cols: ColumnDef<Row, unknown>[] = [
      {
        id: "tx_number",
        accessorFn: (r: Row) => r.tx_number,
        header: ({ column }) => <DataTableColumnHeader column={column} title="№" />,
        cell: ({ row }) => <span className="whitespace-nowrap font-mono text-xs">{row.original.tx_number || "—"}</span>,
        size: 110,
      },
      {
        id: "created_at",
        accessorFn: (r: Row) => r.created_at,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.date")} />,
        cell: ({ row }) => <span className="whitespace-nowrap">{new Date(row.original.created_at).toLocaleString()}</span>,
        size: 150,
      },
      {
        id: "type",
        accessorFn: (r: Row) => r.type,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("transactions.typeLabel")} />,
        cell: ({ row }) => (
          <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + TX_TYPE_BADGE[row.original.type]}>
            {TX_TYPE_LABEL[row.original.type]}
          </span>
        ),
        size: 110,
      },
      {
        id: "status",
        accessorFn: (r: Row) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.status")} />,
        cell: ({ row }) => (
          <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + TX_STATUS_BADGE[row.original.status]}>
            {TX_STATUS_LABEL[row.original.status]}
          </span>
        ),
        size: 110,
      },
      {
        id: "branch",
        accessorFn: (r: Row) => r.from_branch_name,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.branch")} />,
        cell: ({ row }) => branchText(row.original),
        size: 170,
      },
      {
        id: "item_count",
        accessorFn: (r: Row) => r.item_count,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.qty")} />,
        cell: ({ row }) => <span className="block text-right tabular-nums">{row.original.item_count}</span>,
        size: 80,
      },
      {
        id: "created_by_email",
        accessorFn: (r: Row) => r.created_by_email,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("transactions.colWho")} />,
        cell: ({ row }) => row.original.created_by_email || <span className="text-slate-300">—</span>,
        size: 170,
      },
      {
        id: "note",
        accessorFn: (r: Row) => r.note,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.note")} />,
        cell: ({ row }) =>
          row.original.note ? (
            <span className="block max-w-[220px] truncate">{row.original.note}</span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
        size: 180,
      },
      {
        id: "actions",
        header: () => <span className="text-xs font-semibold uppercase tracking-wide">{t("transactions.colReceipt")}</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const tx = row.original;
          if (!(tx.type === "transfer" && tx.status === "pending" && canReceive)) return null;
          return (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => onReceive(tx)}
                disabled={busy}
                className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
              >
                {t("transactions.receive")}
              </button>
              <button
                onClick={() => onCancel(tx)}
                disabled={busy}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          );
        },
        size: 130,
      },
    ];
    return cols;
  }, [t, branchText, canReceive, busy, onReceive, onCancel]);

  const exportConfig = useMemo(() => {
    const mapping: Record<string, string> = {
      tx_number: "№",
      created_at: t("common.date"),
      type: t("transactions.typeLabel"),
      status: t("common.status"),
      branch: t("common.branch"),
      item_count: t("common.qty"),
      created_by_email: t("transactions.colWho"),
      note: t("common.note"),
    };
    const headers = Object.keys(mapping);
    return {
      entityName: "transactions",
      columnMapping: mapping,
      columnWidths: headers.map(() => ({ wch: 16 })),
      headers,
      // Төрөл/төлөв Монгол нэрээр, тоо ТҮҮХИЙ; бусад далд талбар орохгүй.
      transformFunction: (row: Row) => ({
        tx_number: row.tx_number ?? "",
        created_at: new Date(row.created_at).toLocaleString(),
        type: TX_TYPE_LABEL[row.type as TxRow["type"]],
        status: TX_STATUS_LABEL[row.status as TxRow["status"]],
        branch: branchText(row),
        item_count: row.item_count,
        created_by_email: row.created_by_email ?? "",
        note: row.note ?? "",
      }),
    };
  }, [t, branchText]);

  return (
    <div className="space-y-2">
      {activeFilterCount > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
          <ListFilter size={13} />
          <span>{t("dataTable.filterActive", { n: activeFilterCount })}</span>
          <span className="flex-1" />
          <button className="text-slate-400 hover:text-slate-700 hover:underline" onClick={() => setFilters({})}>
            {t("dataTable.reset")}
          </button>
        </p>
      )}
    <DataTable<Row, unknown>
      getColumns={getColumns}
      fetchDataFn={fetchDataFn}
      filterRow={filterRow}
      exportConfig={exportConfig}
      idField="id"
      pageSizeOptions={[25, 50, 100, 250]}
      onRowClick={(row) => onOpen(row)}
      config={{
        enableRowSelection: false,
        enableSearch: true,
        enableDateFilter: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableExport: true,
        enableUrlState: false,
        enableKeyboardNavigation: true,
        size: "sm",
        columnResizingTableId: "tx-history-table",
        searchPlaceholder: t("transactions.searchPh"),
        defaultSortBy: "created_at",
        defaultSortOrder: "desc",
      }}
    />
    </div>
  );
}
