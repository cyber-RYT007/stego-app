import { useState, useRef } from "react";
import { encodeMessage, getCapacity } from "../utils/stego";
import { aesEncrypt } from "../utils/crypto";

type Status = { type: "ok" | "err" | "warn" | ""; text: string };

export default function Encode() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [preview, setPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [capacity, setCapacity] = useState(0);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [useEncryption, setUseEncryption] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "", text: "" });
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatus({ type: "err", text: "Invalid file. Use PNG, WEBP, or JPG." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setPreview(src);
      setFileName(file.name);
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // Get capacity
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d")!;
        c.width = img.width; c.height = img.height;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height);
        setCapacity(getCapacity(data));
        setFileInfo(`${img.width}×${img.height}px · ${(file.size / 1024).toFixed(1)} KB`);
        setStatus({ type: "ok", text: `Image loaded — ${getCapacity(data).toLocaleString()} chars capacity` });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleEncode = async () => {
    if (!image) { setStatus({ type: "err", text: "Please upload a cover image first." }); return; }
    if (!message.trim()) { setStatus({ type: "err", text: "Message cannot be empty." }); return; }
    if (useEncryption && !password.trim()) { setStatus({ type: "err", text: "Enter a password or disable encryption." }); return; }
    if (message.length > capacity) { setStatus({ type: "err", text: `Message too long. Max ${capacity} chars for this image.` }); return; }

    setLoading(true);
    setProgress(10);

    try {
      await new Promise(r => setTimeout(r, 200));
      setProgress(30);

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
      setProgress(50);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const finalMsg = useEncryption && password ? aesEncrypt(message, password) : message;
      setProgress(70);

      const encoded = encodeMessage(imageData, finalMsg);
      ctx.putImageData(encoded, 0, 0);
      setProgress(90);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `stegosec_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setProgress(100);
        setStatus({ type: "ok", text: `✓ Encoded ${message.length} chars${useEncryption ? " (AES encrypted)" : ""} · ${(blob.size / 1024).toFixed(1)} KB PNG saved` });
        setTimeout(() => setLoading(false), 300);
      }, "image/png");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Encoding failed.";
      setStatus({ type: "err", text: msg });
      setLoading(false);
    }
  };

  const usedPct = capacity > 0 ? Math.min(100, Math.round((message.length / capacity) * 100)) : 0;
  const barColor = usedPct > 85 ? "var(--red)" : usedPct > 60 ? "var(--amber)" : "var(--cyan)";

  return (
    <div className="glass fade-up delay-2" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <div style={{ fontFamily: "'Oxanium',sans-serif", fontWeight: 700, fontSize: 15, color: "var(--cyan)", letterSpacing: "0.12em" }}>ENCODE</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>embed message into image</div>
          </div>
        </div>
        {image && (
          <button onClick={() => { setImage(null); setPreview(""); setFileName(""); setMessage(""); setPassword(""); setCapacity(0); setStatus({ type: "", text: "" }); }}
            style={{ background: "none", border: "1px solid rgba(255,68,102,0.3)", color: "var(--red)", fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", letterSpacing: "0.08em" }}>
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
            <img src={preview} alt="Cover" style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(transparent, rgba(2,8,18,0.95))",
              padding: "12px 14px", fontSize: 11, color: "var(--cyan)",
              display: "flex", justifyContent: "space-between"
            }}>
              <span>📎 {fileName}</span>
              <span style={{ color: "var(--text-dim)" }}>{fileInfo}</span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>⊕</div>
            <div style={{ color: "var(--text-dim)", letterSpacing: "0.1em", fontSize: 12 }}>DRAG & DROP OR CLICK TO UPLOAD</div>
            <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 6, opacity: 0.6 }}>PNG · WEBP · JPG — larger = more capacity</div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && loadImage(e.target.files[0])} />
      </div>

      {/* Message */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em" }}>SECRET MESSAGE</label>
          <span style={{ fontSize: 11, color: usedPct > 85 ? "var(--red)" : "var(--text-dim)" }}>
            {message.length.toLocaleString()} / {capacity > 0 ? capacity.toLocaleString() : "—"} chars
          </span>
        </div>
        <textarea
          className="ss-input"
          rows={5}
          placeholder="Type your secret message here..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ resize: "none", lineHeight: 1.7 }}
        />
        {/* Capacity bar */}
        {capacity > 0 && (
          <div style={{ marginTop: 6, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${usedPct}%`, background: barColor, transition: "width 0.3s, background 0.3s", borderRadius: 2, boxShadow: `0 0 6px ${barColor}` }} />
          </div>
        )}
      </div>

      {/* Encryption toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setUseEncryption(!useEncryption)}
          style={{
            width: 40, height: 22, borderRadius: 11,
            background: useEncryption ? "var(--cyan)" : "rgba(255,255,255,0.1)",
            border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s",
          }}
        >
          <div style={{
            width: 16, height: 16, borderRadius: "50%", background: "#000",
            position: "absolute", top: 3, left: useEncryption ? 21 : 3,
            transition: "left 0.2s",
          }} />
        </button>
        <span style={{ fontSize: 12, color: useEncryption ? "var(--cyan)" : "var(--text-dim)", letterSpacing: "0.06em" }}>
          AES-256 Encryption {useEncryption ? "ON" : "OFF"}
        </span>
      </div>

      {/* Password */}
      {useEncryption && (
        <div className="fade-in">
          <label style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>ENCRYPTION PASSWORD</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} className="ss-input" placeholder="Enter a strong password"
              value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 60 }} />
            <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 11, letterSpacing: "0.06em" }}>
              {showPass ? "HIDE" : "SHOW"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6, opacity: 0.7 }}>⚠ Save this password — it cannot be recovered</div>
        </div>
      )}

      {/* Encode button */}
      <button className={`btn-cyan ${loading ? "btn-disabled" : ""}`} onClick={handleEncode}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? (
            <><span className="spin" style={{ display: "inline-block", width: 12, height: 12, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%" }} /> ENCODING...</>
          ) : "▶ ENCODE & DOWNLOAD PNG"}
        </span>
      </button>

      {/* Progress bar */}
      {loading && (
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Status */}
      {status.text && (
        <div className={`badge badge-${status.type === "ok" ? "ok" : status.type === "warn" ? "warn" : "err"}`}
          style={{ padding: "8px 12px", fontSize: 12, display: "block", lineHeight: 1.6, borderRadius: 8 }}>
          {status.text}
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}