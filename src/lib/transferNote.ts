// ============================================================
// Шилжүүлгийн падаан (Stock Transfer Note) — олон улсын Delivery Note
// загвар: толгой (байгууллага, №, огноо, гаргасан/хүлээн авах салбар),
// их бие (бараагаар бүлэглэсэн хүснэгт), хөл (гарын үсэг + тамга).
// Урсгал: TransferNoteDialog модал урьдчилан харуулж (текстийг шууд
// засаж болно), "Хэвлэх" дарахад iframe-ийн print() дуудагдана —
// browser-ийн хэвлэх цонхноос "PDF болгож хадгалах" сонгож PDF болгоно.
// ============================================================
import { supabase } from "./supabaseClient";
import { fetchTxItems } from "./transactions";
import i18n from "../i18n";

interface NoteParty {
  name: string;
  address: string | null;
  phone: string | null;
}

/** HTML escape — хэрэглэгчийн оруулсан текст баримтад аюулгүй орно. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

/** Салбарын нэр + хаяг/утас блок. */
function partyHtml(label: string, p: NoteParty | null): string {
  const t = (k: string) => i18n.t(k);
  if (!p) return `<div class="party"><div class="party-label">${esc(label)}</div><div class="party-name">—</div></div>`;
  const lines: string[] = [];
  if (p.address) lines.push(esc(p.address));
  if (p.phone) lines.push(`${esc(t("transferNote.phone"))}: ${esc(p.phone)}`);
  return (
    `<div class="party"><div class="party-label">${esc(label)}</div>` +
    `<div class="party-name">${esc(p.name)}</div>` +
    (lines.length ? `<div class="party-meta">${lines.join("<br/>")}</div>` : "") +
    `</div>`
  );
}

