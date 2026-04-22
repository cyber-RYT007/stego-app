import { useState, useEffect } from "react";

interface NavbarProps {
  activeTab: "stego" | "vault";
  setActiveTab: (tab: "stego" | "vault") => void;
}

export default function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const [time, setTime] = useState(new Date());
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => { clearInterval(t); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: scrolled ? "rgba(2,8,18,0.95)" : "rgba(2,8,18,0.7)",
      backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(0,245,255,0.1)",
      padding: "0 24px",
      height: 60,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12,
      transition: "background 0.3s",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32,
          border: "1.5px solid rgba(0,245,255,0.4)",
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,245,255,0.05)",
          fontSize: 14,
        }}>🔐</div>
        <div style={{
          fontFamily: "'Oxanium', sans-serif",
          fontWeight: 800, fontSize: 18,
          letterSpacing: "0.12em",
          background: "linear-gradient(135deg, #00f5ff, #00e5cc)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>STEGOSEC</div>
        <span style={{
          fontSize: 10, color: "rgba(0,245,255,0.4)",
          border: "1px solid rgba(0,245,255,0.15)",
          padding: "2px 6px", borderRadius: 4,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.1em",
        }} className="nav-version">v2.0</span>
      </div>

      {/* Center Tabs */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        background: "rgba(0,245,255,0.04)",
        border: "1px solid rgba(0,245,255,0.1)",
        borderRadius: 10, padding: 4,
        flexShrink: 0,
      }}>
        <NavTab label="🖼 STEGO" active={activeTab === "stego"} onClick={() => setActiveTab("stego")} />
        <NavTab label="🔑 VAULT" active={activeTab === "vault"} onClick={() => setActiveTab("vault")} />
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: "rgba(0,245,255,0.5)",
          letterSpacing: "0.08em",
        }} className="nav-clock">
          {time.toLocaleTimeString("en-US", { hour12: false })}
        </div>
        <div className="badge badge-info">LOCAL ONLY</div>
      </div>
    </nav>
  );
}

function NavTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Oxanium', sans-serif",
        fontWeight: active ? 700 : 500,
        fontSize: 11,
        letterSpacing: "0.12em",
        padding: "6px 14px",
        borderRadius: 7,
        border: active ? "1px solid rgba(0,245,255,0.35)" : "1px solid transparent",
        background: active ? "rgba(0,245,255,0.12)" : "transparent",
        color: active ? "#00f5ff" : "rgba(0,245,255,0.4)",
        cursor: "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}