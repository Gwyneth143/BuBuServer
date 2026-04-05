const { sendJson } = require("../utils/http");

async function handleHealth(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { name: "BuBu", status: "ok" });
    return true;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "")) {
    sendJson(res, 200, { message: "BuBu backend is running" });
    return true;
  }

  return false;
}

module.exports = {
  handleHealth,
};

