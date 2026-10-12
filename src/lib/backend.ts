import { createDemoBackend } from './demoBackend';
import { createSupabaseBackend } from './supabaseBackend';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const forceDemo = new URLSearchParams(location.search).has('demo');

/** Supabase when keys are configured; otherwise (or with ?demo) the in-browser demo. */
export const backend: Backend = url && key && !forceDemo ? createSupabaseBackend(url, key) : createDemoBackend();
