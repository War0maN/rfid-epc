import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { useSession } from "./hooks/useSession";
import { acceptInvite, fetchMyProfile, type MyProfile } from "./lib/tenantAuth";
import Login from "./components/Login";
import Onboarding from "./components/Onboarding";
import CreateJobForm from "./components/CreateJobForm";
import EpcTable from "./components/EpcTable";
import EpcLookup from "./components/EpcLookup";
import AuditLog from "./components/AuditLog";
import Members from "./components/Members";

type Tab = "create" | "table" | "lookup" | "audit" | "members";

const TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: "create", label: "Шинэ ажил" },
  { id: "table", label: "EPC хүснэгт" },
  { id: "lookup", label: "Хайлт" },
  { id: "audit", label: "Аудит" },
  { id: "members", label: "Хэрэглэгчид", adminOnly: true },
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
  const { session, loading } = useSession();
  const [tab, setTab] = useState<Tab>("create");
  // EpcTable-г сэргээх дохио: шинэ ажил үүсгэх бүрт нэмэгдэнэ.
  const [refreshKey, setRefreshKey] = useState(0);

  // Нэвтэрсэн хэрэглэгчийн профайл (тенанттай эсэхийг шалгах).
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

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
        Ачаалж байна…
      </div>
    );
  }

  if (!session) return <Login />;

  // Нэвтэрсэн ч тенантгүй бол байгууллагаа үүсгүүлнэ.
  if (!profile) return <Onboarding onDone={loadProfile} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900">RFID EPC Generator</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{session.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Гарах
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {TABS.filter((t) => !t.adminOnly || profile.role === "admin").map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "border-b-2 px-4 py-2 text-sm font-medium transition " +
                (tab === t.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "create" && (
          <CreateJobForm
            onCreated={() => {
              setRefreshKey((k) => k + 1);
              setTab("table");
            }}
          />
        )}
        {tab === "table" && <EpcTable refreshKey={refreshKey} />}
        {tab === "lookup" && <EpcLookup />}
        {tab === "audit" && <AuditLog />}
        {tab === "members" && profile.role === "admin" && <Members />}
      </main>
    </div>
  );
}

export default App;