/** Падааны бүрэн HTML-ийг угсарна (өгөгдлөө өөрөө татна). */
export async function buildNoteHtml(txId: string): Promise<{ title: string; html: string }> {
  const t = (k: string) => i18n.t(k);

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .select("id, tx_number, type, status, from_branch, to_branch, note, created_by, created_at")
    .eq("id", txId)
    .single();
  if (txErr) throw txErr;
  const txRow = tx as {
    id: string; tx_number: string | null; type: string; status: string;
    from_branch: string | null; to_branch: string | null; note: string | null;
    created_by: string | null; created_at: string;
  };

  const [tenantRes, branchesRes, profilesRes, items] = await Promise.all([
    supabase.from("tenants").select("name, address, phone, email").single(),
    supabase.from("branches").select("id, name, address, phone"),
    supabase.from("profiles").select("id, email"),
    fetchTxItems(txId),
  ]);
  if (tenantRes.error) throw tenantRes.error;
  if (branchesRes.error) throw branchesRes.error;
  const tenant = tenantRes.data as { name: string; address: string | null; phone: string | null; email: string | null };
  const branches = (branchesRes.data ?? []) as ({ id: string } & NoteParty)[];
  const bById = new Map(branches.map((b) => [b.id, b]));
  const profiles = (profilesRes.data ?? []) as { id: string; email: string | null }[];
  const issuedBy = txRow.created_by
    ? (profiles.find((p) => p.id === txRow.created_by)?.email ?? null)
    : null;

  // Бараагаар бүлэглэнэ (SKU + нэр + нэгж үнэ ижил бол нэг мөр).
  const groups = new Map<string, { sku: string | null; name: string | null; price: number | null; qty: number }>();
  for (const it of items) {
    const key = `${it.sku ?? ""}|${it.name ?? ""}|${it.price ?? ""}`;
    const g = groups.get(key);
    if (g) g.qty += 1;
    else groups.set(key, { sku: it.sku, name: it.name, price: it.price, qty: 1 });
  }
  const lines = [...groups.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const totalQty = items.length;
  const totalAmount = lines.reduce((s, l) => s + (l.price != null ? l.price * l.qty : 0), 0);

  const num = txRow.tx_number ?? txRow.id.slice(0, 8).toUpperCase();
  const date = new Date(txRow.created_at).toLocaleString();
  const from = txRow.from_branch ? (bById.get(txRow.from_branch) ?? null) : null;
  const to = txRow.to_branch ? (bById.get(txRow.to_branch) ?? null) : null;

  const orgMeta = [
    tenant.address,
    tenant.phone ? `${t("transferNote.phone")}: ${tenant.phone}` : null,
    tenant.email,
  ].filter(Boolean).map((s) => esc(s as string)).join(" · ");

  const rowsHtml = lines
    .map(
      (l, i) =>
        `<tr>` +
        `<td class="c">${i + 1}</td>` +
        `<td class="mono">${l.sku ? esc(l.sku) : "—"}</td>` +
        `<td>${l.name ? esc(l.name) : "—"}</td>` +
        `<td class="r">${l.qty.toLocaleString()}</td>` +
        `<td class="r">${l.price != null ? l.price.toLocaleString() : "—"}</td>` +
        `<td class="r">${l.price != null ? (l.price * l.qty).toLocaleString() : "—"}</td>` +
        `</tr>`
    )
    .join("");

  const signBlock = (label: string) =>
    `<div class="sign">` +
    `<div class="sign-label">${esc(label)}</div>` +
    `<div class="sign-line">${esc(t("transferNote.signName"))}: <span></span></div>` +
    `<div class="sign-line">${esc(t("transferNote.signSignature"))}: <span></span></div>` +
    `<div class="sign-line">${esc(t("transferNote.signDate"))}: <span></span></div>` +
    `</div>`;

  const subtitle = t("transferNote.docSubtitle");
  const html = `<!doctype html>
<html lang="${i18n.language}">
<head>
<meta charset="utf-8"/>
<title>${esc(num)} — ${esc(t("transferNote.docTitle"))}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  /* CJK фонтуудыг ил зааж өгнө — хэвлэх/PDF үед хятад үсэг гээгдэхээс сэргийлнэ. */
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial,
         "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
         color: #0f172a; font-size: 12px; margin: 0; }
  /* Модал дотор текстийг шууд засаж болно — фокустай хэсгийг зөөлөн тодруулна. */
  [contenteditable="true"] *:focus { outline: 1px dashed #94a3b8; outline-offset: 1px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
  .org-name { font-size: 16px; font-weight: 700; }
  .org-meta { color: #475569; margin-top: 3px; max-width: 320px; }
  .doc { text-align: right; }
  .doc-title { font-size: 17px; font-weight: 800; letter-spacing: 0.5px; }
  .doc-sub { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .doc-no { margin-top: 6px; font-weight: 700; }
  .doc-date { color: #475569; margin-top: 2px; }
  .parties { display: flex; gap: 12px; margin-top: 12px; }
  .party { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .party-name { font-weight: 700; margin-top: 2px; font-size: 13px; }
  .party-meta { color: #475569; margin-top: 3px; }
  .meta { margin-top: 8px; color: #475569; }
  .meta b { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px;
       text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  td { border: 1px solid #cbd5e1; padding: 6px 8px; }
  td.c { text-align: center; width: 34px; }
  td.r, th.r { text-align: right; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 11px; }
  tfoot td { font-weight: 700; background: #f8fafc; }
  .signs { display: flex; gap: 16px; margin-top: 28px; }
  .sign { flex: 1; }
  .sign-label { font-weight: 700; margin-bottom: 10px; font-size: 12px; }
  .sign-line { margin-top: 14px; color: #475569; }
  .sign-line span { display: inline-block; border-bottom: 1px solid #94a3b8; width: 60%; height: 12px; }
  .stamp-row { display: flex; justify-content: flex-end; margin-top: 24px; }
  .stamp { width: 130px; height: 130px; border: 1.5px dashed #94a3b8; border-radius: 50%;
           display: flex; align-items: center; justify-content: center; color: #94a3b8;
           font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  @media print { .no-print { display: none; } }
  /* Дэлгэцийн урьдчилан харалтад л зай авна — хэвлэхэд @page margin үйлчилнэ. */
  @media screen { body { padding: 24px; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="org-name">${esc(tenant.name)}</div>
      ${orgMeta ? `<div class="org-meta">${orgMeta}</div>` : ""}
    </div>
    <div class="doc">
      <div class="doc-title">${esc(t("transferNote.docTitle"))}</div>
      ${subtitle ? `<div class="doc-sub">${esc(subtitle)}</div>` : ""}
      <div class="doc-no">№ ${esc(num)}</div>
      <div class="doc-date">${esc(t("transferNote.date"))}: ${esc(date)}</div>
    </div>
  </div>

  <div class="parties">
    ${partyHtml(t("transferNote.from"), from)}
    ${partyHtml(t("transferNote.to"), to)}
  </div>

  <div class="meta">
    ${issuedBy ? `${esc(t("transferNote.issuedBy"))}: <b>${esc(issuedBy)}</b>` : ""}
    ${txRow.note ? ` · ${esc(t("transferNote.note"))}: <b>${esc(txRow.note)}</b>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>SKU</th>
        <th>${esc(t("transferNote.colItem"))}</th>
        <th class="r">${esc(t("transferNote.colQty"))}</th>
        <th class="r">${esc(t("transferNote.colUnitPrice"))}</th>
        <th class="r">${esc(t("transferNote.colAmount"))}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">${esc(t("transferNote.total"))}</td>
        <td class="r">${totalQty.toLocaleString()}</td>
        <td></td>
        <td class="r">${totalAmount.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>

  <div class="signs">
    ${signBlock(t("transferNote.preparedBy"))}
    ${signBlock(t("transferNote.deliveredBy"))}
    ${signBlock(t("transferNote.receivedBy"))}
  </div>

  <div class="stamp-row"><div class="stamp">${esc(t("transferNote.stamp"))}</div></div>
</body>
</html>`;
  return { title: num, html };
}
