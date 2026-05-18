import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateTenantBranchUiSession,
  authenticateUiSession,
  extractAuthAppToken,
  parseHtmlForm
} from "../src/ui-auth.js";

test("parseHtmlForm extracts action, method, and hidden fields", () => {
  const form = parseHtmlForm(`
    <form method="post" action="/Login/LoginUser">
      <input type="hidden" name="__RequestVerificationToken" value="abc&amp;123">
      <input name="Email" value="old@example.com">
      <input name="DisabledEmail" value="skip@example.com" disabled readonly>
      <input name="password">
      <button name="login" type="submit">Log in</button>
    </form>
  `, new URL("https://us-auth.hammertechonline.com/Login/LoginUser"));

  assert.equal(form.method, "POST");
  assert.equal(form.action.href, "https://us-auth.hammertechonline.com/Login/LoginUser");
  assert.equal(form.fields.__RequestVerificationToken, "abc&123");
  assert.equal(form.fields.Email, "old@example.com");
  assert.equal(form.fields.DisabledEmail, undefined);
  assert.equal(form.fields.login, "");
});

test("parseHtmlForm can select the form with the requested field", () => {
  const form = parseHtmlForm(`
    <form method="post" action="/first">
      <input name="email">
    </form>
    <form method="post" action="/Login/LoginUser">
      <input name="password">
      <input type="hidden" name="__RequestVerificationToken" value="login-token">
    </form>
  `, new URL("https://us-auth.hammertechonline.com/Login/VerifyEmail"), {
    fieldNames: ["password"]
  });

  assert.equal(form.action.href, "https://us-auth.hammertechonline.com/Login/LoginUser");
  assert.equal(form.fields.__RequestVerificationToken, "login-token");
});

test("extractAuthAppToken only reads browser auth token shapes", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature_1";
  const matchingJwt = jwtForPayload({ email: "person@example.com", sub: "123" });
  const unrelatedJwt = jwtForPayload({ email: "other@example.com", sub: "456" });

  assert.equal(extractAuthAppToken(`setJwtToken("${jwt}")`), jwt);
  assert.equal(extractAuthAppToken(`localStorage.setItem('HT-AuthToken', '${jwt}')`), jwt);
  assert.equal(extractAuthAppToken(`var authJwt = "${jwt}"; setJwtToken(authJwt);`), jwt);
  assert.equal(extractAuthAppToken(`localStorage['HT-AuthToken'] = '${jwt.replaceAll(".", "\\u002e")}'`), jwt);
  assert.equal(extractAuthAppToken(`var authJwt = "${matchingJwt}";`, "", { email: "person@example.com" }), matchingJwt);
  assert.equal(extractAuthAppToken(`var authJwt = "${unrelatedJwt}";`, "", { email: "person@example.com" }), "");
  assert.equal(extractAuthAppToken(`<input name="token" value="${jwt}">`), "");
});

