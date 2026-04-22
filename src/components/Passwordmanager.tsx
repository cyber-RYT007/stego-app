import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PasswordEntry {
  id: string;
  site: string;
  username: string;
  password: string;
  category: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  strength: number;
}

type VaultView = "entries" | "settings";

// ─── Crypto ───────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function deriveKey(master: string): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(master), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("stegosec-vault-v2"), iterations: 100_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv); combined.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(b64: string, key: CryptoKey): Promise<string> {
  const combined = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0)));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(pt);
}

// ─── Password Utils ───────────────────────────────────────────────────────────

function calcStrength(pw: string): number {
  if (!pw || pw.length < 4) return 0;
  let s = 0;
  if (pw.length >= 4) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

const STR_LABEL = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
const STR_COLOR = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#00e5cc"];

function genPassword(len = 16): string {
  const cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?";
  const r = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(r).map(b => cs[b % cs.length]).join("");
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const SK = "stegosec_vault_v2";
const SK_SETTINGS = "stegosec_vault_settings";

function loadVaultRaw() {
  try { return JSON.parse(localStorage.getItem(SK) || "{}"); } catch { return {}; }
}
function saveVaultRaw(masterHash: string, enc: string) {
  localStorage.setItem(SK, JSON.stringify({ masterHash, enc }));
}
function loadSettings(): { autoLockMs: number } {
  try { return JSON.parse(localStorage.getItem(SK_SETTINGS) || "{}"); } catch { return { autoLockMs: 0 }; }
}
function saveSettings(s: { autoLockMs: number }) {
  localStorage.setItem(SK_SETTINGS, JSON.stringify(s));
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATS = ["All", "Social", "Banking", "Work", "Email", "Shopping", "Other"];

const AUTO_LOCK_OPTIONS = [
  { label: "Immediately", ms: 0 },
  { label: "1 minute", ms: 60_000 },
  { label: "5 minutes", ms: 300_000 },
  { label: "15 minutes", ms: 900_000 },
  { label: "Never", ms: -1 },
];

// ─── Shared Styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.4)",
  border: "1px solid rgba(0,245,255,0.12)",
  borderRadius: 8, padding: "10px 14px",
  color: "#fff", fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace",
  outline: "none", transition: "border-color 0.2s",
};

const btnPrimary: React.CSSProperties = {
  fontFamily: "'Oxanium', sans-serif",
  fontWeight: 700, fontSize: 12, letterSpacing: "0.12em",
  padding: "10px 20px", borderRadius: 8,
  border: "1px solid rgba(0,245,255,0.35)",
  background: "rgba(0,245,255,0.1)",
  color: "#00f5ff", cursor: "pointer",
  transition: "all 0.2s",
};

const btnGhost: React.CSSProperties = {
  fontFamily: "'Oxanium', sans-serif",
  fontWeight: 600, fontSize: 12, letterSpacing: "0.1em",
  padding: "8px 16px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent", color: "rgba(255,255,255,0.4)",
  cursor: "pointer", transition: "all 0.2s",
};

const sectionLabel: React.CSSProperties = {
  fontFamily: "'Oxanium', sans-serif",
  fontWeight: 700, fontSize: 10, letterSpacing: "0.2em",
  color: "rgba(0,245,255,0.4)", marginBottom: 8, marginTop: 24,
};

const settingRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 16px",
  borderBottom: "1px solid rgba(0,245,255,0.05)",
  cursor: "pointer",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PasswordManager() {
  const [locked, setLocked] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [masterHash, setMasterHash] = useState<string | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<PasswordEntry[]>([]);

  const [masterInput, setMasterInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [masterVis, setMasterVis] = useState(false);
  const [authErr, setAuthErr] = useState("");

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<VaultView>("entries");

  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<PasswordEntry | null>(null);
  const [form, setForm] = useState({ site: "", username: "", password: "", category: "Other", notes: "" });
  const [formPwVis, setFormPwVis] = useState(false);
  const [genLen, setGenLen] = useState(16);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Settings state
  const [autoLockMs, setAutoLockMs] = useState(-1);
  const [showAutoLockPicker, setShowAutoLockPicker] = useState(false);
  const [showChangeMaster, setShowChangeMaster] = useState(false);
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);
  const [newMaster, setNewMaster] = useState("");
  const [newMasterConfirm, setNewMasterConfirm] = useState("");
  const [masterChangeErr, setMasterChangeErr] = useState("");

  const autoLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { masterHash: mh } = loadVaultRaw();
    if (!mh) setIsNew(true);
    else setMasterHash(mh);
    const s = loadSettings();
    setAutoLockMs(s.autoLockMs ?? -1);
  }, []);

  // Auto-lock logic
  const resetAutoLock = useCallback(() => {
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current);
    if (autoLockMs > 0) {
      autoLockTimer.current = setTimeout(() => {
        handleLock();
        showToast("Vault auto-locked.", true);
      }, autoLockMs);
    }
  }, [autoLockMs]);

  useEffect(() => {
    if (!locked) {
      resetAutoLock();
      window.addEventListener("mousemove", resetAutoLock);
      window.addEventListener("keydown", resetAutoLock);
      window.addEventListener("touchstart", resetAutoLock);
    }
    return () => {
      if (autoLockTimer.current) clearTimeout(autoLockTimer.current);
      window.removeEventListener("mousemove", resetAutoLock);
      window.removeEventListener("keydown", resetAutoLock);
      window.removeEventListener("touchstart", resetAutoLock);
    };
  }, [locked, resetAutoLock]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const handleUnlock = async () => {
    setAuthErr("");
    if (!masterInput.trim()) return setAuthErr("Enter master password.");
    if (isNew) {
      if (masterInput.length < 4) return setAuthErr("Minimum 4 characters required.");
      if (masterInput !== confirmInput) return setAuthErr("Passwords don't match.");
      const hash = await sha256(masterInput);
      const key = await deriveKey(masterInput);
      const enc = await encryptText(JSON.stringify([]), key);
      saveVaultRaw(hash, enc);
      setMasterHash(hash); setCryptoKey(key); setEntries([]); setLocked(false); setIsNew(false);
      showToast("Vault created successfully!");
    } else {
      const { masterHash: mh, enc } = loadVaultRaw();
      const hash = await sha256(masterInput);
      if (hash !== mh) return setAuthErr("Incorrect master password.");
      try {
        const key = await deriveKey(masterInput);
        const dec = await decryptText(enc, key);
        setMasterHash(mh); setCryptoKey(key); setEntries(JSON.parse(dec)); setLocked(false);
        showToast("Vault unlocked!");
      } catch { setAuthErr("Decryption failed."); }
    }
    setMasterInput(""); setConfirmInput("");
  };

  const handleLock = () => {
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current);
    setCryptoKey(null); setEntries([]); setLocked(true);
    setExpandedId(null); setView("entries");
  };

  const persist = useCallback(async (e: PasswordEntry[], k: CryptoKey, mh: string) => {
    const enc = await encryptText(JSON.stringify(e), k);
    saveVaultRaw(mh, enc);
  }, []);

  const openAdd = () => {
    setForm({ site: "", username: "", password: genPassword(genLen), category: "Other", notes: "" });
    setEditEntry(null); setShowModal(true);
  };

  const openEdit = (e: PasswordEntry) => {
    setForm({ site: e.site, username: e.username, password: e.password, category: e.category, notes: e.notes });
    setEditEntry(e); setShowModal(true);
  };

  const saveEntry = async () => {
    if (!form.site.trim() || !form.username.trim() || !form.password.trim())
      return showToast("Site, username & password are required.", false);
    if (form.password.length < 4)
      return showToast("Password must be at least 4 characters.", false);
    const now = Date.now();
    const entry: PasswordEntry = editEntry
      ? { ...editEntry, ...form, strength: calcStrength(form.password), updatedAt: now }
      : { id: crypto.randomUUID(), ...form, strength: calcStrength(form.password), createdAt: now, updatedAt: now };
    const updated = editEntry ? entries.map(e => e.id === entry.id ? entry : e) : [...entries, entry];
    setEntries(updated);
    await persist(updated, cryptoKey!, masterHash!);
    setShowModal(false);
    showToast(editEntry ? "Entry updated!" : "Entry saved!");
  };

  const deleteEntry = async (id: string) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    await persist(updated, cryptoKey!, masterHash!);
    showToast("Entry deleted.");
  };

  // ── Settings actions ────────────────────────────────────────────────────

  const handleAutoLockChange = (ms: number) => {
    setAutoLockMs(ms);
    saveSettings({ autoLockMs: ms });
    setShowAutoLockPicker(false);
    showToast("Auto-lock updated.");
  };

  const handleChangeMaster = async () => {
    setMasterChangeErr("");
    if (newMaster.length < 4) return setMasterChangeErr("Minimum 4 characters.");
    if (newMaster !== newMasterConfirm) return setMasterChangeErr("Passwords don't match.");
    try {
      const newHash = await sha256(newMaster);
      const newKey = await deriveKey(newMaster);
      const enc = await encryptText(JSON.stringify(entries), newKey);
      saveVaultRaw(newHash, enc);
      setMasterHash(newHash); setCryptoKey(newKey);
      setShowChangeMaster(false);
      setNewMaster(""); setNewMasterConfirm("");
      showToast("Master key updated!");
    } catch { setMasterChangeErr("Failed to update. Try again."); }
  };

  const handleExport = () => {
    const exportData = {
      exported: new Date().toISOString(),
      app: "STEGOSEC Password Vault",
      version: "2.0",
      entries: entries.map(e => ({ ...e })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `stegosec-vault-backup-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Backup exported!");
  };

  const handleNuke = () => {
    localStorage.removeItem(SK);
    localStorage.removeItem(SK_SETTINGS);
    setCryptoKey(null); setEntries([]); setLocked(true);
    setMasterHash(null); setIsNew(true);
    setShowNukeConfirm(false); setView("entries");
    showToast("Vault erased.");
  };

  const filtered = entries.filter(e => {
    const mc = cat === "All" || e.category === cat;
    const q = search.toLowerCase();
    return mc && (!q || e.site.toLowerCase().includes(q) || e.username.toLowerCase().includes(q));
  });

  const autoLockLabel = AUTO_LOCK_OPTIONS.find(o => o.ms === autoLockMs)?.label ?? "Never";

  // ── LOCK SCREEN ──────────────────────────────────────────────────────────
  if (locked) {
    return (
      <div style={{ maxWidth: 440, margin: "60px auto", padding: "0 20px" }}>
        {toast && <Toast msg={toast.msg} ok={toast.ok} />}
        <div className="glass fade-up delay-1" style={{ padding: 36, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            border: "1.5px solid rgba(0,245,255,0.3)",
            background: "rgba(0,245,255,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, margin: "0 auto 20px",
            boxShadow: "0 0 32px rgba(0,245,255,0.08)",
          }}>🔑</div>

          <h2 style={{
            fontFamily: "'Oxanium', sans-serif", fontWeight: 800,
            fontSize: 18, letterSpacing: "0.15em", color: "#fff", marginBottom: 6,
          }}>{isNew ? "CREATE VAULT" : "UNLOCK VAULT"}</h2>

          <p style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.06em", marginBottom: 28, lineHeight: 1.8 }}>
            {isNew
              ? "Set a master password to secure your credentials. All data is AES-256 encrypted locally."
              : "Enter master password to access your credentials."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
            <div style={{ position: "relative" }}>
              <input
                type={masterVis ? "text" : "password"}
                placeholder="Master password"
                value={masterInput}
                onChange={e => setMasterInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleUnlock()}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button onClick={() => setMasterVis(v => !v)} style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "rgba(0,245,255,0.5)",
              }}>{masterVis ? "🙈" : "👁"}</button>
            </div>

            {isNew && (
              <input type="password" placeholder="Confirm master password"
                value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleUnlock()} style={inputStyle}
              />
            )}

            {authErr && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f87171",
                fontFamily: "'JetBrains Mono', monospace",
              }}>⚠ {authErr}</div>
            )}

            <button onClick={handleUnlock} style={{ ...btnPrimary, width: "100%", padding: "12px 20px" }}>
              {isNew ? "CREATE VAULT" : "UNLOCK"}
            </button>

            {isNew && (
              <p style={{ fontSize: 11, color: "rgba(0,245,255,0.3)", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
                // minimum 4 characters · no email required
              </p>
            )}
          </div>

          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="badge badge-ok">AES-256-GCM</span>
            <span className="badge badge-info">PBKDF2</span>
            <span className="badge badge-warn">LOCAL ONLY</span>
          </div>
        </div>
      </div>
    );
  }

  // ── VAULT SCREEN ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 20px 60px" }}>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 4,
        borderBottom: "1px solid rgba(0,245,255,0.08)",
        padding: "16px 0 0", marginBottom: 24,
      }}>
        {(["entries", "settings"] as VaultView[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 11,
            letterSpacing: "0.14em", padding: "8px 18px",
            borderRadius: "8px 8px 0 0",
            border: view === v ? "1px solid rgba(0,245,255,0.25)" : "1px solid transparent",
            borderBottom: view === v ? "1px solid rgba(2,8,18,1)" : "1px solid transparent",
            background: view === v ? "rgba(0,245,255,0.08)" : "transparent",
            color: view === v ? "#00f5ff" : "rgba(0,245,255,0.3)",
            cursor: "pointer", transition: "all 0.2s",
            marginBottom: view === v ? -1 : 0,
          }}>
            {v === "entries" ? "🗃 VAULT" : "⚙ SETTINGS"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={handleLock} style={{
          ...btnGhost, fontSize: 11, padding: "6px 14px", alignSelf: "center",
          color: "rgba(239,68,68,0.6)", borderColor: "rgba(239,68,68,0.2)",
        }}>🔒 LOCK</button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ENTRIES VIEW
      ════════════════════════════════════════════════════════════════════ */}
      {view === "entries" && (
        <>
          {/* Header */}
          <div className="fade-up delay-1" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 12, marginBottom: 20,
          }}>
            <div>
              <h2 style={{
                fontFamily: "'Oxanium', sans-serif", fontWeight: 800,
                fontSize: "clamp(1.3rem, 3vw, 1.8rem)", letterSpacing: "0.1em",
                background: "linear-gradient(135deg, #ffffff 0%, #00f5ff 60%, #00e5cc 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 4,
              }}>PASSWORD VAULT</h2>
              <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                // {entries.length} encrypted {entries.length === 1 ? "entry" : "entries"} · AES-256-GCM
              </p>
            </div>
            <button onClick={openAdd} style={btnPrimary}>＋ ADD ENTRY</button>
          </div>

          {/* Search + Filter */}
          <div className="glass fade-up delay-2" style={{ padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
                <input type="text" placeholder="Search site or username..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {CATS.map(c => (
                  <button key={c} onClick={() => setCat(c)} style={{
                    fontFamily: "'Oxanium', sans-serif", fontWeight: 600, fontSize: 10,
                    letterSpacing: "0.12em", padding: "5px 10px", borderRadius: 6,
                    border: cat === c ? "1px solid rgba(0,245,255,0.35)" : "1px solid rgba(0,245,255,0.1)",
                    background: cat === c ? "rgba(0,245,255,0.1)" : "transparent",
                    color: cat === c ? "#00f5ff" : "rgba(0,245,255,0.35)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Entries list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗄</div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: "0.06em" }}>
                {entries.length === 0 ? "// vault is empty — add your first entry" : "// no results found"}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(e => (
                <EntryCard key={e.id} entry={e}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  onEdit={() => openEdit(e)}
                  onDelete={() => deleteEntry(e.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SETTINGS VIEW
      ════════════════════════════════════════════════════════════════════ */}
      {view === "settings" && (
        <div className="fade-up delay-1" style={{ maxWidth: 600 }}>
          <h2 style={{
            fontFamily: "'Oxanium', sans-serif", fontWeight: 800,
            fontSize: "clamp(1.2rem, 3vw, 1.6rem)", letterSpacing: "0.1em",
            background: "linear-gradient(135deg, #ffffff 0%, #00f5ff 60%, #00e5cc 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 4,
          }}>SETTINGS</h2>
          <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", marginBottom: 8 }}>
            // vault configuration & account
          </p>

          {/* ── SECURITY ─────────────────────────────────── */}
          <p style={sectionLabel}>SECURITY</p>
          <div className="glass" style={{ borderRadius: 10, overflow: "hidden", padding: 0 }}>

            {/* Biometric — UI only (web) */}
            <div style={{ ...settingRow, cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>🪪</SettingIcon>
                <div>
                  <div style={settingTitle}>Biometric Unlock</div>
                  <div style={settingSubtitle}>Use device biometrics to unlock</div>
                </div>
              </div>
              <div style={{
                width: 44, height: 24, borderRadius: 12,
                background: "rgba(0,245,255,0.15)",
                border: "1px solid rgba(0,245,255,0.25)",
                display: "flex", alignItems: "center",
                padding: "2px 3px",
                cursor: "not-allowed",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: "rgba(0,245,255,0.4)",
                  marginLeft: "auto",
                  boxShadow: "0 0 6px rgba(0,245,255,0.4)",
                }} />
              </div>
            </div>

            {/* Auto-lock */}
            <div style={settingRow} onClick={() => setShowAutoLockPicker(v => !v)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>⏱</SettingIcon>
                <div>
                  <div style={settingTitle}>Auto-Lock Timeout</div>
                  <div style={settingSubtitle}>Lock vault after inactivity</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "rgba(0,245,255,0.6)", fontFamily: "'JetBrains Mono', monospace" }}>{autoLockLabel}</span>
                <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12 }}>›</span>
              </div>
            </div>

            {/* Auto-lock picker inline */}
            {showAutoLockPicker && (
              <div style={{ background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(0,245,255,0.06)", padding: "8px 16px" }}>
                {AUTO_LOCK_OPTIONS.map(o => (
                  <div key={o.label} onClick={() => handleAutoLockChange(o.ms)} style={{
                    padding: "10px 8px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                    borderRadius: 6, marginBottom: 2,
                    background: autoLockMs === o.ms ? "rgba(0,245,255,0.07)" : "transparent",
                  }}>
                    <span style={{ fontSize: 13, color: autoLockMs === o.ms ? "#00f5ff" : "rgba(255,255,255,0.6)", fontFamily: "'JetBrains Mono', monospace" }}>{o.label}</span>
                    {autoLockMs === o.ms && <span style={{ color: "#00e5cc", fontSize: 14 }}>✓</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Change master key */}
            <div style={{ ...settingRow, borderBottom: "none" }} onClick={() => setShowChangeMaster(true)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>🗝</SettingIcon>
                <div>
                  <div style={settingTitle}>Change Master Key</div>
                  <div style={settingSubtitle}>Update your vault password</div>
                </div>
              </div>
              <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12 }}>›</span>
            </div>
          </div>

          {/* ── DATA MANAGEMENT ──────────────────────────── */}
          <p style={sectionLabel}>DATA MANAGEMENT</p>
          <div className="glass" style={{ borderRadius: 10, overflow: "hidden", padding: 0 }}>

            {/* Backup / Export */}
            <div style={settingRow} onClick={handleExport}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>📤</SettingIcon>
                <div>
                  <div style={settingTitle}>Backup / Export</div>
                  <div style={settingSubtitle}>Download vault as encrypted JSON</div>
                </div>
              </div>
              <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12 }}>›</span>
            </div>

            {/* Nuke */}
            <div style={{ ...settingRow, borderBottom: "none" }} onClick={() => setShowNukeConfirm(true)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon danger>🗑</SettingIcon>
                <div>
                  <div style={{ ...settingTitle, color: "#f87171" }}>Nuke / Erase All</div>
                  <div style={settingSubtitle}>Permanently delete all vault data</div>
                </div>
              </div>
              <span style={{ color: "rgba(239,68,68,0.4)", fontSize: 16 }}>⚠</span>
            </div>
          </div>

          {/* ── APPEARANCE ──────────────────────────────── */}
          <p style={sectionLabel}>APPEARANCE</p>
          <div className="glass" style={{ borderRadius: 10, overflow: "hidden", padding: 0 }}>
            <div style={{ ...settingRow, borderBottom: "none", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>🌙</SettingIcon>
                <div>
                  <div style={settingTitle}>Appearance</div>
                  <div style={settingSubtitle}>System (Automatic)</div>
                </div>
              </div>
              <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12 }}>›</span>
            </div>
          </div>

          {/* ── HELP & SUPPORT ──────────────────────────── */}
          <p style={sectionLabel}>HELP & SUPPORT</p>
          <div className="glass" style={{ borderRadius: 10, overflow: "hidden", padding: 0 }}>
            <div style={{ ...settingRow, borderBottom: "none" }}
              onClick={() => window.open("https://ryt-cyberhub.vercel.app", "_blank")}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>📖</SettingIcon>
                <div>
                  <div style={settingTitle}>User Guide</div>
                  <div style={settingSubtitle}>Visit ryt-cyberhub.vercel.app</div>
                </div>
              </div>
              <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12 }}>›</span>
            </div>
          </div>

          {/* ── ABOUT ───────────────────────────────────── */}
          <p style={sectionLabel}>ABOUT</p>
          <div className="glass" style={{ borderRadius: 10, overflow: "hidden", padding: 0 }}>
            <div style={{ ...settingRow, cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>ℹ</SettingIcon>
                <div style={settingTitle}>Version</div>
              </div>
              <span style={{ fontSize: 12, color: "rgba(0,245,255,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>2.0.0</span>
            </div>

            <div style={{ ...settingRow, cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>🔧</SettingIcon>
                <div style={settingTitle}>Built By</div>
              </div>
              <span style={{ fontSize: 12, color: "#00f5ff", fontFamily: "'Oxanium', sans-serif", fontWeight: 700, letterSpacing: "0.08em" }}>@RYTNIX_OP</span>
            </div>

            <div style={settingRow} onClick={() => window.open("https://ryt-cyberhub.vercel.app", "_blank")}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>@</SettingIcon>
                <div style={settingTitle}>RYTNIX_OP</div>
              </div>
              <span style={{ fontSize: 11, color: "#00f5ff", fontFamily: "'JetBrains Mono', monospace", textDecoration: "underline" }}>
                ryt-cyberhub.vercel.app
              </span>
            </div>

            <div style={{ ...settingRow, borderBottom: "none", cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SettingIcon>🔏</SettingIcon>
                <div style={settingTitle}>License & Copyright</div>
              </div>
              <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12 }}>›</span>
            </div>
          </div>

          {/* Sign Out / Lock CTA */}
          <button onClick={handleLock} style={{
            width: "100%", marginTop: 28, padding: "14px 0",
            borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, rgba(99,84,255,0.5), rgba(120,60,220,0.5))",
            color: "#fff", fontFamily: "'Oxanium', sans-serif",
            fontWeight: 700, fontSize: 14, letterSpacing: "0.12em",
            cursor: "pointer", transition: "opacity 0.2s",
            boxShadow: "0 4px 24px rgba(99,84,255,0.15)",
          }}>
            Sign Out / Lock
          </button>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ──────────────────────────────────────────────── */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <ModalHeader title={editEntry ? "✏ EDIT ENTRY" : "＋ NEW ENTRY"} onClose={() => setShowModal(false)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input placeholder="Site / App *" value={form.site}
              onChange={e => setForm(f => ({ ...f, site: e.target.value }))} style={inputStyle} />
            <input placeholder="Username / Email *" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={inputStyle} />

            <div>
              <div style={{ position: "relative" }}>
                <input type={formPwVis ? "text" : "password"} placeholder="Password *"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ ...inputStyle, paddingRight: 72 }}
                />
                <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 2 }}>
                  <button onClick={() => setForm(f => ({ ...f, password: genPassword(genLen) }))}
                    title="Generate" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 4, color: "rgba(0,245,255,0.6)" }}>⟳</button>
                  <button onClick={() => setFormPwVis(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 4, color: "rgba(0,245,255,0.6)" }}>
                    {formPwVis ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              {form.password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    {[0, 1, 2, 3].map(i => {
                      const s = calcStrength(form.password);
                      return <div key={i} style={{ height: 3, flex: 1, borderRadius: 4, background: i < s ? STR_COLOR[s - 1] : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />;
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: STR_COLOR[calcStrength(form.password) - 1] || "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>
                      {form.password.length < 4 ? "Too Short" : (STR_LABEL[calcStrength(form.password) - 1] || "Very Weak")}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>len:</span>
                      <input type="range" min={4} max={32} value={genLen}
                        onChange={e => setGenLen(Number(e.target.value))}
                        style={{ width: 72, accentColor: "#00f5ff" }} />
                      <span style={{ fontSize: 11, color: "#00f5ff", fontFamily: "'JetBrains Mono', monospace", width: 18 }}>{genLen}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ ...inputStyle, cursor: "pointer" }}>
              {CATS.filter(c => c !== "All").map(c => <option key={c} value={c} style={{ background: "#020812" }}>{c}</option>)}
            </select>

            <textarea placeholder="Notes (optional)" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} style={{ ...inputStyle, resize: "none" }} />

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button onClick={() => setShowModal(false)} style={{ ...btnGhost, flex: 1 }}>CANCEL</button>
              <button onClick={saveEntry} style={{ ...btnPrimary, flex: 1 }}>{editEntry ? "UPDATE" : "SAVE"}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CHANGE MASTER KEY MODAL ───────────────────────────────────────── */}
      {showChangeMaster && (
        <Modal onClose={() => { setShowChangeMaster(false); setNewMaster(""); setNewMasterConfirm(""); setMasterChangeErr(""); }}>
          <ModalHeader title="🗝 CHANGE MASTER KEY"
            onClose={() => { setShowChangeMaster(false); setNewMaster(""); setNewMasterConfirm(""); setMasterChangeErr(""); }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="password" placeholder="New master password"
              value={newMaster} onChange={e => setNewMaster(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Confirm new password"
              value={newMasterConfirm} onChange={e => setNewMasterConfirm(e.target.value)} style={inputStyle} />
            {masterChangeErr && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>
                ⚠ {masterChangeErr}
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
              // all entries will be re-encrypted with the new key
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowChangeMaster(false)} style={{ ...btnGhost, flex: 1 }}>CANCEL</button>
              <button onClick={handleChangeMaster} style={{ ...btnPrimary, flex: 1 }}>UPDATE KEY</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── NUKE CONFIRM MODAL ────────────────────────────────────────────── */}
      {showNukeConfirm && (
        <Modal onClose={() => setShowNukeConfirm(false)}>
          <ModalHeader title="⚠ NUKE / ERASE ALL" onClose={() => setShowNukeConfirm(false)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "14px 16px" }}>
              <p style={{ fontSize: 13, color: "#f87171", fontFamily: "'JetBrains Mono', monospace", margin: 0, lineHeight: 1.7 }}>
                This will <strong>permanently delete</strong> all vault data including all passwords and your master key. This action cannot be undone.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowNukeConfirm(false)} style={{ ...btnPrimary, flex: 1 }}>CANCEL</button>
              <button onClick={handleNuke} style={{
                ...btnGhost, flex: 1,
                color: "#f87171", borderColor: "rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.08)",
              }}>ERASE ALL</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Setting helpers ──────────────────────────────────────────────────────────

const settingTitle: React.CSSProperties = {
  fontFamily: "'Oxanium', sans-serif", fontWeight: 600, fontSize: 13,
  color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em",
};
const settingSubtitle: React.CSSProperties = {
  fontSize: 11, color: "var(--text-dim)",
  fontFamily: "'JetBrains Mono', monospace", marginTop: 2,
};

function SettingIcon({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
      background: danger ? "rgba(239,68,68,0.12)" : "rgba(0,245,255,0.06)",
      border: `1px solid ${danger ? "rgba(239,68,68,0.2)" : "rgba(0,245,255,0.12)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 16,
    }}>{children}</div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "100%", maxWidth: 540, margin: "0 auto",
        background: "rgba(2,8,18,0.98)", border: "1px solid rgba(0,245,255,0.15)",
        borderRadius: "16px 16px 0 0", padding: 24,
        maxHeight: "92vh", overflowY: "auto",
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <h3 style={{ fontFamily: "'Oxanium',sans-serif", fontWeight: 700, fontSize: 14, color: "#00f5ff", letterSpacing: "0.15em" }}>
        {title}
      </h3>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
    </div>
  );
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

function EntryCard({ entry, expanded, onToggle, onEdit, onDelete }: {
  entry: PasswordEntry; expanded: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [pwVis, setPwVis] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  const [copiedUn, setCopiedUn] = useState(false);

  const copyPw = async () => { await navigator.clipboard.writeText(entry.password); setCopiedPw(true); setTimeout(() => setCopiedPw(false), 1500); };
  const copyUn = async () => { await navigator.clipboard.writeText(entry.username); setCopiedUn(true); setTimeout(() => setCopiedUn(false), 1500); };

  const s = entry.strength;
  const sc = STR_COLOR[s - 1] || "#4b5563";

  return (
    <div style={{
      background: expanded ? "rgba(0,245,255,0.04)" : "rgba(0,245,255,0.02)",
      border: `1px solid ${expanded ? "rgba(0,245,255,0.2)" : "rgba(0,245,255,0.08)"}`,
      borderRadius: 10, overflow: "hidden", transition: "all 0.2s",
    }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          border: "1px solid rgba(0,245,255,0.2)", background: "rgba(0,245,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Oxanium', sans-serif", fontWeight: 800,
          fontSize: 13, color: "#00f5ff", textTransform: "uppercase",
        }}>{entry.site.charAt(0)}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 13, color: "#fff", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.site}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.username}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {s > 0 && (
            <span style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 4,
              border: `1px solid ${sc}40`, background: `${sc}15`, color: sc,
              fontFamily: "'Oxanium', sans-serif", fontWeight: 600, letterSpacing: "0.08em",
            }}>{STR_LABEL[s - 1]}</span>
          )}
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4,
            border: "1px solid rgba(0,245,255,0.12)", color: "rgba(0,245,255,0.4)",
            fontFamily: "'Oxanium', sans-serif", letterSpacing: "0.08em",
          }}>{entry.category}</span>
          <span style={{ color: "rgba(0,245,255,0.3)", fontSize: 12, transition: "transform 0.2s", display: "inline-block", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(0,245,255,0.08)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <FieldRow label="PASSWORD">
            <div style={{ fontSize: 13, color: "#fff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pwVis ? entry.password : "•".repeat(Math.min(entry.password.length, 24))}
            </div>
            <button onClick={() => setPwVis(v => !v)} style={iconBtn}>{pwVis ? "🙈" : "👁"}</button>
            <button onClick={copyPw} style={{ ...iconBtn, color: copiedPw ? "#00e5cc" : "rgba(0,245,255,0.5)" }}>{copiedPw ? "✓" : "⎘"}</button>
          </FieldRow>

          <FieldRow label="USERNAME">
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.username}</div>
            <button onClick={copyUn} style={{ ...iconBtn, color: copiedUn ? "#00e5cc" : "rgba(0,245,255,0.5)" }}>{copiedUn ? "✓" : "⎘"}</button>
          </FieldRow>

          {entry.notes && (
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,245,255,0.08)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.12em", marginBottom: 3, fontFamily: "'Oxanium', sans-serif" }}>NOTES</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{entry.notes}</div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
              updated {new Date(entry.updatedAt).toLocaleDateString()}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onEdit} style={{ ...btnGhost, fontSize: 11, padding: "6px 14px" }}>EDIT</button>
              <button onClick={onDelete} style={{ ...btnGhost, fontSize: 11, padding: "6px 14px", color: "rgba(239,68,68,0.6)", borderColor: "rgba(239,68,68,0.2)" }}>DELETE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 14, color: "rgba(0,245,255,0.5)", padding: 4, flexShrink: 0,
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,245,255,0.08)", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.12em", marginBottom: 3, fontFamily: "'Oxanium', sans-serif" }}>{label}</div>
        <div style={{ minWidth: 0, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 999,
      background: ok ? "rgba(0,229,204,0.1)" : "rgba(239,68,68,0.1)",
      border: `1px solid ${ok ? "rgba(0,229,204,0.3)" : "rgba(239,68,68,0.3)"}`,
      borderRadius: 8, padding: "10px 16px",
      fontSize: 12, color: ok ? "#00e5cc" : "#f87171",
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8,
      backdropFilter: "blur(10px)",
    }}>
      {ok ? "✓" : "⚠"} {msg}
    </div>
  );
}