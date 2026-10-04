import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware className merge (shadcn convention). */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}