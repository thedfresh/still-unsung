import { expect, test, type Page } from "../support/e2e";
import { countPasskeys, countUsers, seedSignedInUser, uniqueEmail } from "../support/auth-fixtures";


/** A virtual passkey device in the browser, so the tests run the real WebAuthn steps. */
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test("a signed-in user adds a passkey, then signs in with it", async ({ page, context, baseURL }) => {
  const admin = await seedSignedInUser("ADMIN");
  await addVirtualAuthenticator(page);
  await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect.poll(() => countPasskeys(admin.id)).toBe(1);

  // Sign out by dropping the session, then sign in with the passkey alone.
  await context.clearCookies({ name: "authjs.session-token" });
  await page.goto("/admin/sign-in");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText(`Signed in as ${admin.email}`)).toBeVisible();
});

test("a passkey cannot create a user: an unknown email is refused", async ({ page }) => {
  const email = uniqueEmail("passkey-stranger");
  await addVirtualAuthenticator(page);
  await page.goto("/admin/sign-in");
  // The same two steps the sign-in button takes, but asking to register a new email.
  const status = await page.evaluate(async (address) => {
    const b64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const toB64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const csrf = (await (await fetch("/api/auth/csrf")).json()).csrfToken as string;
    const optionsRes = await fetch(`/api/auth/webauthn-options/passkey?action=register&email=${encodeURIComponent(address)}`);
    const { options } = await optionsRes.json();
    const credential = (await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: b64(options.challenge),
        user: { ...options.user, id: b64(options.user.id) },
        excludeCredentials: [],
      },
    })) as PublicKeyCredential;
    const response = credential.response as AuthenticatorAttestationResponse;
    const data = {
      id: credential.id,
      rawId: toB64(credential.rawId),
      type: credential.type,
      clientExtensionResults: {},
      response: { attestationObject: toB64(response.attestationObject), clientDataJSON: toB64(response.clientDataJSON) },
    };
    const res = await fetch("/api/auth/callback/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken: csrf, callbackUrl: "/admin", action: "register", data: JSON.stringify(data) }),
    });
    return { status: res.status, url: ((await res.json()) as { url?: string }).url ?? "" };
  }, email);
  expect(status.url).toContain("error");
  expect(await countUsers(email)).toBe(0);
});
