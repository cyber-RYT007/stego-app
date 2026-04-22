import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import Encode from "./components/Encode";
import Decode from "./components/Decode";
import PasswordManager from "./components/Passwordmanager";
import ParticleBackground from "./components/ParticleBackground";

const HERO_TEXTS = [
  "Hide secrets in plain sight.",
  "No uploads. No servers. No traces.",
  "LSB steganography + AES-256 encryption.",
  "Your data never leaves your device.",
];

type Tab = "stego" | "vault";

export default function App() {
  const [heroIdx, setHeroIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("stego");

  useEffect(() => {
    const t = setInterval(() => setHeroIdx(i => (i + 1) % HERO_TEXTS.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <ParticleBackground />

      <div style={{ position: "relative", zIndex: 1 }}>
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* ── STEGO TAB ─────────────────────────────────────────────────── */}
        {activeTab === "stego" && (
          <>
            {/* Hero */}
            <div style={{ textAlign: "center", padding: "60px 24px 40px", maxWidth: 800, margin: "0 auto" }}>
              <div className="fade-up delay-1">
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <div className="badge badge-ok">● LOCAL PROCESSING</div>
                  <div className="badge badge-info">NO DATA UPLOADED</div>
                  <div className="badge badge-warn">AES-256</div>
                </div>
              </div>

              <h1 className="fade-up delay-2" style={{
                fontFamily: "'Oxanium', sans-serif", fontWeight: 800,
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                lineHeight: 1.1, letterSpacing: "0.04em",
                background: "linear-gradient(135deg, #ffffff 0%, #00f5ff 50%, #00e5cc 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                marginBottom: 20,
              }}>
                COVERT IMAGE<br />STEGANOGRAPHY
              </h1>

              <div className="fade-up delay-3" style={{ height: 28, overflow: "hidden", marginBottom: 32 }}>
                <p key={heroIdx} className="fade-in" style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 14, color: "rgba(0,245,255,0.6)",
                  letterSpacing: "0.06em", margin: 0,
                }}>
                  // {HERO_TEXTS[heroIdx]}
                </p>
              </div>

              {/* Stats row */}
              <div className="fade-up delay-4" style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
                {[["LSB-1", "ALGORITHM"], ["AES-256", "ENCRYPTION"], ["100%", "CLIENT-SIDE"], ["0", "DATA UPLOADS"]].map(([v, l]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Oxanium',sans-serif", fontWeight: 700, fontSize: 20, color: "var(--cyan)" }}>{v}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.1em", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main panels */}
            <main style={{ maxWidth: 1140, margin: "0 auto", padding: "0 20px 60px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 20 }}>
              <Encode />
              <Decode />
            </main>

            {/* How it works */}
            <div style={{ maxWidth: 1140, margin: "0 auto 60px", padding: "0 20px" }}>
              <div className="glass" style={{ padding: 28 }}>
                <h2 style={{ fontFamily: "'Oxanium',sans-serif", fontWeight: 700, fontSize: 14, color: "var(--cyan)", letterSpacing: "0.15em", marginBottom: 24, textAlign: "center" }}>
                  HOW IT WORKS
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
                  {[
                    { icon: "🖼", title: "1. Upload Image", desc: "Select any PNG, WEBP, or JPG as the cover image. Larger images hold more data." },
                    { icon: "✍️", title: "2. Write Message", desc: "Type your secret message. Optionally enable AES-256 encryption with a password." },
                    { icon: "⬇️", title: "3. Download PNG", desc: "The message is embedded in pixel LSBs. Download the output PNG — it looks identical." },
                    { icon: "🔍", title: "4. Decode Anywhere", desc: "Upload the PNG to the Decode panel. Extract the hidden message instantly." },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} style={{ background: "rgba(0,245,255,0.03)", border: "1px solid var(--glass-border)", borderRadius: 10, padding: 18, textAlign: "center" }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                      <div style={{ fontFamily: "'Oxanium',sans-serif", fontWeight: 600, fontSize: 13, color: "var(--cyan)", marginBottom: 8, letterSpacing: "0.06em" }}>{title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── VAULT TAB ─────────────────────────────────────────────────── */}
        {activeTab === "vault" && <PasswordManager />}

        {/* Footer — always visible */}
        <footer style={{ borderTop: "1px solid rgba(0,245,255,0.08)", padding: "24px 20px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
            <div className="badge badge-ok" style={{ fontSize: 12 }}>🛡 PRIVACY FIRST</div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.06em", maxWidth: 500, margin: "0 auto 8px" }}>
            All operations happen entirely in your browser. No images, messages, or passwords are ever uploaded to any server.
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em" }}>
            STEGOSEC v2.0 · LSB STEGANOGRAPHY + AES-256 · PASSWORD VAULT
          </p>
        </footer>
      </div>
    </div>
  );
}