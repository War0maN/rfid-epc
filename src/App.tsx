import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LANGS, setLang, type Lang } from "./i18n";
import { supabase } from "./lib/supabaseClient";
import { useSession } from "./hooks/useSession";
import { acceptInvite, fetchMyProfile, fetchMyBranchIds, fetchMyPerms, type MyProfile } from "./lib/tenantAuth";
import { isPlatformAdmin } from "./lib/platform";
import { makeCan, TAB_PERM } from "./lib/permissions";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import Onboarding from "./components/Onboarding";
import CreateJobForm from "./components/CreateJobForm";
import Receiving from "./components/Receiving";
import Stocktake from "./components/Stocktake";
import EpcTable from "./components/EpcTable";
import EpcLookup from "./components/EpcLookup";
import AuditLog from "./components/AuditLog";
import Members from "./components/Members";
import Catalog from "./components/Catalog";
import ProductList from "./components/ProductList";
import Inventory from "./components/Inventory";
import Transactions from "./components/Transactions";
import Branches from "./components/Branches";
import OrgSettings from "./components/OrgSettings";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppSidebar } from "./components/app-sidebar";
import { SiteHeader } from "./components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
// Шошгоны дизайнер (Konva/bwip-js том) — зөвхөн нээх үед ачаална.
const Labels = lazy(() => import("./components/Labels"));
// Тайлан (recharts том) — зөвхөн нээх үед ачаална.
const Reports = lazy(() => import("./components/Reports"));
// Платформын хяналт — зөвхөн платформын админд, нээх үед ачаална.
const PlatformConsole = lazy(() => import("./components/PlatformConsole"));

export type Tab = "create" | "receiving" | "products" | "inventory" | "stocktake" | "transactions" | "reports" | "table" | "lookup" | "labels" | "branches" | "org" | "audit" | "members" | "platform";

// label = орчуулгын түлхүүр (render дээр t()-ээр уншина).
export type TabDef = { id: Tab; label: string; adminOnly?: boolean };
// Хажуугийн цэс = дан таб эсвэл бүлэг (дэд табуудтай). Бүлгийн бүх хүүхэд
// эрхээр нуугдвал бүлэг өөрөө нуугдана. (Төрлүүдийг app-sidebar.tsx ашигладаг.)
export type NavGroup = { group: string; label: string; children: TabDef[] };
export type NavItem = TabDef | NavGroup;

const NAV: NavItem[] = [
  {
    group: "epc",
    label: "app.tabEpc",
    children: [
      { id: "table", label: "app.tabEpcList" },
      { id: "create", label: "app.tabCreate" },
      { id: "receiving", label: "app.tabReceiving" },
      { id: "labels", label: "app.tabLabels" },
      { id: "lookup", label: "app.tabLookup" },
    ],
  },
  { id: "products", label: "app.tabProducts" },
  { id: "inventory", label: "app.tabInventory" },
  { id: "stocktake", label: "app.tabStocktake" },
  { id: "transactions", label: "app.tabTransactions" },
  { id: "reports", label: "app.tabReports" },
  {
    group: "admin",
    label: "app.groupAdmin",
    children: [
      { id: "branches", label: "app.tabBranches" },
      { id: "org", label: "app.tabOrg", adminOnly: true },
      { id: "audit", label: "app.tabAudit" },
      { id: "members", label: "app.tabMembers", adminOnly: true },
    ],
  },
];

function isGroup(n: NavItem): n is NavGroup {
  return "children" in n;
}

