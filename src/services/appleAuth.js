const appleSigninAuth = require("apple-signin-auth");

function parseAppleAudience() {
  const raw = process.env.APPLE_CLIENT_ID || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function verifyAppleIdentityToken(identityToken) {
  const audience = parseAppleAudience();
  if (!audience.length) {
    throw new Error("Missing APPLE_CLIENT_ID env (supports comma-separated list)");
  }

  const payload = await appleSigninAuth.verifyIdToken(identityToken, {
    audience,
    ignoreExpiration: false,
  });

  if (payload.iss !== "https://appleid.apple.com") {
    throw new Error("Invalid Apple token issuer");
  }

  return payload;
}

module.exports = {
  verifyAppleIdentityToken,
};

