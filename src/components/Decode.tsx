import { useState, useRef } from "react";
import { decodeMessage } from "../utils/stego";
import { aesDecrypt } from "../utils/crypto";

type Status = { type: "ok" | "err" | "warn" | ""; text: string };

export default function Decode() {
  const [preview, setPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [useDecryption, setUseDecryption] = useState(false);
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<Status>({ type: "", text: "" });
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
      setFileName(file.name);
      setResult("");
      setStatus({ type: "", text: "" });
    };
    reader.readAsDataURL(file);
  };

  const handleDecode = async () => {
    if (!preview) { setStatus({ type: "err", text: "No image loaded." }); return; }
    setLoading(true); setResult("");

    await new Promise(r => setTimeout(r, 500));

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let decoded = decodeMessage(data);
        if (useDecryption && password) decoded = aesDecrypt(decoded, password);
        setResult(decoded);
        setStatus({ type: "ok", text: `✓ Extracted ${decoded.length} characters from ${fileName}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Decoding failed.";
        setStatus({ type: "err", text: msg });
      }
      setLoading(false);
    };
    img.src = preview;
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass fade-up delay-3" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔓</span>
          <div>
            <div style={{ fontFamily: "'Oxanium',sans-serif", fontWeight: 700, fontSize: 15, color: "var(--teal)", letterSpacing: "0.12em" }}>DECODE</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>extract hidden message</div>
          </div>
        </div>
        {preview && (
          <button onClick={() => { setPreview(""); setFileName(""); setResult(""); setStatus({ type: "", text: "" }); }}
            style={{ background: "none", border: "1px solid rgba(255,68,102,0.3)", color: "var(--red)", fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}>
            CLEAR
          </button>
        )}
      </div>

      <hr className="neon-divider" />

      {/* Drop zone */}
      <div
        className={`dropzone ${dragging ? "active" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadImage(f); }}
      >
        {preview ? (
          <>
            <img src={preview} alt="Encoded" style={{ width: "100%", maxHeight: 180, objectFit: "cover" }} />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(transparent, rgba(2,8,18,0.95))",
              padding: "12px 14px", fontSize: 11, color: "var(--teal)",
            }}>📎 {fileName}</div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>⊘</div>
            <div style={{ color: "var(--text-dim)", letterSpacing: "0.1em", fontSize: 12 }}>DROP ENCODED IMAGE HERE</div>
            <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 6, opacity: 0.6 }}>Use PNG output from Encode panel</div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && loadImage(e.target.files[0])} />
      </div>

      {/* Decryption toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setUseDecryption(!useDecryption)}
          style={{ width: 40, height: 22, borderRadius: 11, background: useDecryption ? "var(--teal)" : "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}
        >
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#000", position: "absolute", top: 3, left: useDecryption ? 21 : 3, transition: "left 0.2s" }} />
        </button>
        <span style={{ fontSize: 12, color: useDecryption ? "var(--teal)" : "var(--text-dim)", letterSpacing: "0.06em" }}>
          Decrypt with Password {useDecryption ? "ON" : "OFF"}
        </span>
      </div>

      {/* Password */}
      {useDecryption && (
        <div className="fade-in">
          <label style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>DECRYPTION PASSWORD</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} className="ss-input" placeholder="Enter the password used during encoding"
              value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 60, borderColor: "rgba(0,229,204,0.2)", color: "var(--teal)" }} />
            <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 11 }}>
              {showPass ? "HIDE" : "SHOW"}
            </button>
          </div>
        </div>
      )}

      {/* Decode button */}
      <button className={`btn-teal ${loading ? "btn-disabled" : ""}`} onClick={handleDecode}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? (
            <><span className="spin" style={{ display: "inline-block", width: 12, height: 12, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%" }} /> SCANNING PIXELS...</>
          ) : "▶ DECODE MESSAGE"}
        </span>
      </button>

      {/* Status */}
      {status.text && (
        <div className={`badge badge-${status.type === "ok" ? "ok" : "err"}`}
          style={{ padding: "8px 12px", fontSize: 12, display: "block", lineHeight: 1.6, borderRadius: 8 }}>
          {status.text}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="fade-in" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,229,204,0.2)", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em" }}>DECODED MESSAGE</span>
            <button onClick={copy} style={{ background: copied ? "rgba(0,255,136,0.1)" : "rgba(0,245,255,0.06)", border: `1px solid ${copied ? "var(--green)" : "var(--glass-border)"}`, color: copied ? "var(--green)" : "var(--text-dim)", fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s" }}>
              {copied ? "✓ COPIED" : "⎘ COPY"}
            </button>
          </div>
          <p style={{ color: "var(--cyan)", fontSize: 13, lineHeight: 1.8, wordBreak: "break-word", whiteSpace: "pre-wrap", margin: 0 }}>
            {result}
          </p>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}