const { sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { listBooks } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function parseQuery(url) {
  const q = url.indexOf("?");
  const qs = q === -1 ? "" : url.slice(q + 1);
  return new URLSearchParams(qs);
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i >= 1 ? i : fallback;
}

async function handleListBooks(req, res) {
  if (req.method !== "GET") return false;

  const pathname = getPathname(req.url);
  if (pathname !== "/books") return false;

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

  const sp = parseQuery(req.url || "");

  const page = parsePositiveInt(sp.get("page"), 1);
  const pageSizeRaw = sp.get("pageSize") ?? sp.get("limit");
  const pageSize = Math.min(100, Math.max(1, parsePositiveInt(pageSizeRaw, 20)));

  const categoryName =
    sp.get("categoryName") ?? sp.get("category_name") ?? null;

  try {
    const result = await listBooks({
      page,
      pageSize,
      creatorUserId: userId,
      categoryName,
    });
    sendJson(res, 200, result);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "internal server error" });
  }
  return true;
}

module.exports = { handleListBooks };
