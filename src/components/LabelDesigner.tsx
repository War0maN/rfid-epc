import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from "react-konva";
import type Konva from "konva";
import {
  type LabelTemplate,
  type LabelObject,
  type LabelObjectType,
  type LabelData,
  DATA_FIELDS,
  SYMBOLOGIES,
  resolveField,
  newObject,
} from "../lib/labelTemplate";
import { renderBarcodeCanvas } from "../lib/barcode";

const PT_TO_MM = 0.352778;

/** Preview-д ашиглах жишээ дата (холбосон талбарууд утгатай харагдана). */
const SAMPLE: LabelData = {
  name: "Adidas T-shirt M",
  sku: "JY2441-A130",
  gtin: "4068822938365",
  epc_hex: "3034F857482F468000000028",
  serial: 40,
  box_no: "CTA034576477",
  job_number: "2222223",
  arrival_date: "2026-06-09",
  supplier: "Adidas",
};

interface Props {
  template: LabelTemplate;
  onChange: (t: LabelTemplate) => void;
}

/** Нэг талбарын утга (preview-д жишээ дата орлуулна). */
function objValue(o: LabelObject): string {
  if (o.type === "text" || o.type === "barcode") {
    return resolveField(o.field, o.text, SAMPLE);
  }
  if (o.type === "rfid") return SAMPLE.epc_hex ?? "";
  return "";
}

// ---------- Объектын Konva зангилаанууд ----------

interface NodeProps {
  o: LabelObject;
  px: (mm: number) => number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<LabelObject>) => void;
  pxToMm: (p: number) => number;
}

function commonHandlers(onChange: NodeProps["onChange"], pxToMm: (p: number) => number) {
  return {
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ x: pxToMm(e.target.x()), y: pxToMm(e.target.y()) } as Partial<LabelObject>);
    },
  };
}

function TextNode({ o, px, onSelect, onChange, pxToMm }: NodeProps) {
  if (o.type !== "text") return null;
  const value = objValue(o) || (o.field === "static" ? "" : `{${o.field}}`);
  return (
    <Text
      id={o.id}
      x={px(o.x)}
      y={px(o.y)}
      width={px(o.width)}
      rotation={o.rotation}
      text={value}
      fontSize={o.fontSize * PT_TO_MM * (px(1) || 1)}
      fontFamily={o.fontFamily}
      fontStyle={o.bold ? "bold" : "normal"}
      align={o.align}
      fill="#000"
      draggable
      onClick={onSelect}
      onTap={onSelect}
      {...commonHandlers(onChange, pxToMm)}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Text;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: pxToMm(node.x()),
          y: pxToMm(node.y()),
          width: Math.max(2, pxToMm(node.width() * scaleX)),
          fontSize: Math.max(4, o.fontSize * scaleY),
          rotation: node.rotation(),
        } as Partial<LabelObject>);
      }}
    />
  );
}

function RectNode({ o, px, onSelect, onChange, pxToMm }: NodeProps) {
  if (o.type !== "rect") return null;
  return (
    <Rect
      id={o.id}
      x={px(o.x)}
      y={px(o.y)}
      width={px(o.width)}
      height={px(o.height)}
      rotation={o.rotation}
      stroke="#000"
      strokeWidth={Math.max(1, px(o.borderWidth))}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      {...commonHandlers(onChange, pxToMm)}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Rect;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: pxToMm(node.x()),
          y: pxToMm(node.y()),
          width: Math.max(2, pxToMm(node.width() * sx)),
          height: Math.max(2, pxToMm(node.height() * sy)),
          rotation: node.rotation(),
        } as Partial<LabelObject>);
      }}
    />
  );
}

function RfidNode({ o, px, onSelect, onChange, pxToMm }: NodeProps) {
  if (o.type !== "rfid") return null;
  const w = 22;
  const h = 8;
  return (
    <>
      <Rect
        id={o.id}
        x={px(o.x)}
        y={px(o.y)}
        width={px(w)}
        height={px(h)}
        rotation={o.rotation}
        stroke="#7c3aed"
        dash={[4, 3]}
        strokeWidth={1}
        fill="rgba(124,58,237,0.06)"
        draggable
        onClick={onSelect}
        onTap={onSelect}
        {...commonHandlers(onChange, pxToMm)}
      />
      <Text
        x={px(o.x) + 3}
        y={px(o.y) + 2}
        text={"📡 RFID чип"}
        fontSize={Math.max(8, px(2.2))}
        fill="#7c3aed"
        listening={false}
      />
    </>
  );
}