// Бүлэг бүрийн сүүлд нээсэн дэд табыг санах localStorage түлхүүр.
const subTabKey = (group: string) => `navSub.${group}`;

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
  const { session, loading, recovery, clearRecovery } = useSession();
  const [tab, setTab] = useState<Tab>("table");
  // Бүтээгдэхүүн табын дэд таб: жагсаалт | ангилал (каталог).
  const [productsView, setProductsView] = useState<"list" | "catalog">("list");
  // lookupHex = EPC жагсаалтаас дарсан EPC (хайлт таб руу дамжина).
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
  // Платформын админ эсэх — тенантын эрхээс ТУСДАА (DB-ийн platform_admins).
  const [platformAdmin, setPlatformAdmin] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void (async () => {
      try {
        // Админ, эсвэл ИЛ "бүрэн эрх" горимд байгаа гишүүн — хязгааргүй.
        if (profile.role === "admin" || profile.access_mode === "full") {
          if (active) {
            setAllowedBranches(null);
            setMyPerms(null);
          }
          return;
        }
        const [ids, perms] = await Promise.all([fetchMyBranchIds(), fetchMyPerms()]);
        if (!active) return;
        setAllowedBranches(ids.length > 0 ? ids : null);
        // ХООСОН массив = ямар ч эрхгүй (null = бүрэн эрх — хоёрыг бүү хутга).
        setMyPerms(perms);
      } catch {
        // Татаж чадаагүй үед ХААЛТТАЙ тал руу — эрхийг таамаглахгүй.
        if (active) {
          setAllowedBranches(null);
          setMyPerms([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [profile]);

  // Платформын хяналтын таб харуулах эсэх. Эрхгүй бол RPC false буцаана.
  useEffect(() => {
    if (!session) return;
    let active = true;
    isPlatformAdmin()
      .then((v) => active && setPlatformAdmin(v))
      .catch(() => active && setPlatformAdmin(false));
    return () => {
      active = false;
    };
  }, [session]);

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

  // Нууц үг сэргээх холбоосоор орж ирсэн — эхлээд шинэ нууц үг тавиулна.
  if (recovery) return <ResetPassword onDone={clearRecovery} />;

  // Нэвтэрсэн ч тенантгүй бол байгууллагаа үүсгүүлнэ.
  if (!profile) return <Onboarding onDone={loadProfile} />;

  // Эрхээр харагдах табууд; идэвхтэй таб нуугдсан бол эхний зөвшөөрөгдсөн рүү.
  const tabVisible = (tb: TabDef) =>
    (!tb.adminOnly || profile.role === "admin") && (!TAB_PERM[tb.id] || can(TAB_PERM[tb.id]));
  // Платформын таб нь тенантын эрх/TAB_PERM-д хамаарахгүй — зөвхөн
  // platform_admins-д бүртгэлтэй хүнд, цэсний хамгийн сүүлд нэмэгдэнэ.
  const nav: NavItem[] = platformAdmin
    ? [...NAV, { id: "platform", label: "app.tabPlatform" } as TabDef]
    : NAV;
  const visibleNav: NavItem[] = nav
    .map((n) => (isGroup(n) ? { ...n, children: n.children.filter(tabVisible) } : n))
    .filter((n) => (isGroup(n) ? n.children.length > 0 : tabVisible(n)));
  const visibleTabIds = visibleNav.flatMap((n) => (isGroup(n) ? n.children.map((c) => c.id) : [n.id]));
  // Эрх огт олгоогүй гишүүн (fail-closed default) — хоосон таб рүү оруулахын
  // оронд юу хийхийг нь ойлгомжтой хэлнэ.
  const noAccess = visibleTabIds.length === 0;
  const activeTab: Tab = visibleTabIds.includes(tab) ? tab : (visibleTabIds[0] ?? "table");
  // Идэвхтэй табын нэр — контентын дээд мөрийн гарчигт.
  const activeLabel = visibleNav
    .flatMap((n) => (isGroup(n) ? n.children : [n]))
    .find((d) => d.id === activeTab)?.label;

  // Таб сонгоход бүлэг доторх сүүлийн байрлалыг санана.
  const selectTab = (id: Tab, group?: string) => {
    setTab(id);
    if (group) localStorage.setItem(subTabKey(group), id);
  };

  return (
    <TooltipProvider>
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 72)",
        "--header-height": "calc(var(--spacing) * 12)",
      } as CSSProperties}
    >
      <AppSidebar
        variant="inset"
        nav={visibleNav}
        activeTab={activeTab}
        onSelectTab={selectTab}
        email={session.user.email ?? ""}
        onSignOut={() => supabase.auth.signOut()}
      />
      <SidebarInset>
        <SiteHeader title={activeLabel ? t(activeLabel) : "Chipmo Inventory"}>
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
        </SiteHeader>

      <main className="flex-1 px-4 py-6 lg:px-6">
        {/* Нэг табын render алдаа бүтэн аппыг цагаан дэлгэц болгохгүй —
            алдаа тухайн табд хязгаарлагдаж, таб солиход цэвэрлэгдэнэ. */}
        {noAccess && (
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-800">{t("app.noAccessTitle")}</p>
            <p className="mt-2 text-sm text-slate-500">{t("app.noAccessHint")}</p>
          </div>
        )}
        {!noAccess && (
        <ErrorBoundary resetKey={activeTab}>
        {activeTab === "create" && (
          <CreateJobForm
            allowedBranches={allowedBranches}
            onCreated={() => {
              setRefreshKey((k) => k + 1);
              selectTab("table", "epc");
            }}
          />
        )}
        {activeTab === "receiving" && (
          <Receiving allowedBranches={allowedBranches} perms={myPerms} />
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
        {activeTab === "stocktake" && (
          <Stocktake
            isAdmin={profile.role === "admin"}
            allowedBranches={allowedBranches}
            perms={myPerms}
          />
        )}
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
        {activeTab === "platform" && platformAdmin && (
          <Suspense
            fallback={<div className="py-10 text-center text-slate-400">{t("app.reportsLoading")}</div>}
          >
            <PlatformConsole />
          </Suspense>
        )}
        {activeTab === "table" && (
          <EpcTable
            refreshKey={refreshKey}
            isAdmin={profile.role === "admin"}
            perms={myPerms}
            onLookup={(hex) => {
              setLookupHex(hex);
              selectTab("lookup", "epc");
            }}
          />
        )}
        {activeTab === "lookup" && (
          <EpcLookup key={lookupHex ?? "manual"} initialHex={lookupHex ?? undefined} />
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
        {activeTab === "org" && profile.role === "admin" && <OrgSettings />}
        {activeTab === "audit" && <AuditLog />}
        {activeTab === "members" && profile.role === "admin" && <Members />}
        </ErrorBoundary>
        )}
      </main>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
