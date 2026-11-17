import { KIND_FULL, KIND_LABEL, KINDS } from "@/lib/kinds";

/** Explains the badge abbreviations. */
export function Legend() {
  return (
    <div className="legend">
      {KINDS.filter((k) => KIND_LABEL[k] !== KIND_FULL[k]).map((k) => (
        <div key={k}>
          <b>{KIND_LABEL[k]}</b> = {KIND_FULL[k]}
        </div>
      ))}
    </div>
  );
}