function BarcodeNode({ o, px, onSelect, onChange, pxToMm }: NodeProps) {
  const value = objValue(o);
  const symbology = o.type === "barcode" ? o.symbology : "qrcode";
  const showText = o.type === "barcode" ? o.showText : false;
  const canvas = useMemo(
    () => renderBarcodeCanvas(symbology, value, showText, 4),
    [symbology, value, showText]
  );
  if (o.type !== "barcode") return null;
  if (!canvas) {
    return (
      <Rect
        id={o.id}
        x={px(o.x)}
        y={px(o.y)}
        width={px(o.width)}
        height={px(o.height)}
        rotation={o.rotation}
        stroke="#cbd5e1"
        dash={[3, 3]}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        {...commonHandlers(onChange, pxToMm)}
      />
    );
  }
  return (
    <KonvaImage
      id={o.id}
      image={canvas}
      x={px(o.x)}
      y={px(o.y)}
      width={px(o.width)}
      height={px(o.height)}
      rotation={o.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      {...commonHandlers(onChange, pxToMm)}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Image;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: pxToMm(node.x()),
          y: pxToMm(node.y()),
          width: Math.max(4, pxToMm(node.width() * sx)),
          height: Math.max(4, pxToMm(node.height() * sy)),
          rotation: node.rotation(),
        } as Partial<LabelObject>);
      }}
    />
  );
}

function ImageNode({ o, px, onSelect, onChange, pxToMm }: NodeProps) {
  const [loaded, setLoaded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const src = o.type === "image" ? o.src : "";
  useEffect(() => {
    if (!src) return;
    let active = true;
    const im = new window.Image();
    im.onload = () => active && setLoaded({ src, img: im });
    im.src = src;
    return () => {
      active = false;
    };
  }, [src]);
  // src өөрчлөгдвөл хуучин зураг автоматаар хүчингүй (синхрон setState-гүй).
  const img = loaded && loaded.src === src ? loaded.img : null;
  if (o.type !== "image") return null;
  if (!img) {
    return (
      <Rect
        id={o.id}
        x={px(o.x)}
        y={px(o.y)}
        width={px(o.width)}
        height={px(o.height)}
        rotation={o.rotation}
        stroke="#cbd5e1"
        dash={[3, 3]}
        fill="#f8fafc"
        draggable
        onClick={onSelect}
        onTap={onSelect}
        {...commonHandlers(onChange, pxToMm)}
      />
    );
  }
  return (
    <KonvaImage
      id={o.id}
      image={img}
      x={px(o.x)}
      y={px(o.y)}
      width={px(o.width)}
      height={px(o.height)}
      rotation={o.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      {...commonHandlers(onChange, pxToMm)}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Image;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onChange({
          x: pxToMm(node.x()),
          y: pxToMm(node.y()),
          width: Math.max(4, pxToMm(node.width() * sx)),
          height: Math.max(4, pxToMm(node.height() * sy)),
          rotation: node.rotation(),
        } as Partial<LabelObject>);
      }}
    />
  );
}

// ---------- Үндсэн дизайнер ----------

