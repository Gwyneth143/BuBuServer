const { readJsonBody, sendJson } = require("../utils/http");

async function handleEcho(req, res) {
  if (!(req.method === "POST" && req.url === "/echo")) return false;

  try {
    const body = await readJsonBody(req);
    sendJson(res, 200, { received: body });
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
  }

  return true;
}

module.exports = {
  handleEcho,
};

