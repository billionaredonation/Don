import { corsHeaders } from './cors.ts';

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return jsonResponse(
    {
      ok: false,
      error: message,
      details: details ?? null,
    },
    status,
  );
}
