// Browser-safe (no database imports): shared by server and client code.
export const KINDS = ["homework", "ulangan_harian", "uts", "uas"] as const;
export type Kind = (typeof KINDS)[number];

/** Short labels shown on badges. */
export const KIND_LABEL: Record<Kind, string> = {
  homework: "Homework",
  ulangan_harian: "ULHA",
  uts: "UTS",
  uas: "UAS",
};

/** Full names, shown in tooltips and the legend. */
export const KIND_FULL: Record<Kind, string> = {
  homework: "Homework",
  ulangan_harian: "Ulangan Harian",
  uts: "Ujian Tengah Semester",
  uas: "Ujian Akhir Semester",
};
