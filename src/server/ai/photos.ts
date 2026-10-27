import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PhotoReader } from "./pipeline/types";

/** Token Factory's vision model reads PNG and JPEG; anything bigger than this isn't a buyer's photo. */
const MAX_BYTES = 4 * 1024 * 1024;
const PUBLIC_PHOTO = /^\/demo\/photos\/[a-z0-9][a-z0-9-]*\.(png|jpe?g)$/i;

/**
 * Case photos as data URLs for the vision model. Demo photos are files under public/, read from
 * disk; only paths that look like one are read, so a case can't point the server at another file.
 */
export function publicPhotoReader(root: string = join(process.cwd(), "public")): PhotoReader {
  return async (url) => {
    if (/^data:image\/(png|jpeg);base64,/.test(url))
      return url.length <= MAX_BYTES * 1.4 ? url : null;
    const match = PUBLIC_PHOTO.exec(url);
    if (!match) return null;
    const bytes = await readFile(join(root, ...url.split("/").filter(Boolean))).catch(() => null);
    if (!bytes || bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    const type = match[1]!.toLowerCase() === "png" ? "image/png" : "image/jpeg";
    return `data:${type};base64,${bytes.toString("base64")}`;
  };
}
