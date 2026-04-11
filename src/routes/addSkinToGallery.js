const { readJsonBody, sendJson, getBearerToken } = require("../utils/http");
const { verifyAppJwt } = require("../services/jwt");
const { addSkinToUserGallery } = require("../services/db");

function getPathname(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

async function handleAddSkinToGallery(req, res) {
  if (!(req.method === "POST" && getPathname(req.url) === "/my/skins")) return false;

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
    const result = await addSkinToUserGallery({ userId, skinId });
    if (result && result.notFound) {
      sendJson(res, 404, { error: "Skin not found" });
      return true;
    }
    sendJson(res, 200, {
      userSkin: result.row,
      skin: result.skin,
    });
  } catch (err) {
    const dup = err && (err.code === "ER_DUP_ENTRY" || Number(err.errno) === 1062);
    if (dup) {
      sendJson(res, 409, { error: "Skin already added to your gallery" });
      return true;
    }
    sendJson(res, 500, {
      error: "Failed to add skin to gallery",
      detail: err && err.message ? err.message : String(err),
    });
  }

  return true;
}

module.exports = {
  handleAddSkinToGallery,
};