test("authenticateUiSession creates auth app token before tenant callback", async () => {
  const calls = [];
  const authJwt = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InBlcnNvbkBleGFtcGxlLmNvbSJ9.signature";
  const fetchImpl = async (url, options) => {
    const target = new URL(url);
    calls.push({ url: target.href, options });

    if (options.method === "GET" && target.pathname === "/Login/VerifyEmail") {
      assert.equal(target.searchParams.get("tenant"), "acme");
      assert.equal(target.searchParams.get("isChangePassword"), "false");
      assert.equal(target.searchParams.has("returnUrl"), false);
      return response(200, `
        <form method="post" action="/Login/VerifyEmail">
          <input type="hidden" name="__RequestVerificationToken" value="verify-token">
          <input name="email">
          <button name="submit" type="submit">NEXT</button>
        </form>
      `, {
        setCookie: ["AUTH_PAGE=one; Path=/; Secure"]
      });
    }

    if (options.method === "POST" && target.pathname === "/Login/VerifyEmail") {
      assert.match(options.body, /email=person%40example\.com/);
      assert.match(options.body, /__RequestVerificationToken=verify-token/);
      return response(200, `
        <form method="post" action="/Login/LoginUser?tenant=acme&amp;email=person%40example.com">
          <input type="hidden" name="__RequestVerificationToken" value="login-token">
          <input name="password">
          <button id="btnLogin" name="login" type="submit">LOG IN</button>
        </form>
      `, {
        setCookie: ["AUTH_VERIFY=two; Path=/; Secure"]
      });
    }

    if (options.method === "POST" && target.pathname === "/Login/LoginUser") {
      assert.match(options.body, /password=secret/);
      assert.doesNotMatch(options.body, /email=/);
      assert.doesNotMatch(options.body, /tenant=/);
      assert.match(options.body, /login=/);
      return response(200, `<script>setJwtToken("${authJwt}")</script>`, {
        setCookie: ["AUTH_LOGIN=three; Path=/; Secure"]
      });
    }

    if (target.href === "https://us-auth.hammertechonline.com/Login/VerifyToken") {
      assert.equal(options.method, "POST");
      assert.match(options.body, new RegExp(`token=${encodeURIComponent(authJwt)}`));
      assert.match(options.body, /tenantKey=acme/);
      assert.match(options.headers.cookie, /AUTH_LOGIN=three/);
      return response(200, JSON.stringify({ status: true, isEmailValidForTenant: true }), {
        contentType: "application/json; charset=utf-8"
      });
    }

    if (target.href === "https://us-auth.hammertechonline.com/Login/GenerateTenantToken") {
      assert.equal(options.method, "POST");
      assert.match(options.body, new RegExp(`authToken=${encodeURIComponent(authJwt)}`));
      assert.match(options.body, /tenantDomain=acme/);
      assert.match(options.headers.cookie, /AUTH_LOGIN=three/);
      return response(200, JSON.stringify({ status: false, token: "tenant-token" }), {
        contentType: "application/json; charset=utf-8"
      });
    }

    if (target.href === "https://acme.hammertechonline.com/company/account/AuthCallBack") {
      assert.equal(options.method, "POST");
      assert.match(options.body, /token=tenant-token/);
      assert.equal(options.headers["x-requested-with"], undefined);
      return response(200, "<html></html>", {
        setCookie: ["HAMMERTECHAUTH1ACME.HAMMERTECHONLINE.COM=ui-cookie; Path=/; Secure; HttpOnly"]
      });
    }

    throw new Error(`Unexpected request ${options.method} ${target.href}`);
  };

  const result = await authenticateUiSession({
    region: "us",
    tenant: "acme",
    email: "person@example.com",
    password: "secret",
    fetchImpl
  });

  assert.equal(result.tenantHost, "acme.hammertechonline.com");
  assert.deepEqual(result.cookieNames, ["HAMMERTECHAUTH1ACME.HAMMERTECHONLINE.COM"]);
  assert.match(
    result.cookieJar.headerFor("https://acme.hammertechonline.com/company/api/ChecklistTypesApi"),
    /HAMMERTECHAUTH1ACME\.HAMMERTECHONLINE\.COM=ui-cookie/
  );
  assert.equal(calls.length, 6);
});

