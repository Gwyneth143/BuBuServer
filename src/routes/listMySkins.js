const { sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { listUserGallerySkins } = require("../services/db");

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

async function handleListMySkins(req, res) {
  if (!(req.method === "GET" && getPathname(req.url) === "/my/skins")) return false;

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

  const typeRaw = sp.get("type");
  let type;
  if (typeRaw === null || String(typeRaw).trim() === "") {
    type = undefined;
  } else {
    const typeNum = Number.parseInt(String(typeRaw).trim(), 10);
    if (!Number.isInteger(typeNum) || typeNum < -32768 || typeNum > 32767) {
      sendJson(res, 400, {
        error: "Invalid query: type must be a SMALLINT integer (-32768 .. 32767)",
      });
      return true;
    }
    type = typeNum;
  }

  const pageRaw = sp.get("page");
  const pageSizeRaw = sp.has("pageSize")
    ? sp.get("pageSize")
    : sp.has("limit")
      ? sp.get("limit")
      : null;

  let page = 1;
  if (pageRaw !== null && String(pageRaw).trim() !== "") {
    const p = Number.parseInt(String(pageRaw).trim(), 10);
    if (!Number.isInteger(p) || p < 1) {
      sendJson(res, 400, {
        error: "Invalid query: page must be a positive integer (default 1)",
      });
      return true;
    }
    page = p;
  }

  let pageSize = 20;
  if (pageSizeRaw !== null && String(pageSizeRaw).trim() !== "") {
    const ps = Number.parseInt(String(pageSizeRaw).trim(), 10);
    if (!Number.isInteger(ps) || ps < 1 || ps > 100) {
      sendJson(res, 400, {
        error: "Invalid query: pageSize / limit must be an integer from 1 to 100 (default 20)",
      });
      return true;
    }
    pageSize = ps;
  }

  try {
    const result = await listUserGallerySkins({ userId, type, page, pageSize });
    sendJson(res, 200, {
      skins: result.skins,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to list my skins",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleListMySkins,
};
