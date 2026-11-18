export const ADMIN = import.meta.env.VITE_ADMIN === 'true';
export const HIDDEN = new Set(String(import.meta.env.VITE_PUBLIC_HIDE || '').split(',').filter(Boolean));
export const shown = part => !HIDDEN.has(part);
// remove the tuning parts of the page in the public build
export function stripAdmin(root = document) {
  if (ADMIN) return;
  for (const e of root.querySelectorAll('[data-admin]')) e.remove();
}
