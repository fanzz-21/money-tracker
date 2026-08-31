// tests/helpers/supabase-redirect-hooks.mjs — resolve hook untuk node:module
// register(): alihkan setiap import yang end-with "supabase.js" ke stub mock
// lokal .supabase-stub.mjs (satu folder dengan file ini, jadi tidak perlu
// plumbing context.data — lebih robust).
import path from "node:path";
import { pathToFileURL } from "node:url";

const STUB_URL = pathToFileURL(path.join(import.meta.dirname, ".supabase-stub.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("supabase.js")) {
    return { url: STUB_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
