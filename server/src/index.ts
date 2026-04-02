import app from "./app";
import dotenv from "dotenv";
import { startSyncPoller } from "./services/syncPoller";
import { ensureKbSeeded }  from "./services/kbSeed";

dotenv.config();

const PORT = process.env.PORT || 4000;

// Only listen if NOT running on Vercel (local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    // Start background polling loop (runs every 5 min, fires once immediately)
    startSyncPoller();
    // Seed knowledge base articles if not already present
    ensureKbSeeded();
  });
}

// Seed on Vercel cold-start too (idempotent — exits immediately if already seeded)
ensureKbSeeded();

// Export the app for Vercel Serverless
export default app;