// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import { connectionFetch, normalizeConnectionError, installConnectionMonitor } from './network/connection.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
  throw new Error(
    'Missing Supabase env variables: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  global: { fetch: connectionFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Supabase exposes functions via a getter; retain one wrapped instance so every
// feature receives the same normalized transport errors, preserving HTTP errors.
const functions = supabase.functions;
const invoke = functions.invoke.bind(functions);
functions.invoke = async (...args) => {
  try {
    const result = await invoke(...args);
    return { ...result, error: normalizeConnectionError(result.error) };
  } catch (error) {
    throw normalizeConnectionError(error);
  }
};
Object.defineProperty(supabase, 'functions', { value: functions });
installConnectionMonitor(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
