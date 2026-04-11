const { readJsonBody, sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { removeUserGallerySkin } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleDeleteMySkin(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/my/skins/delete")) return false;

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

  const userSkinId = body && body.userSkinId != null ? Number(body.userSkinId) : NaN;
  if (!Number.isInteger(userSkinId) || userSkinId <= 0) {
    sendJson(res, 400, { error: "Missing or invalid field: userSkinId" });
    return true;
  }

  try {
    const { removed } = await removeUserGallerySkin({ userId, userSkinId });
    if (!removed) {
      sendJson(res, 404, { error: "Gallery entry not found" });
      return true;
    }
    sendJson(res, 200, { ok: true, userSkinId });
  } catch (err) {
    sendJson(res, 500, {
      error: "Failed to remove skin from gallery",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleDeleteMySkin,
};
