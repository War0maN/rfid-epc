import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGS, setLang, type Lang } from "./i18n";
import { supabase } from "./lib/supabaseClient";
import { useSession } from "./hooks/useSession";
import { acceptInvite, fetchMyProfile, fetchMyBranchIds, fetchMyPerms, type MyProfile } from "./lib/tenantAuth";
import { makeCan, TAB_PERM } from "./lib/permissions";
import Login from "./components/Login";
import Onboarding from "./components/Onboarding";
import CreateJobForm from "./components/CreateJobForm";
import EpcTable from "./components/EpcTable";
import EpcLookup from "./components/EpcLookup";
import AuditLog from "./components/AuditLog";
import Members from "./components/Members";
import Catalog from "./components/Catalog";
import ProductList from "./components/ProductList";
import Inventory from "./components/Inventory";
import Transactions from "./components/Transactions";
import Branches from "./components/Branches";
import { lazy, Suspense } from "react";
// Шошгоны дизайнер (Konva/bwip-js том) — зөвхөн нээх үед ачаална.
const Labels = lazy(() => import("./components/Labels"));
// Тайлан (recharts том) — зөвхөн нээх үед ачаална.
const Reports = lazy(() => import("./components/Reports"));

type Tab = "create" | "products" | "inventory" | "transactions" | "reports" | "table" | "labels" | "branches" | "audit" | "members";

// label = орчуулгын түлхүүр (render дээр t()-ээр уншина).
const TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: "create", label: "app.tabCreate" },
  { id: "products", label: "app.tabProducts" },
  { id: "inventory", label: "app.tabInventory" },
  { id: "transactions", label: "app.tabTransactions" },
  { id: "reports", label: "app.tabReports" },
  { id: "table", label: "app.tabEpc" },
  { id: "labels", label: "app.tabLabels" },
  { id: "branches", label: "app.tabBranches" },
  { id: "audit", label: "app.tabAudit" },
  { id: "members", label: "app.tabMembers", adminOnly: true },
];

/**
 * Профайл татах. Профайлгүй бол урилга шалгаж, байвал нэгдэнэ.
 * Профайл (эсвэл онбординг хэрэгтэй бол null) буцаана.
 */
async function loadProfileOrAcceptInvite(): Promise<MyProfile | null> {
  const p = await fetchMyProfile();
  if (p) return p;
  // Профайлгүй → урилга байгаа эсэхийг шалгах
  try {
    const joined = await acceptInvite();
    if (joined) return await fetchMyProfile();
  } catch {
    // accept_invite функц/хүснэгт байхгүй бол онбординг руу уначна
  }
  return null;
}

