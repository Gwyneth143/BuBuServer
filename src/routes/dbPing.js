const { sendJson } = require("../utils/http");
const { getMysqlPool } = require("../services/db");

async function handleDbPing(req, res) {
  if (!(req.method === "GET" && req.url === "/db/ping")) return false;

  try {
    const pool = getMysqlPool();
    const [rows] = await pool.query("SELECT 1 AS ok");
    const ok = Array.isArray(rows) && rows[0] && rows[0].ok === 1;
    sendJson(res, 200, { mysql: ok ? "ok" : "unknown" });
  } catch (err) {
    sendJson(res, 500, {
      error: "MySQL connection failed",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleDbPing,
};

