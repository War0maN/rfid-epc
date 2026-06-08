// ============================================================
// Packing list CSV import -> бараа upsert -> Job үүсгэх -> EPC генерац
// CSV багана: source_gtin, item_reference, name, quantity
//   - source_gtin     : үйлдвэрлэгчийн GTIN (заавал биш, ТАНИХад)
//   - item_reference  : тенантын prefix дор оноосон код (шинэ бараанд шаардлагатай)
//   - name            : барааны нэр (заавал биш)
//   - quantity        : тоо ширхэг
// Бараа аль хэдийн байгаа бол source_gtin-аар таниж дахин ашиглана
// (item_reference хоосон байж болно).
// ============================================================
import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEpcsForJob, type JobLine } from "./generateEpcs";

interface RawRow {
  source_gtin?: string;
  item_reference?: string;
  name?: string;
  quantity?: string;
}

interface CleanRow {
  sourceGtin: string | null;
  itemReference: string | null;
  name: string | null;
  quantity: number;
}

export interface ImportJobInput {
  jobNumber: string;
  arrivalDate: string; // 'YYYY-MM-DD'
  supplier?: string;
  note?: string;
}

function clean(rows: RawRow[]): CleanRow[] {
  const out: CleanRow[] = [];
  rows.forEach((r, i) => {
    const sourceGtin = (r.source_gtin || "").replace(/\D/g, "") || null;
    const itemReference = (r.item_reference || "").replace(/\D/g, "") || null;
    const quantity = parseInt(String(r.quantity || "").trim(), 10);
    if (!sourceGtin && !itemReference) {
      throw new Error(`Мөр ${i + 1}: source_gtin эсвэл item_reference-ийн аль нэг шаардлагатай`);
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`Мөр ${i + 1}: quantity буруу (${r.quantity})`);
    }
    out.push({ sourceGtin, itemReference, name: r.name?.trim() || null, quantity });
  });
  return out;
}

/** CSV текстийг уншиж бараа upsert хийгээд Job үүсгэж EPC генерацлэнэ. */
export async function importPackingListCsv(
  supabase: SupabaseClient,
  csvText: string,
  job: ImportJobInput
) {
  // 1) Parse
  const parsed = Papa.parse<RawRow>(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    throw new Error("CSV parse алдаа: " + parsed.errors[0].message);
  }
  const rows = clean(parsed.data);

  // Тенант id
  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = tenant.id as string;

  // 2) item_reference-тэй мөрүүдээс бараа upsert (шинэ/шинэчлэх)
  const upserts = rows
    .filter((r) => r.itemReference)
    .map((r) => ({
      tenant_id: tenantId,
      item_reference: r.itemReference!,
      source_gtin: r.sourceGtin,
      name: r.name,
      indicator: 0,
      source: "packing_list" as const,
    }));
  if (upserts.length) {
    const { error: uErr } = await supabase
      .from("products")
      .upsert(upserts, { onConflict: "tenant_id,item_reference" });
    if (uErr) throw uErr;
  }

  // 3) Хэрэгтэй бараануудыг татаж lookup map үүсгэх
  const { data: products, error: gErr } = await supabase
    .from("products")
    .select("id, source_gtin, item_reference");
  if (gErr) throw gErr;

  const byGtin = new Map<string, string>();
  const byRef = new Map<string, string>();
  for (const p of products as { id: string; source_gtin: string | null; item_reference: string }[]) {
    if (p.source_gtin) byGtin.set(p.source_gtin, p.id);
    byRef.set(p.item_reference, p.id);
  }

  // 4) Мөр бүрийг product руу холбож, тоог нэгтгэх
  const countByProduct = new Map<string, number>();
  rows.forEach((r, i) => {
    let productId: string | undefined;
    if (r.itemReference) productId = byRef.get(r.itemReference);
    else if (r.sourceGtin) productId = byGtin.get(r.sourceGtin);

    if (!productId) {
      throw new Error(
        `Мөр ${i + 1}: бараа олдсонгүй. Шинэ бараанд item_reference шаардлагатай ` +
          `(GTIN ${r.sourceGtin ?? "-"})`
      );
    }
    countByProduct.set(productId, (countByProduct.get(productId) ?? 0) + r.quantity);
  });

  // 5) Job үүсгэх
  const { data: jobRow, error: jErr } = await supabase
    .from("jobs")
    .insert({
      tenant_id: tenantId,
      job_number: job.jobNumber,
      arrival_date: job.arrivalDate,
      supplier: job.supplier ?? null,
      note: job.note ?? null,
      status: "draft",
    })
    .select("id")
    .single();
  if (jErr) throw jErr;

  // 6) EPC генерац (allocate -> encode -> insert)
  const lines: JobLine[] = [...countByProduct.entries()].map(([productId, count]) => ({
    productId,
    count,
  }));
  const epcs = await generateEpcsForJob(supabase, { jobId: jobRow.id, lines });

  return { jobId: jobRow.id as string, totalEpcs: epcs.length, epcs };
}

// Файл сонгогчоос: importPackingListCsv(supabase, await file.text(), {...})