test("authenticateUiSession submits tenant callback form returned by password login", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const target = new URL(url);
    calls.push({ url: target.href, options });

    if (options.method === "GET" && target.pathname === "/Login/VerifyEmail") {
      return response(200, `
        <form method="post" action="/Login/VerifyEmail?tenant=acme&amp;returnUrl=https%3A%2F%2Facme.hammertechonline.com%2Fcompany%2Faccount%2FAuthCallBack">
          <input type="hidden" name="__RequestVerificationToken" value="verify-token">
          <input name="email">
          <button name="submit" type="submit">NEXT</button>
        </form>
      `);
    }

    if (options.method === "POST" && target.pathname === "/Login/VerifyEmail") {
      return response(200, `
        <form method="post" action="/Login/LoginUser?tenant=acme&amp;email=person%40example.com&amp;returnUrl=https%3A%2F%2Facme.hammertechonline.com%2Fcompany%2Faccount%2FAuthCallBack">
          <input type="hidden" name="__RequestVerificationToken" value="login-token">
          <input name="password">
          <button id="btnLogin" name="login" type="submit">LOG IN</button>
        </form>
      `);
    }

    if (options.method === "POST" && target.pathname === "/Login/LoginUser") {
      return response(200, `
        <form id="frmLoginSuccess" method="post" action="https://acme.hammertechonline.com/company/account/AuthCallBack">
          <input type="hidden" name="token" value="tenant-token">
          <input type="hidden" name="returnUrl" value="">
        </form>
      `);
    }

    if (target.href === "https://acme.hammertechonline.com/company/account/AuthCallBack") {
      assert.equal(options.method, "POST");
      assert.match(options.body, /token=tenant-token/);
      assert.equal(options.headers["x-requested-with"], undefined);
      return response(200, "<html></html>", {
        setCookie: ["HAMMERTECHAUTH1ACME.HAMMERTECHONLINE.COM=ui-cookie; Path=/; Secure; HttpOnly"]
      });
    }

    throw new Error(`Unexpected request ${options.method} ${target.href}`);
  };

  const result = await authenticateUiSession({
    region: "us",
    tenant: "acme",
    email: "person@example.com",
    password: "secret",
    fetchImpl
  });

  assert.equal(result.tenantHost, "acme.hammertechonline.com");
  assert.match(
    result.cookieJar.headerFor("https://acme.hammertechonline.com/company/api/ChecklistTypesApi"),
    /HAMMERTECHAUTH1ACME\.HAMMERTECHONLINE\.COM=ui-cookie/
  );
  assert.equal(calls.length, 4);
});

test("authenticateTenantBranchUiSession follows GenerateTenantToken and tenant callback endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const target = new URL(url);
    calls.push({ url: target.href, options });

    if (target.href === "https://us-auth.hammertechonline.com/Login/VerifyToken") {
      assert.equal(options.method, "POST");
      assert.match(options.body, /token=api-token/);
      assert.match(options.body, /tenantKey=acme/);
      return response(200, JSON.stringify({ status: true, isEmailValidForTenant: true }), {
        contentType: "application/json; charset=utf-8"
      });
    }

    if (target.href === "https://us-auth.hammertechonline.com/Login/GenerateTenantToken") {
      assert.equal(options.method, "POST");
      assert.match(options.body, /authToken=api-token/);
      assert.match(options.body, /tenantDomain=acme/);
      return response(200, JSON.stringify({ status: false, token: "tenant-token" }), {
        contentType: "application/json; charset=utf-8"
      });
    }

    if (target.href === "https://acme.hammertechonline.com/company/account/AuthCallBack") {
      assert.equal(options.method, "POST");
      assert.match(options.body, /token=tenant-token/);
      assert.match(options.body, /returnUrl=/);
      return response(200, "<html></html>", {
        setCookie: ["HAMMERTECHAUTH1ACME.HAMMERTECHONLINE.COM=ui-cookie; Path=/; Secure; HttpOnly"]
      });
    }

    throw new Error(`Unexpected request ${options.method} ${target.href}`);
  };

  const result = await authenticateTenantBranchUiSession({
    region: "us",
    tenant: "acme",
    authToken: "api-token",
    fetchImpl
  });

  assert.equal(result.tenantHost, "acme.hammertechonline.com");
  assert.match(
    result.cookieJar.headerFor("https://acme.hammertechonline.com/company/api/ChecklistTypesApi"),
    /HAMMERTECHAUTH1ACME\.HAMMERTECHONLINE\.COM=ui-cookie/
  );
  assert.equal(calls.length, 3);
});

function response(status, body, { location, setCookie = [], contentType = "text/html; charset=utf-8" } = {}) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Found",
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (name.toLowerCase() === "location") return location || null;
        if (name.toLowerCase() === "set-cookie") return setCookie.join(", ");
        if (name.toLowerCase() === "content-type") return contentType;
        return null;
      },
      getSetCookie() {
        return setCookie;
      }
    },
    async text() {
      return body;
    }
  };
}

function jwtForPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}
