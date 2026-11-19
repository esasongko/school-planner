import "./Spinner.css";

export function Spinner({ size = 18, light, label = "Loading" }: { size?: number; light?: boolean; label?: string }) {
  return <span className={`spinner${light ? " light" : ""}`} style={{ ["--sp" as string]: `${size}px` }} role="status" aria-label={label} />;
}
