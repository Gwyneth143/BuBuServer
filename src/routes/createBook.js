const { readJsonBody, sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { insertBook } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleCreateBook(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/books")) return false;

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

  const title =
    body && body.title != null && String(body.title).trim() !== ""
      ? String(body.title).trim()
      : "";
  const categoryNameRaw =
    body && body.category_name !== undefined
      ? body.category_name
      : body && body.categoryName !== undefined
        ? body.categoryName
        : undefined;
  const categoryName =
    categoryNameRaw != null && String(categoryNameRaw).trim() !== ""
      ? String(categoryNameRaw).trim()
      : "";

  const skinId = body && body.skinId != null ? Number(body.skinId) : NaN;

  if (!title) {
    sendJson(res, 400, { error: "Missing or empty field: title" });
    return true;
  }
  if (!categoryName) {
    sendJson(res, 400, { error: "Missing or empty field: category_name" });
    return true;
  }
  if (!Number.isInteger(skinId) || skinId <= 0) {
    sendJson(res, 400, { error: "Missing or invalid field: skinId" });
    return true;
  }

  try {
    const result = await insertBook({
      creatorUserId: userId,
      title,
      categoryName,
      skinId,
    });
    if (result && result.notFound) {
      sendJson(res, 404, { error: "Skin not found" });
      return true;
    }
    if (!result || !result.book) {
      sendJson(res, 500, { error: "Failed to create book" });
      return true;
    }
    sendJson(res, 200, { book: result.book });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to create book",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleCreateBook,
};
