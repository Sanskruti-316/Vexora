import express from "express";
import cors from "cors";
import { initDb } from "./db/index.js";
import { notificationService } from "./services/notification.service.js";
import apiRouter from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Global process error handlers to prevent socket drops from crashing the server
process.on("unhandledRejection", (reason) => {
  console.warn("Unhandled Rejection (handled safely):", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.warn("Uncaught Exception (handled safely):", err?.message || err);
});

const app = express();

// Standard Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// API Routes
app.use("/api", apiRouter);

// Global Error Handler
app.use(errorHandler);

// Background low-stock monitoring daemon (runs every 60s)
export async function checkLow(db) {
  return await notificationService.checkLowStock(db);
}
setInterval(() => checkLow().catch(console.error), 60000);

// Server startup
const PORT = process.env.PORT || 5000;

export async function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`Durga Timbers ERP Backend running on http://localhost:${PORT}`);
  });

  const init = async (retries = 3) => {
    try {
      await initDb();
      await checkLow();
      console.log("Database initialized and low-stock monitor active.");
    } catch (err) {
      console.warn(`Database initialization warning: ${err.message}. Retries left: ${retries}`);
      if (retries > 0) {
        setTimeout(() => init(retries - 1), 3000);
      }
    }
  };

  init();
  return server;
}

// Start server if executed directly
if (process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server"))) {
  startServer();
}

export default app;
