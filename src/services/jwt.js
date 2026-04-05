const jwt = require("jsonwebtoken");

function issueAppJwt(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET env");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(
    {
      sub: String(user.id),
      provider: user.provider,
      appleUserId: user.appleUserId,
    },
    secret,
    {
      expiresIn,
      issuer: process.env.JWT_ISSUER || "bubu-server",
      audience: process.env.JWT_AUDIENCE || "bubu-client",
    }
  );
}

function verifyAppJwt(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET env");
  }

  return jwt.verify(token, secret, {
    issuer: process.env.JWT_ISSUER || "bubu-server",
    audience: process.env.JWT_AUDIENCE || "bubu-client",
  });
}

module.exports = {
  issueAppJwt,
  verifyAppJwt,
};

