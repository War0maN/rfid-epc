import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchOrgInfo, updateOrgInfo, type OrgInfo } from "../lib/orgInfo";
import { errorMessage } from "../lib/errorMessage";

const inp =
  "w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

/**
 * Байгууллагын мэдээлэл (Удирдлага > Байгууллага, зөвхөн админ) — нэр,
 * хаяг, утас, имэйл. Шилжүүлгийн падаан зэрэг баримтын толгойд гарна.
 */
export default function OrgSettings() {
  const { t } = useTranslation();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    fetchOrgInfo()
      .then((o) => {
        if (!active) return;
        setOrg(o);
        setName(o.name);
        setAddress(o.address ?? "");
        setPhone(o.phone ?? "");
        setEmail(o.email ?? "");
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function save() {
    if (!org || !name.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    updateOrgInfo(org.id, {
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
    })
      .then(() => setInfo(t("org.saved")))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }

  if (loading) {
    return <p className="py-10 text-center text-slate-400">{t("common.loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("org.title")}</h2>
        <p className="text-sm text-slate-500">{t("org.subtitle")}</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm">
          <span className={lbl}>{t("org.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} />
        </label>
        <label className="block text-sm">
          <span className={lbl}>{t("org.address")}</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("org.addressPlaceholder")} className={inp} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className={lbl}>{t("org.phone")}</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} />
          </label>
          <label className="block text-sm">
            <span className={lbl}>{t("org.email")}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
          </label>
        </div>
        <div className="pt-1">
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
