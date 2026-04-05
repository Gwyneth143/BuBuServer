const { sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { listCategoriesByCreatorUserId } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleListCategories(req, res) {
  const pathname = getPathname(req.url);
  if (!(req.method === "GET" && pathname === "/categories")) return false;

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

  try {
    const categories = await listCategoriesByCreatorUserId({ creatorUserId: userId });
    sendJson(res, 200, { categories });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to list categories",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleListCategories,
};
