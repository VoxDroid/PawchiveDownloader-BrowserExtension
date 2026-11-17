import type { IconName } from '../icons.generated';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
  icon?: IconName;
}

let nextId = 1;

export const toasts = $state<Toast[]>([]);

export function dismissToast(id: number): void {
  const index = toasts.findIndex((t) => t.id === id);
  if (index >= 0) toasts.splice(index, 1);
}

export function toast(
  message: string,
  kind: ToastKind = 'info',
  options: { action?: Toast['action']; duration?: number } = {},
): number {
  const id = nextId++;
  toasts.push({ id, kind, message, action: options.action });
  if (toasts.length > 4) toasts.splice(0, toasts.length - 4);
  const duration = options.duration ?? (kind === 'error' ? 7000 : 4000);
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
  return id;
}