export default function LabelDesigner({ template, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Дэлгэцийн масштаб: шошгыг ~520px өргөнд багтаана (хамгийн багадаа 4 px/mm).
  const pxPerMm = Math.max(4, Math.min(12, 520 / template.width_mm));
  const px = (mm: number) => mm * pxPerMm;
  const pxToMm = (p: number) => p / pxPerMm;

  const selected = template.objects.find((o) => o.id === selectedId) ?? null;

  // Transformer-ийг сонгосон зангилаанд холбоно.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (!selectedId) {
      tr.nodes([]);
      return;
    }
    const node = stage.findOne<Konva.Node>(`#${selectedId}`);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, template.objects]);

  function updateObject(id: string, patch: Partial<LabelObject>) {
    onChange({
      ...template,
      objects: template.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as LabelObject) : o)),
    });
  }

  function addObject(type: LabelObjectType) {
    const o = newObject(type, template.width_mm / 2, template.height_mm / 2);
    onChange({ ...template, objects: [...template.objects, o] });
    setSelectedId(o.id);
  }

  function removeSelected() {
    if (!selectedId) return;
    onChange({ ...template, objects: template.objects.filter((o) => o.id !== selectedId) });
    setSelectedId(null);
  }

  /** Сонгосон объектыг давхаргын дарааллаар нь зөөнө (зурах дараалал = z-order). */
  function moveSelected(dir: "front" | "back" | "forward" | "backward") {
    if (!selectedId) return;
    const objs = [...template.objects];
    const i = objs.findIndex((o) => o.id === selectedId);
    if (i < 0) return;
    const [item] = objs.splice(i, 1);
    let j: number;
    if (dir === "front") j = objs.length;
    else if (dir === "back") j = 0;
    else if (dir === "forward") j = Math.min(objs.length, i + 1);
    else j = Math.max(0, i - 1);
    objs.splice(j, 0, item);
    onChange({ ...template, objects: objs });
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected || selected.type !== "image") return;
    const reader = new FileReader();
    reader.onload = () => updateObject(selected.id, { src: String(reader.result) } as Partial<LabelObject>);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const renderNode = (o: LabelObject) => {
    const np: NodeProps = {
      o,
      px,
      pxToMm,
      selected: o.id === selectedId,
      onSelect: () => setSelectedId(o.id),
      onChange: (patch) => updateObject(o.id, patch),
    };
    switch (o.type) {
      case "text":
        return <TextNode key={o.id} {...np} />;
      case "barcode":
        return <BarcodeNode key={o.id} {...np} />;
      case "image":
        return <ImageNode key={o.id} {...np} />;
      case "rfid":
        return <RfidNode key={o.id} {...np} />;
      case "rect":
        return <RectNode key={o.id} {...np} />;
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Зүүн: хэрэгсэл + canvas */}
      <div className="flex-1 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => addObject("text")} className={toolBtn}>+ Текст</button>
          <button onClick={() => addObject("barcode")} className={toolBtn}>+ Баркод/QR</button>
          <button onClick={() => addObject("image")} className={toolBtn}>+ Зураг</button>
          <button onClick={() => addObject("rfid")} className={toolBtn}>+ RFID</button>
          <button onClick={() => addObject("rect")} className={toolBtn}>+ Хүрээ</button>
          {selectedId && (
            <>
              <span className="mx-1 w-px self-stretch bg-slate-200" />
              <button onClick={() => moveSelected("front")} className={toolBtn} title="Хамгийн урд (дээр) гаргах">
                ⤒ Урд
              </button>
              <button onClick={() => moveSelected("forward")} className={toolBtn} title="Нэг шат урагшлуулах">
                ↑
              </button>
              <button onClick={() => moveSelected("backward")} className={toolBtn} title="Нэг шат ухраах">
                ↓
              </button>
              <button onClick={() => moveSelected("back")} className={toolBtn} title="Хамгийн ард (доор) явуулах">
                ⤓ Ард
              </button>
              <button onClick={removeSelected} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                Устгах
              </button>
            </>
          )}
        </div>

        <div className="inline-block overflow-auto rounded-lg border border-slate-300 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-2">
          <Stage
            ref={stageRef}
            width={px(template.width_mm)}
            height={px(template.height_mm)}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) setSelectedId(null);
            }}
          >
            <Layer>
              {/* Шошгоны цаас */}
              <Rect x={0} y={0} width={px(template.width_mm)} height={px(template.height_mm)} fill="#fff" stroke="#94a3b8" />
              {template.objects.map(renderNode)}
              <Transformer
                ref={trRef}
                rotationSnaps={[0, 90, 180, 270]}
                anchorSize={8}
                borderStroke="#6366f1"
                anchorStroke="#6366f1"
              />
            </Layer>
          </Stage>
        </div>
        <p className="text-xs text-slate-500">
          {template.width_mm}×{template.height_mm}мм · {template.dpi} DPI · {template.objects.length} объект.
          Объект дээр дарж сонгоод чирэх / булангаас нь хэмжээ өөрчлөх / эргүүлэх боломжтой.
        </p>
      </div>

      {/* Баруун: шинж чанар */}
      <div className="w-full shrink-0 space-y-3 lg:w-72">
        {!selected ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
            Объект сонгоно уу.
          </p>
        ) : (
          <PropertiesPanel
            o={selected}
            onChange={(patch) => updateObject(selected.id, patch)}
            onPickImage={() => fileRef.current?.click()}
          />
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
      </div>
    </div>
  );
}

