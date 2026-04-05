const { readJsonBody, sendJson } = require("../utils/http");
const { verifyAppleIdentityToken } = require("../services/appleAuth");
const { upsertAppleUser } = require("../services/db");
const { issueAppJwt } = require("../services/jwt");

async function handleAppleAuth(req, res) {
  if (!(req.method === "POST" && req.url === "/auth/apple")) return false;

  try {
    const body = await readJsonBody(req);
    const identityToken = body && body.identityToken;
    if (!identityToken || typeof identityToken !== "string") {
      sendJson(res, 400, { error: "Missing identityToken" });
      return true;
    }

    const payload = await verifyAppleIdentityToken(identityToken);
    const user = await upsertAppleUser(payload);
    if (!user) throw new Error("Failed to persist Apple user");

    const accessToken = issueAppJwt(user);
    sendJson(res, 200, {
      message: "Apple login success",
      accessToken,
      tokenType: "Bearer",
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      user: {
        id: user.id,
        provider: user.provider,
        appleUserId: user.appleUserId,
        email: user.email,
        emailVerified: Boolean(user.emailVerified),
        isPrivateEmail: Boolean(user.isPrivateEmail),
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    const isAuthError = /apple|token|issuer|audience|jwt/i.test(detail) && !/mysql|persist|database/i.test(detail);
    sendJson(res, isAuthError ? 401 : 500, {
      error: isAuthError ? "Apple identity token verification failed" : "Apple login failed",
      detail,
    });
  }

  return true;
}

module.exports = {
  handleAppleAuth,
};