function App() {
  const { t, i18n } = useTranslation();
  const { session, loading } = useSession();
  const [tab, setTab] = useState<Tab>("create");
  // Бүтээгдэхүүн табын дэд таб: жагсаалт | ангилал (каталог).
  const [productsView, setProductsView] = useState<"list" | "catalog">("list");
  // Бараа (EPC) табын дэд таб: жагсаалт | хайлт. lookupHex = жагсаалтаас дарсан EPC.
  const [epcView, setEpcView] = useState<"list" | "lookup">("list");
  const [lookupHex, setLookupHex] = useState<string | null>(null);
  // EpcTable-г сэргээх дохио: шинэ ажил үүсгэх бүрт нэмэгдэнэ.
  const [refreshKey, setRefreshKey] = useState(0);

  // Нэвтэрсэн хэрэглэгчийн профайл (тенанттай эсэхийг шалгах).
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  // Хуваарилагдсан салбарууд: null = хязгааргүй (админ эсвэл хуваарилалтгүй).
  const [allowedBranches, setAllowedBranches] = useState<string[] | null>(null);
  // Олгосон эрхүүд: null = бүрэн (админ эсвэл тохиргоогүй).
  const [myPerms, setMyPerms] = useState<string[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void (async () => {
      try {
        if (profile.role === "admin") {
          if (active) {
            setAllowedBranches(null);
            setMyPerms(null);
          }
          return;
        }
        const [ids, perms] = await Promise.all([fetchMyBranchIds(), fetchMyPerms()]);
        if (!active) return;
        setAllowedBranches(ids.length > 0 ? ids : null);
        setMyPerms(perms.length > 0 ? perms : null);
      } catch {
        if (active) {
          setAllowedBranches(null);
          setMyPerms(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [profile]);

  const can = makeCan(myPerms);

  // Онбординг дууссаны дараа дахин татах (event — синхрон setState зүгээр).
  const loadProfile = useCallback(() => {
    setProfileChecked(false);
    loadProfileOrAcceptInvite()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileChecked(true));
  }, []);

  // Session өөрчлөгдөхөд профайлыг татах. Effect дотор синхроноор setState
  // дуудахгүйн тулд (lint) бүх төлвийг promise-callback дотор сольё.
  useEffect(() => {
    if (!session) return; // session null үед render шууд Login руу чиглүүлнэ
    let active = true;
    loadProfileOrAcceptInvite()
      .then((p) => active && setProfile(p))
      .catch(() => active && setProfile(null))
      .finally(() => active && setProfileChecked(true));
    return () => {
      active = false;
    };
  }, [session]);

  if (loading || (session && !profileChecked)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        {t("app.loading")}
      </div>
    );
  }

  if (!session) return <Login />;

  // Нэвтэрсэн ч тенантгүй бол байгууллагаа үүсгүүлнэ.
  if (!profile) return <Onboarding onDone={loadProfile} />;

  // Эрхээр харагдах табууд; идэвхтэй таб нуугдсан бол эхний зөвшөөрөгдсөн рүү.
  const visibleTabs = TABS.filter(
    (t) => (!t.adminOnly || profile.role === "admin") && (!TAB_PERM[t.id] || can(TAB_PERM[t.id]))
  );
  const activeTab: Tab = visibleTabs.some((t) => t.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? "create");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900">RFID EPC Generator</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={i18n.language}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
              aria-label="Language"
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="hidden text-sm text-slate-500 sm:inline">{session.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("app.signOut")}
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {visibleTabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={
                "border-b-2 px-4 py-2 text-sm font-medium transition " +
                (activeTab === tb.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {t(tb.label)}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {activeTab === "create" && (
          <CreateJobForm
            allowedBranches={allowedBranches}
            onCreated={() => {
              setRefreshKey((k) => k + 1);
              setTab("table");
            }}
          />
        )}
        {activeTab === "products" && (
          <div className="space-y-4">
            <div className="flex gap-1 border-b border-slate-200">
              {(
                [
                  { id: "list", label: "app.subProducts" },
                  { id: "catalog", label: "app.subCatalog" },
                ] as const
              ).map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setProductsView(tb.id)}
                  className={
                    "rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium " +
                    (productsView === tb.id
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-700")
                  }
                >
                  {t(tb.label)}
                </button>
              ))}
            </div>
            {productsView === "list" ? (
              <ProductList
                isAdmin={profile.role === "admin"}
                allowedBranches={allowedBranches}
                perms={myPerms}
                onEpcsGenerated={() => setRefreshKey((k) => k + 1)}
              />
            ) : (
              <Catalog canEdit={can("act_catalog_edit")} />
            )}
          </div>
        )}
        {activeTab === "inventory" && <Inventory refreshKey={refreshKey} allowedBranches={allowedBranches} />}
        {activeTab === "transactions" && (
          <Transactions refreshKey={refreshKey} allowedBranches={allowedBranches} perms={myPerms} />
        )}
        {activeTab === "reports" && (
          <Suspense
            fallback={<div className="py-10 text-center text-slate-400">{t("app.reportsLoading")}</div>}
          >
            <Reports />
          </Suspense>
        )}
        {activeTab === "table" && (
          <div className="space-y-4">
            <div className="flex gap-1 border-b border-slate-200">
              {(
                [
                  { id: "list", label: "app.subList" },
                  { id: "lookup", label: "app.subLookup" },
                ] as const
              ).map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setEpcView(tb.id)}
                  className={
                    "rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium " +
                    (epcView === tb.id
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-700")
                  }
                >
                  {t(tb.label)}
                </button>
              ))}
            </div>
            {epcView === "list" ? (
              <EpcTable
                refreshKey={refreshKey}
                isAdmin={profile.role === "admin"}
                perms={myPerms}
                onLookup={(hex) => {
                  setLookupHex(hex);
                  setEpcView("lookup");
                }}
              />
            ) : (
              <EpcLookup key={lookupHex ?? "manual"} initialHex={lookupHex ?? undefined} />
            )}
          </div>
        )}
        {activeTab === "labels" && (
          <Suspense
            fallback={<div className="py-10 text-center text-slate-400">{t("app.designerLoading")}</div>}
          >
            <Labels />
          </Suspense>
        )}
        {/* Салбар засах UI: админ, эсвэл тусгайлан act_branch_edit олгосон оператор
            (default бүрэн эрхтэй оператор өмнөх шигээ зөвхөн харна). */}
        {activeTab === "branches" && (
          <Branches
            isAdmin={
              profile.role === "admin" || (myPerms !== null && myPerms.includes("act_branch_edit"))
            }
          />
        )}
        {activeTab === "audit" && <AuditLog />}
        {activeTab === "members" && profile.role === "admin" && <Members />}
      </main>
    </div>
  );
}

export default App;