const toolBtn =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";
const lbl = "block text-xs font-medium text-slate-600";
const inp =
  "w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";

// ---------- Шинж чанарын самбар ----------

function PropertiesPanel({
  o,
  onChange,
  onPickImage,
}: {
  o: LabelObject;
  onChange: (patch: Partial<LabelObject>) => void;
  onPickImage: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <div className="font-semibold text-slate-700">
        {o.type === "text" && "Текст"}
        {o.type === "barcode" && "Баркод/QR"}
        {o.type === "image" && "Зураг"}
        {o.type === "rfid" && "RFID чип"}
        {o.type === "rect" && "Хүрээ"}
      </div>

      {/* Дата холболт (текст/баркод) */}
      {(o.type === "text" || o.type === "barcode") && (
        <div>
          <label className={lbl}>Дата талбар</label>
          <select
            value={o.field}
            onChange={(e) => onChange({ field: e.target.value } as Partial<LabelObject>)}
            className={inp}
          >
            {DATA_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          {o.field === "static" && (
            <input
              value={o.text}
              onChange={(e) => onChange({ text: e.target.value } as Partial<LabelObject>)}
              placeholder="Текст бичих"
              className={inp + " mt-1"}
            />
          )}
        </div>
      )}

      {/* Текстийн тохиргоо */}
      {o.type === "text" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Фонт хэмжээ (pt)</label>
              <input
                type="number"
                value={o.fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) } as Partial<LabelObject>)}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Фонт</label>
              <select
                value={o.fontFamily}
                onChange={(e) => onChange({ fontFamily: e.target.value } as Partial<LabelObject>)}
                className={inp}
              >
                {["Arial", "Times New Roman", "Courier New", "Verdana"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={o.bold}
                onChange={(e) => onChange({ bold: e.target.checked } as Partial<LabelObject>)}
              />
              Тод (bold)
            </label>
            <select
              value={o.align}
              onChange={(e) => onChange({ align: e.target.value } as Partial<LabelObject>)}
              className={inp + " w-auto"}
            >
              <option value="left">Зүүн</option>
              <option value="center">Төв</option>
              <option value="right">Баруун</option>
            </select>
          </div>
        </>
      )}

      {/* Баркодын төрөл */}
      {o.type === "barcode" && (
        <>
          <div>
            <label className={lbl}>Төрөл</label>
            <select
              value={o.symbology}
              onChange={(e) => onChange({ symbology: e.target.value } as Partial<LabelObject>)}
              className={inp}
            >
              {SYMBOLOGIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={o.showText}
              onChange={(e) => onChange({ showText: e.target.checked } as Partial<LabelObject>)}
            />
            Текст харуулах (1D)
          </label>
        </>
      )}

      {/* Зураг */}
      {o.type === "image" && (
        <button onClick={onPickImage} className={toolBtn + " w-full"}>
          Зураг сонгох…
        </button>
      )}

      {/* Хүрээ */}
      {o.type === "rect" && (
        <div>
          <label className={lbl}>Шугамын зузаан (мм)</label>
          <input
            type="number"
            step="0.1"
            value={o.borderWidth}
            onChange={(e) => onChange({ borderWidth: Number(e.target.value) } as Partial<LabelObject>)}
            className={inp}
          />
        </div>
      )}

      {/* Байрлал */}
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
        <div>
          <label className={lbl}>X (мм)</label>
          <input
            type="number"
            step="0.5"
            value={round(o.x)}
            onChange={(e) => onChange({ x: Number(e.target.value) } as Partial<LabelObject>)}
            className={inp}
          />
        </div>
        <div>
          <label className={lbl}>Y (мм)</label>
          <input
            type="number"
            step="0.5"
            value={round(o.y)}
            onChange={(e) => onChange({ y: Number(e.target.value) } as Partial<LabelObject>)}
            className={inp}
          />
        </div>
        <div>
          <label className={lbl}>Эргүүлэлт (°)</label>
          <input
            type="number"
            step="15"
            value={round(o.rotation)}
            onChange={(e) => onChange({ rotation: Number(e.target.value) } as Partial<LabelObject>)}
            className={inp}
          />
        </div>
      </div>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
