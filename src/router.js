const fs = require("fs");
const path = require("path");
const { sendJson } = require("./utils/http");

function loadRouteHandlers() {
  const routesDir = path.join(__dirname, "routes");
  const files = fs
    .readdirSync(routesDir)
    .filter((file) => file.endsWith(".js"))
    .sort((a, b) => a.localeCompare(b));

  const handlers = [];
  for (const file of files) {
    const routeModule = require(path.join(routesDir, file));
    for (const [exportName, value] of Object.entries(routeModule)) {
      if (typeof value === "function" && exportName.startsWith("handle")) {
        handlers.push(value);
      }
    }
  }

  return handlers;
}

const routeHandlers = loadRouteHandlers();

async function handleRequest(req, res) {
  for (const handler of routeHandlers) {
    // Route handlers return true when they handled the request.
    if (await handler(req, res)) return;
  }

  sendJson(res, 404, { error: "Not Found" });
}

module.exports = {
  handleRequest,
};

