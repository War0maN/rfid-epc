// EPC жагсаалт — tnks-data-table (TanStack Table + shadcn) суурьтай шинэ
// хүснэгт: server-side хуудаслалт/эрэмбэ, ерөнхий хайлт, огнооны интервал,
// баганын харагдац/өргөн, URL state, хуудас дамнасан сонголт + бөөн үйлдэл
// (Хэвлэх / Төлөв өөрчлөх / Устгах), CSV·Excel экспорт.
// Баганын төрөлжсөн шүүлтүүд (хуучин EpcTable) дараагийн шатанд нэмэгдэнэ.
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Printer, Tags, Trash2 } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  fetchEpcPageGlobal,
  fetchEpcByIds,
  type EpcRow,
} from "../lib/queries";
import { markPrintedBulk, changeStatusBulk, deleteUnprintedBulk } from "../lib/epcBulk";
import { EPC_STATUSES, STATUS_LABEL, badgeOf, labelOf, type EpcStatus } from "../lib/epcStatus";
import { formatMoney } from "../lib/format";
import { errorMessage } from "../lib/errorMessage";
import ConfirmDialog from "./ConfirmDialog";
import PrintDialog from "./PrintDialog";

/** tnks-ийн ExportableData (index signature) шаардлагад нийцүүлсэн мөр. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = EpcRow & Record<string, any>;

interface Props {
  refreshKey?: number;
  isAdmin: boolean;
  perms?: string[] | null;
  onLookup?: (hex: string) => void;
}

/** tnks fetchDataFn-ий параметрүүд (vendored data-table.tsx-тэй ижил хэлбэр). */
interface FetchParams {
  page: number;
  limit: number;
  search: string;
  from_date: string;
  to_date: string;
  sort_by: string;
  sort_order: string;
}

function buildColumns(
  t: (k: string, o?: Record<string, unknown>) => string,
  handleRowDeselection: ((rowId: string) => void) | null | undefined,
  onLookup?: (hex: string) => void
): ColumnDef<Row, unknown>[] {
  const cols: ColumnDef<Row, unknown>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="select all"
          className="translate-y-0.5"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => {
            row.toggleSelected(!!v);
            if (!v && handleRowDeselection) handleRowDeselection(row.id);
          }}
          aria-label="select row"
          className="translate-y-0.5"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 36,
    },
    {
      accessorKey: "epc_hex",
      id: "epc_hex",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colEpcHex")} />,
      cell: ({ row }) => (
        <button
          className="font-mono text-xs text-indigo-600 hover:underline"
          onClick={() => onLookup?.(row.original.epc_hex)}
          title={t("epcTable.lookupTitle")}
        >
          {row.original.epc_hex}
        </button>
      ),
      size: 215,
    },
    {
      accessorKey: "serial",
      id: "serial",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colSerial")} />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.serial}</span>,
      size: 80,
    },
    {
      accessorKey: "status",
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.status")} />,
      cell: ({ row }) => (
        <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + badgeOf(row.original.status)}>
          {labelOf(row.original.status)}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: "name",
      id: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.product")} />,
      cell: ({ row }) => row.original.name ?? "—",
      size: 200,
    },
    {
      accessorKey: "branch_name",
      id: "branch_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.branch")} />,
      cell: ({ row }) => row.original.branch_name ?? t("transactions.noBranch"),
      size: 130,
    },
    {
      accessorKey: "sku",
      id: "sku",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.sku")} />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku ?? "—"}</span>,
      size: 140,
    },
    {
      accessorKey: "price",
      id: "price",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.price")} />,
      cell: ({ row }) =>
        row.original.price != null ? <span className="tabular-nums">{formatMoney(row.original.price)}</span> : "—",
      size: 100,
    },
    {
      accessorKey: "cost",
      id: "cost",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.cost")} />,
      cell: ({ row }) =>
        row.original.cost != null ? <span className="tabular-nums">{formatMoney(row.original.cost)}</span> : "—",
      size: 100,
    },
    {
      accessorKey: "gtin",
      id: "gtin",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colGtin")} />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.gtin}</span>,
      size: 140,
    },
    {
      accessorKey: "category_l1",
      id: "category_l1",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colCat1")} />,
      cell: ({ row }) => row.original.category_l1 ?? "—",
      size: 130,
    },
    {
      accessorKey: "category_l2",
      id: "category_l2",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colCat2")} />,
      cell: ({ row }) => row.original.category_l2 ?? "—",
      size: 130,
    },
    {
      accessorKey: "category_l3",
      id: "category_l3",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colCat3")} />,
      cell: ({ row }) => row.original.category_l3 ?? "—",
      size: 130,
    },
    {
      accessorKey: "box_no",
      id: "box_no",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colBox")} />,
      cell: ({ row }) => row.original.box_no ?? "—",
      size: 100,
    },
    {
      accessorKey: "job_number",
      id: "job_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colJob")} />,
      cell: ({ row }) => row.original.job_number ?? "—",
      size: 110,
    },
    {
      accessorKey: "arrival_date",
      id: "arrival_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colDate")} />,
      cell: ({ row }) => row.original.arrival_date ?? "—",
      size: 110,
    },
    {
      accessorKey: "supplier",
      id: "supplier",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("epcTable.colSupplier")} />,
      cell: ({ row }) => row.original.supplier ?? "—",
      size: 130,
    },
  ];
  return cols;
}

