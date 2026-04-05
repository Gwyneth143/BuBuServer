const { readJsonBody, sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { insertCategory } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleCreateCategory(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/categories")) return false;

  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing Authorization: Bearer <token>" });
    return true;
  }

  let payload;
  try {
    payload = verifyAppJwt(token);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    sendJson(res, 401, { error: "Invalid or expired token", detail });
    return true;
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId) || userId <= 0) {
    sendJson(res, 401, { error: "Invalid token subject" });
    return true;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return true;
  }

  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    sendJson(res, 400, { error: "Missing or empty field: name" });
    return true;
  }

  try {
    const row = await insertCategory({ creatorUserId: userId, name });
    if (!row) {
      sendJson(res, 500, { error: "Failed to create category" });
      return true;
    }
    sendJson(res, 200, { category: row });
  } catch (err) {
    const dup = err && (err.code === "ER_DUP_ENTRY" || Number(err.errno) === 1062);
    if (dup) {
      sendJson(res, 409, { error: "Category name already exists for this user" });
      return true;
    }
    sendJson(res, 500, {
      error: "Failed to create category",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleCreateCategory,
};
