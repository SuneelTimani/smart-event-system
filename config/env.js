function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function validateGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
  const hasAnyGoogle = !!(clientId || clientSecret || callbackUrl);

  if (!hasAnyGoogle) {
    return { enabled: false };
  }

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      "Incomplete Google OAuth config. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL."
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(callbackUrl);
  } catch {
    throw new Error("GOOGLE_CALLBACK_URL must be a valid absolute URL.");
  }

  if (parsedUrl.pathname !== "/auth/google/callback") {
    throw new Error("GOOGLE_CALLBACK_URL must end with /auth/google/callback");
  }

  return {
    enabled: true,
    callbackUrl
  };
}

function validateEnv() {
  required("MONGO_URI");
  required("JWT_SECRET");

  const google = validateGoogleConfig();
  return { google };
}

module.exports = { validateEnv, required };
