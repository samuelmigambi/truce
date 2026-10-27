import clsx, { type ClassValue } from "clsx";

/** Joins class names; falsy values drop out. */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}
