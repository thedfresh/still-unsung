import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer, type Server } from "node:http";

/**
 * A fake of Google's sign-in (docs/TESTING.md, section 3): only Google's reply is faked. It is
 * an OpenID Connect server that signs in whoever the `fake-google-email` cookie names, so each
 * browser test picks its own user. Our own session, adapter and role code run for real.
 */
export const FAKE_GOOGLE_PORT = 4100;
export const FAKE_GOOGLE_CLIENT_ID = "e2e-client-id";
export const EMAIL_COOKIE = "fake-google-email";
export const UNVERIFIED_COOKIE = "fake-google-unverified";

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export function startFakeGoogle(port = FAKE_GOOGLE_PORT): Promise<Server> {
  const issuer = `http://localhost:${port}`;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fake", use: "sig", alg: "RS256" };
  const tokens = new Map<string, { email: string; verified: boolean }>();
  const codes = new Map<string, { email: string; nonce: string | null; verified: boolean }>();

  const idToken = (email: string, nonce: string | null, verified: boolean) => {
    const header = b64url(JSON.stringify({ alg: "RS256", kid: "fake", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: issuer,
      aud: FAKE_GOOGLE_CLIENT_ID,
      sub: `sub-${email}`,
      email,
      email_verified: verified,
      name: "Fake Person",
      iat: now,
      exp: now + 3600,
      ...(nonce ? { nonce } : {}),
    };
    const body = `${header}.${b64url(JSON.stringify(claims))}`;
    return `${body}.${b64url(sign("RSA-SHA256", Buffer.from(body), privateKey))}`;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", issuer);
    const json = (data: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/.well-known/openid-configuration") {
      return json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        userinfo_endpoint: `${issuer}/userinfo`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url.pathname === "/jwks") return json({ keys: [jwk] });
    if (url.pathname === "/userinfo") {
      const email = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
      if (!email) {
        res.statusCode = 401;
        return json({ error: "invalid_token" });
      }
      return json({ sub: `sub-${email.email}`, email: email.email, email_verified: email.verified, name: "Fake Person" });
    }
    if (url.pathname === "/authorize") {
      const cookies = Object.fromEntries(
        (req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=").map(decodeURIComponent)),
      );
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        email: cookies[EMAIL_COOKIE] ?? "nobody@example.test",
        nonce: url.searchParams.get("nonce"),
        verified: cookies[UNVERIFIED_COOKIE] !== "1",
      });
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.statusCode = 302;
      res.setHeader("Location", back.toString());
      return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const code = new URLSearchParams(Buffer.concat(chunks).toString()).get("code") ?? "";
      const entry = codes.get(code);
      if (!entry) {
        res.statusCode = 400;
        return json({ error: "invalid_grant" });
      }
      codes.delete(code);
      const accessToken = randomBytes(16).toString("hex");
      tokens.set(accessToken, { email: entry.email, verified: entry.verified });
      return json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid email profile",
        id_token: idToken(entry.email, entry.nonce, entry.verified),
      });
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