export default function EpcDataTable({ refreshKey = 0, isAdmin, perms = null, onLookup }: Props) {
  const { t } = useTranslation();
  const can = (p: string) => perms == null || perms.includes(p);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Үйлдлийн дараах refetch: fetchDataFn-ий identity солигдоход хүснэгт дахин татна.
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((k) => k + 1);

  // Бөөн үйлдлийн диалогууд
  const [printRows, setPrintRows] = useState<EpcRow[] | null>(null);
  const [statusRows, setStatusRows] = useState<EpcRow[] | null>(null);
  const [statusTarget, setStatusTarget] = useState<EpcStatus>("active");
  const [statusNote, setStatusNote] = useState("");
  const [deleteRows, setDeleteRows] = useState<EpcRow[] | null>(null);

  const fetchDataFn = useCallback(
    async (p: FetchParams) => {
      void reloadKey;
      void refreshKey;
      const { rows, total } = await fetchEpcPageGlobal({
        page: p.page,
        pageSize: p.limit,
        search: p.search,
        fromDate: p.from_date || undefined,
        toDate: p.to_date || undefined,
        sortBy: p.sort_by,
        sortOrder: p.sort_order,
      });
      return {
        success: true,
        data: rows as Row[],
        pagination: {
          page: p.page,
          limit: p.limit,
          total_pages: Math.max(1, Math.ceil(total / p.limit)),
          total_items: total,
        },
      };
    },
    [reloadKey, refreshKey]
  );

  const getColumns = useCallback(
    (handleRowDeselection: ((rowId: string) => void) | null | undefined) =>
      buildColumns(t, handleRowDeselection, onLookup),
    [t, onLookup]
  );

  const exportConfig = useMemo(() => {
    const mapping: Record<string, string> = {
      epc_hex: t("epcTable.colEpcHex"),
      serial: t("epcTable.colSerial"),
      status: t("common.status"),
      name: t("common.product"),
      branch_name: t("common.branch"),
      sku: t("common.sku"),
      price: t("common.price"),
      cost: t("common.cost"),
      gtin: t("epcTable.colGtin"),
      box_no: t("epcTable.colBox"),
      job_number: t("epcTable.colJob"),
      arrival_date: t("epcTable.colDate"),
      supplier: t("epcTable.colSupplier"),
    };
    const headers = Object.keys(mapping);
    return {
      entityName: "epc",
      columnMapping: mapping,
      columnWidths: headers.map(() => ({ wch: 16 })),
      headers,
      // Төлөвийг Монгол нэрээр нь; null → хоосон (CSV-д тоо ТҮҮХИЙ хэвээр).
      // attributes (объект) экспортын мөрөнд орохгүй — текст хувилбар нь үлдэнэ.
      transformFunction: (row: Row) => ({
        ...Object.fromEntries(Object.entries(row).filter(([k]) => k !== "attributes")),
        status: labelOf(row.status),
        name: row.name ?? "",
        branch_name: row.branch_name ?? "",
        sku: row.sku ?? "",
        box_no: row.box_no ?? "",
        job_number: row.job_number ?? "",
        arrival_date: row.arrival_date ?? "",
        supplier: row.supplier ?? "",
      }),
    };
  }, [t]);

  /** Сонголтыг бүтэн мөрүүд болгоно (хуудас дамнасан сонголтод id-аар татна). */
  async function resolveSelected(selectedRows: Row[], allSelectedIds: string[]): Promise<EpcRow[]> {
    if (allSelectedIds.length <= selectedRows.length) return selectedRows;
    return fetchEpcByIds(allSelectedIds);
  }

  async function runStatusChange() {
    if (!statusRows) return;
    setBusy(true);
    setError(null);
    try {
      await changeStatusBulk(statusRows, statusTarget, statusNote);
      setInfo(t("epcTable.statusChanged", { n: statusRows.length }));
      setStatusRows(null);
      setStatusNote("");
      bump();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    if (!deleteRows) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteUnprintedBulk(deleteRows);
      if (res.deleted === 0) {
        setError(t("epcTable.nothingDeletable"));
      } else {
        setInfo(
          t("epcTable.deletedInfo", { n: res.deleted }) +
            (res.skippedStatus + res.skippedHistory > 0
              ? " · " + t("epcTable.deleteSkipped", { n: res.skippedStatus + res.skippedHistory })
              : "")
        );
      }
      setDeleteRows(null);
      bump();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      <DataTable<Row, unknown>
        getColumns={getColumns}
        fetchDataFn={fetchDataFn}
        fetchByIdsFn={(ids) => fetchEpcByIds(ids.map(String)) as Promise<Row[]>}
        exportConfig={exportConfig}
        idField="id"
        pageSizeOptions={[25, 50, 100, 250]}
        renderToolbarContent={({ selectedRows, allSelectedIds, totalSelectedCount, resetSelection }) => (
          <div className="flex flex-wrap items-center gap-2">
            {can("act_print") && (
              <Button
                variant="outline"
                size="sm"
                disabled={totalSelectedCount === 0 || busy}
                onClick={() => {
                  void resolveSelected(selectedRows, allSelectedIds)
                    .then(setPrintRows)
                    .catch((e) => setError(errorMessage(e)));
                  resetSelection();
                }}
              >
                <Printer size={14} /> {t("epcTable.printN", { n: totalSelectedCount.toLocaleString() })}
              </Button>
            )}
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={totalSelectedCount === 0 || busy}
                  onClick={() => {
                    void resolveSelected(selectedRows, allSelectedIds)
                      .then(setStatusRows)
                      .catch((e) => setError(errorMessage(e)));
                    resetSelection();
                  }}
                >
                  <Tags size={14} /> {t("epcTable.changeStatusN", { n: totalSelectedCount.toLocaleString() })}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600"
                  disabled={totalSelectedCount === 0 || busy}
                  onClick={() => {
                    void resolveSelected(selectedRows, allSelectedIds)
                      .then(setDeleteRows)
                      .catch((e) => setError(errorMessage(e)));
                    resetSelection();
                  }}
                >
                  <Trash2 size={14} /> {t("epcTable.deleteN", { n: totalSelectedCount.toLocaleString() })}
                </Button>
              </>
            )}
          </div>
        )}
        config={{
          enableRowSelection: true,
          enableClickRowSelect: false,
          enableSearch: true,
          enableDateFilter: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          enableExport: true,
          enableUrlState: true,
          enableKeyboardNavigation: true,
          size: "sm",
          columnResizingTableId: "epc-data-table",
          searchPlaceholder: t("dataTable.searchPh"),
        }}
      />

      {/* Хэвлэх — одоо байгаа PrintDialog urshгал (загвар + Browser Print) */}
      {printRows && (
        <PrintDialog
          rows={printRows}
          onClose={() => setPrintRows(null)}
          onPrinted={() => {
            void markPrintedBulk(printRows)
              .then(bump)
              .catch((e) => setError(errorMessage(e)));
          }}
        />
      )}

      {/* Төлөв өөрчлөх — тэмдэглэлтэй (EPC бүрийн түүхэнд бичигдэнэ) */}
      {statusRows && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setStatusRows(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold text-slate-900">
              {t("epcTable.changeStatusN", { n: statusRows.length.toLocaleString() })}
            </h3>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("common.status")}
            </label>
            <select
              value={statusTarget}
              onChange={(e) => setStatusTarget(e.target.value as EpcStatus)}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {EPC_STATUSES.filter((s) => s !== "transferring").map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("epcTable.noteLabel")}
            </label>
            <textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={2}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder={t("epcTable.notePlaceholder")}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setStatusRows(null)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void runStatusChange()}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Устгах баталгаажуулалт — зөвхөн Хэвлээгүй, түүхгүй мөрүүд устгагдана */}
      {deleteRows && (
        <ConfirmDialog
          message={t("epcTable.deleteConfirmN", { n: deleteRows.length.toLocaleString() })}
          danger
          busy={busy}
          onCancel={() => setDeleteRows(null)}
          onConfirm={() => void runDelete()}
        />
      )}
    </div>
  );
}
