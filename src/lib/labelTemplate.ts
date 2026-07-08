// ============================================================
// Шошгоны загвар (label template) — төрөл, дата холболт, Supabase CRUD.
// Координат бүгд миллиметрээр (хэвлэх/preview-д DPI-аар хөрвүүлнэ).
// ============================================================
import { supabase } from "./supabaseClient";

/** Объектод холбож болох системийн талбарууд. */
export type LabelDataField =
  | "static"
  | "name"
  | "sku"
  | "gtin"
  | "epc_hex"
  | "serial"
  | "box_no"
  | "job_number"
  | "arrival_date"
  | "supplier";

// label = орчуулгын ТҮЛХҮҮР — харуулахдаа t(f.label)-ээр орчуулна (LabelDesigner).
export const DATA_FIELDS: { value: LabelDataField; label: string }[] = [
  { value: "static", label: "labels.field.static" },
  { value: "name", label: "labels.field.name" },
  { value: "sku", label: "labels.field.sku" },
  { value: "gtin", label: "labels.field.gtin" },
  { value: "epc_hex", label: "labels.field.epcHex" },
  { value: "serial", label: "labels.field.serial" },
  { value: "box_no", label: "labels.field.boxNo" },
  { value: "job_number", label: "labels.field.jobNumber" },
  { value: "arrival_date", label: "labels.field.arrivalDate" },
  { value: "supplier", label: "labels.field.supplier" },
];

export type Symbology = "code128" | "ean13" | "qrcode" | "datamatrix";

// label = орчуулгын ТҮЛХҮҮР — харуулахдаа t(s.label)-ээр орчуулна (LabelDesigner).
export const SYMBOLOGIES: { value: Symbology; label: string }[] = [
  { value: "qrcode", label: "labels.symbology.qrcode" },
  { value: "datamatrix", label: "labels.symbology.datamatrix" },
  { value: "code128", label: "labels.symbology.code128" },
  { value: "ean13", label: "labels.symbology.ean13" },
];

export type LabelObjectType = "text" | "barcode" | "image" | "rfid" | "rect";

interface BaseObject {
  id: string;
  type: LabelObjectType;
  x: number; // мм (зүүн дээд булан)
  y: number;
  rotation: number; // градус
}

export interface TextObject extends BaseObject {
  type: "text";
  field: LabelDataField;
  text: string; // static текст эсвэл preview-ийн орлуулга
  width: number; // мм
  fontSize: number; // pt
  fontFamily: string;
  bold: boolean;
  align: "left" | "center" | "right";
}

export interface BarcodeObject extends BaseObject {
  type: "barcode";
  symbology: Symbology;
  field: LabelDataField;
  text: string;
  width: number; // мм
  height: number; // мм
  showText: boolean; // HRI (хүн уншихуйц текст)
}

export interface ImageObject extends BaseObject {
  type: "image";
  src: string; // data URL
  width: number;
  height: number;
}

export interface RfidObject extends BaseObject {
  type: "rfid";
  field: "epc_hex"; // чипэд бичих утга (одоогоор EPC)
}

export interface RectObject extends BaseObject {
  type: "rect";
  width: number;
  height: number;
  borderWidth: number; // мм
}

export type LabelObject = TextObject | BarcodeObject | ImageObject | RfidObject | RectObject;

export interface LabelTemplate {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
  objects: LabelObject[];
  offset_x_mm: number; // хэвлэх байрлал тааруулга (баруун +, зүүн −)
  offset_y_mm: number; // (доош +, дээш −)
}

/** Шошгон дээр орлуулах дата (нэг EPC мөр). */
export interface LabelData {
  name?: string | null;
  sku?: string | null;
  gtin?: string | null;
  epc_hex?: string | null;
  serial?: number | string | null;
  box_no?: string | null;
  job_number?: string | null;
  arrival_date?: string | null;
  supplier?: string | null;
}

/** Талбар/чөлөөт текстээс бодит утга гаргана. */
export function resolveField(field: LabelDataField, staticText: string, data: LabelData): string {
  if (field === "static") return staticText;
  const v = data[field as keyof LabelData];
  return v == null ? "" : String(v);
}

let seq = 0;
function uid(): string {
  seq += 1;
  return `o${Date.now().toString(36)}${seq}`;
}

/** Шинэ объектын анхдагч утга (төв орчимд байрлуулна). */
export function newObject(type: LabelObjectType, cx: number, cy: number): LabelObject {
  const base = { id: uid(), x: Math.max(0, cx - 10), y: Math.max(0, cy - 4), rotation: 0 };
  switch (type) {
    case "text":
      return {
        ...base,
        type: "text",
        field: "name",
        text: "Текст",
        width: 30,
        fontSize: 9,
        fontFamily: "Arial",
        bold: false,
        align: "left",
      };
    case "barcode":
      return {
        ...base,
        type: "barcode",
        symbology: "qrcode",
        field: "epc_hex",
        text: "",
        width: 16,
        height: 16,
        showText: false,
      };
    case "image":
      return { ...base, type: "image", src: "", width: 20, height: 12 };
    case "rfid":
      return { ...base, type: "rfid", field: "epc_hex" };
    case "rect":
      return { ...base, type: "rect", width: 24, height: 12, borderWidth: 0.3 };
  }
}

// ---------- Supabase CRUD ----------

interface TemplateRow {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
  objects: LabelObject[];
  offset_x_mm: number | null;
  offset_y_mm: number | null;
}

/** DB мөрийг LabelTemplate болгоно (offset null бол 0). */
function toTemplate(r: TemplateRow): LabelTemplate {
  return { ...r, offset_x_mm: r.offset_x_mm ?? 0, offset_y_mm: r.offset_y_mm ?? 0 };
}

const TEMPLATE_COLS = "id, name, width_mm, height_mm, dpi, objects, offset_x_mm, offset_y_mm";

export async function listTemplates(): Promise<LabelTemplate[]> {
  const { data, error } = await supabase
    .from("label_templates")
    .select(TEMPLATE_COLS)
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as TemplateRow[]).map(toTemplate);
}

/** Шинэ template үүсгэх (хоосон). */
export async function createTemplate(
  name: string,
  width_mm: number,
  height_mm: number,
  dpi: number
): Promise<LabelTemplate> {
  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const { data, error } = await supabase
    .from("label_templates")
    .insert({
      tenant_id: (tenant as { id: string }).id,
      name,
      width_mm,
      height_mm,
      dpi,
      objects: [],
    })
    .select(TEMPLATE_COLS)
    .single();
  if (error) throw error;
  return toTemplate(data as TemplateRow);
}

/** Template-ийг хадгалах (нэр, хэмжээ, объектууд, байрлал offset). */
export async function saveTemplate(t: LabelTemplate): Promise<void> {
  const { error } = await supabase
    .from("label_templates")
    .update({
      name: t.name,
      width_mm: t.width_mm,
      height_mm: t.height_mm,
      dpi: t.dpi,
      objects: t.objects,
      offset_x_mm: t.offset_x_mm,
      offset_y_mm: t.offset_y_mm,
      updated_at: new Date().toISOString(),
    })
    .eq("id", t.id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("label_templates").delete().eq("id", id);
  if (error) throw error;
}
