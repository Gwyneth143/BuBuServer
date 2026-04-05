require("dotenv").config();
const http = require("http");
const { handleRequest } = require("./src/router");
const { initDatabaseIfConfigured } = require("./src/services/db");

const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled request error:", err && err.message ? err.message : err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `Port ${PORT} is already in use (EADDRINUSE). Set PORT=3001 (or another free port) in .env, or stop the process bound to this port.`
    );
  } else {
    // eslint-disable-next-line no-console
    console.error("Server listen error:", err);
  }
  process.exit(1);
});

initDatabaseIfConfigured()
  .then(() => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`BuBu listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Server startup failed:", err && err.message ? err.message : err);
    process.exit(1);
  });

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

