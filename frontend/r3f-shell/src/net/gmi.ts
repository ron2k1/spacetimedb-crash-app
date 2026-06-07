// gmi.ts -- thin client for ONE live inference call to GMI Cloud, which fronts Phinite AI's models.
//
// The "Test Agent / Test Skill" demo flow (see components/dashboard/TestRunModal.tsx) is mostly a
// SIMULATION -- the x402/USDC settlement and the Phinite orchestration trace are staged for the demo
// and move no real funds. The ONE genuinely live beat is this inference call, so the demo really does
// "hit Phinite AI". The key is a throwaway demo tester key injected at BUILD time by Vite from a
// gitignored .env (VITE_GMI_API_KEY) -- it is never committed and is rotated after each demo.
//
// Robustness: if the key is absent, or the call fails (CORS, offline, bad model, timeout), runGmiChat
// throws and the caller falls back to canned copy so the on-stage sequence never stalls. We read the
// env via `import.meta.env` cast to any so a missing Vite ambient type can't break `tsc` in CI.

const GMI_URL = "https://api.gmi-serving.com/v1/chat/completions";
// Frontier open instruct model GMI hosts; fast enough to feel live on stage. If GMI doesn't have this
// exact id the call returns a non-2xx and the caller falls back -- no hard dependency on the id.
const GMI_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

const KEY: string | undefined = (
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_GMI_API_KEY ?? ""
).trim();

/** True when a key was baked in at build time -- lets the UI decide whether to even attempt a live call. */
export const gmiConfigured = KEY.length > 0;

/** Short human label shown next to the result ("via ...") so the demo names the real provider. */
export const gmiModelLabel = "Llama-3.3-70B - GMI";

export interface GmiOpts {
  system?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

/**
 * Make one real chat-completion call to GMI. Resolves with the assistant text, or throws on any
 * failure so the caller can fall back to a canned result. Never logs the key or the response body.
 */
export async function runGmiChat(prompt: string, opts: GmiOpts = {}): Promise<string> {
  if (!KEY) throw new Error("gmi-no-key");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 14000);
  try {
    const res = await fetch(GMI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: GMI_MODEL,
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: prompt },
        ],
        max_tokens: opts.maxTokens ?? 220,
        temperature: 0.6,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`gmi-http-${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("gmi-empty");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
