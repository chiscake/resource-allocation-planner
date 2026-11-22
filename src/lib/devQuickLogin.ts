/** Demo accounts for quick-login bar (must match scripts/seed-users.mjs defaults). */
export interface DevQuickAccount {
  label: string;
  email: string;
  password: string;
  role: "admin" | "mod" | "user";
}

/** Shared seed password (must match scripts/seed-users.mjs / SEED_PASSWORD default). */
export const DEV_QUICK_PASSWORD = "password123";

export const DEV_QUICK_ACCOUNTS: readonly DevQuickAccount[] = [
  {
    label: "Admin",
    email: "admin@example.com",
    password: DEV_QUICK_PASSWORD,
    role: "admin",
  },
  {
    label: "Admin 2",
    email: "admin2@example.com",
    password: DEV_QUICK_PASSWORD,
    role: "admin",
  },
  {
    label: "Mod",
    email: "mod@example.com",
    password: DEV_QUICK_PASSWORD,
    role: "mod",
  },
  {
    label: "Demo 1",
    email: "demo1@example.com",
    password: DEV_QUICK_PASSWORD,
    role: "user",
  },
  {
    label: "Demo 2",
    email: "demo2@example.com",
    password: DEV_QUICK_PASSWORD,
    role: "user",
  },
  {
    label: "Demo 3",
    email: "demo3@example.com",
    password: DEV_QUICK_PASSWORD,
    role: "user",
  },
];

export function isDevQuickLoginEnabled(flag: string | undefined): boolean {
  const v = (flag ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  // University lab default: on in Vite dev when flag unset
  return import.meta.env.DEV;
}
