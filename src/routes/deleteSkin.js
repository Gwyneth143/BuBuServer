const { readJsonBody, sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { deleteSkinByOwner } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleDeleteSkin(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/skins/delete")) return false;

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

  const skinId = body && body.skinId != null ? Number(body.skinId) : NaN;
  if (!Number.isInteger(skinId) || skinId <= 0) {
    sendJson(res, 400, { error: "Missing or invalid field: skinId" });
    return true;
  }

  try {
    const result = await deleteSkinByOwner({ skinId, ownerUserId: userId });
    if (result.notFound) {
      sendJson(res, 404, { error: "Skin not found" });
      return true;
    }
    if (result.forbidden) {
      sendJson(res, 403, {
        error: "Forbidden: only the creator can delete this skin, or system skins cannot be deleted here",
      });
      return true;
    }
    if (result.alreadyDeleted) {
      sendJson(res, 409, { error: "Skin already deleted" });
      return true;
    }
    if (!result.removed) {
      sendJson(res, 500, { error: "Failed to delete skin" });
      return true;
    }

    sendJson(res, 200, { ok: true, skinId });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to delete skin",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleDeleteSkin,
};
