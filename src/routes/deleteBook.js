const { readJsonBody, sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { softDeleteBookByOwner } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleDeleteBook(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/books/delete")) return false;

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

  const bookId = body && body.bookId != null ? Number(body.bookId) : NaN;
  if (!Number.isInteger(bookId) || bookId <= 0) {
    sendJson(res, 400, { error: "Missing or invalid field: bookId" });
    return true;
  }

  try {
    const result = await softDeleteBookByOwner({ userId, bookId });
    if (result.notFound) {
      sendJson(res, 404, { error: "Book not found" });
      return true;
    }
    if (result.forbidden) {
      sendJson(res, 403, { error: "Forbidden: only the creator can delete this book" });
      return true;
    }
    if (result.alreadyDeleted) {
      sendJson(res, 409, { error: "Book already deleted" });
      return true;
    }
    sendJson(res, 200, { ok: true, book: result.book });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to delete book",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleDeleteBook,
};
