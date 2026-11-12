// Reusable AI provider interface. Currently implements the local Ollama
// provider only (AI_PROVIDER=ollama); a hosted provider can be added later
// behind the same interface without touching callers.
//
// Config (env only — never exposed to the frontend):
//   AI_PROVIDER=ollama
//   OLLAMA_BASE_URL=http://127.0.0.1:11434
//   OLLAMA_MODEL=qwen3.5:2b
//   AI_REQUEST_TIMEOUT_MS=60000
//   AI_MAX_GENERATION_ATTEMPTS=2

const OLLAMA_BASE_URL = () => (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL || 'qwen3.5:2b';
const TIMEOUT_MS = () => Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000);
const MAX_ATTEMPTS = () => Math.max(1, Number(process.env.AI_MAX_GENERATION_ATTEMPTS || 2));

class AiUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.code = 'AI_UNAVAILABLE';
  }
}

class AiTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.code = 'AI_TIMEOUT';
  }
}

class OllamaProvider {
  name = 'ollama';

  async isAvailable() {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL()}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(prompt, { numPredict = 1800, temperature = 0.4, format = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS());
    try {
      const res = await fetch(`${OLLAMA_BASE_URL()}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL(),
          prompt,
          stream: false,
          // Optional JSON-schema constraint (Ollama `format`) — guarantees
          // syntactically valid structured output from small local models.
          ...(format ? { format } : {}),
          // Qwen thinking models: skip the reasoning pass — faster and keeps
          // the response purely the JSON payload on a small local model.
          think: false,
          // Keep memory footprint small for a 4 GB VRAM GPU: modest context,
          // CPU offload allowed (Ollama decides layer placement itself).
          options: {
            num_predict: numPredict,
            temperature,
            num_ctx: 4096,
          },
        }),
      });
      if (!res.ok) {
        throw new AiUnavailableError(`Ollama request failed with status ${res.status}`);
      }
      const data = await res.json();
      return { text: data.response || '', provider: this.name, model: OLLAMA_MODEL() };
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new AiTimeoutError(`Ollama generation timed out after ${TIMEOUT_MS()}ms`);
      }
      if (e instanceof AiUnavailableError) throw e;
      throw new AiUnavailableError(`Ollama unreachable: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

let providerOverride = null;

function getProvider() {
  if (providerOverride) return providerOverride;
  const kind = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
  if (kind === 'ollama') return new OllamaProvider();
  throw new AiUnavailableError(`Unknown AI_PROVIDER "${kind}"`);
}

function isExplorerEnabled() {
  const flag = String(process.env.AI_PANTRY_EXPLORER_ENABLED).toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Fall back to the legacy AI_ENABLED switch when the specific flag is unset.
  return String(process.env.AI_ENABLED).toLowerCase() === 'true';
}

// Test hook.
function setProviderForTests(fake) {
  providerOverride = fake;
}
function resetProvider() {
  providerOverride = null;
}

module.exports = {
  getProvider,
  isExplorerEnabled,
  setProviderForTests,
  resetProvider,
  MAX_GENERATION_ATTEMPTS: MAX_ATTEMPTS,
  AiUnavailableError,
  AiTimeoutError,
};
