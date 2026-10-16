import "dotenv/config";
import { OpenRouterAdapter } from "../server/translation";
import { serverConfig } from "../server/config";
const config = serverConfig();
const adapter = new OpenRouterAdapter({ ...config, dataCollection: "deny" });
const start = Date.now();
try {
  const result = await adapter.translate(
    {
      text: "I agree about the cost. Not the deadline.",
      sourceLanguage: "en",
      targetLanguage: "es",
      segmentId: "synthetic-check",
      revision: 1,
      context: [],
    },
    AbortSignal.timeout(5000),
  );
  console.log(
    JSON.stringify({
      status: result.status,
      elapsedMs: Date.now() - start,
      syntheticTranslation:
        result.status === "translated" ? result.text : undefined,
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({
      status: "unavailable",
      reason: e instanceof Error ? e.message : "unknown",
      elapsedMs: Date.now() - start,
    }),
  );
  process.exitCode = 1;
}
