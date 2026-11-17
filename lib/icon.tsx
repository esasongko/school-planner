import { ImageResponse } from "next/og";

/** The app icon (navy tile, calendar with a check), drawn at any square size. */
export function iconResponse(size: number) {
  const u = size / 512;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#1e3a8a", display: "flex", position: "relative" }}>
        <div style={{ position: "absolute", left: 116 * u, top: 136 * u, width: 280 * u, height: 260 * u, borderRadius: 28 * u, background: "#fff", display: "flex" }} />
        <div style={{ position: "absolute", left: 116 * u, top: 136 * u, width: 280 * u, height: 64 * u, borderRadius: 28 * u, background: "#dbe4fb", display: "flex" }} />
        <div style={{ position: "absolute", left: 116 * u, top: 170 * u, width: 280 * u, height: 30 * u, background: "#dbe4fb", display: "flex" }} />
        <svg width={size} height={size} viewBox="0 0 512 512" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M190 300l44 44 92-96" fill="none" stroke="#1e3a8a" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
