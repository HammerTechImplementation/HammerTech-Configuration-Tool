import { getRegionConfig, normalizeRegion } from "./config.js";
import { CookieJar } from "./http.js";
import { tenantHost } from "./checklists.js";

const defaultLoginQuery = {
  IsChangePassword: "False",
  ResetName: "False",
  IsChangepasswordFirstTime: "False",
  Source: "LoginClick"
};

export async function authenticateUiSession({
  region,
  tenant,
  email,
  password,
  authToken,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedRegion = normalizeRegion(region || "us");
  const missing = [];
  if (!tenant) missing.push("tenant");
  if (!email) missing.push("email");
  if (!password) missing.push("password");
  if (missing.length) {
    throw new Error(`Missing UI session field(s): ${missing.join(", ")}.`);
  }
  if (!fetchImpl) throw new Error("No fetch implementation available. Use Node.js 22 or newer.");

  if (authToken) {
    return authenticateTenantBranchUiSession({
      region: normalizedRegion,
      tenant,
      authToken,
      fetchImpl
    });
  }

  return authenticateAuthAppUiSession({
    region: normalizedRegion,
    tenant,
    email,
    password,
    fetchImpl
  });
}

async function authenticateAuthAppUiSession({
  region,
  tenant,
  email,
  password,
  fetchImpl
}) {
  const normalizedRegion = normalizeRegion(region || "us");
  const host = tenantHost(tenant);
  const authLogin = await obtainAuthAppLogin({
    region: normalizedRegion,
    tenant,
    email,
    password,
    fetchImpl
  });
  if (authLogin.uiSession) return authLogin.uiSession;

  return authenticateTenantBranchUiSession({
    region: normalizedRegion,
    tenant: host,
    authToken: authLogin.authToken,
    authPageUrl: authLogin.authPageUrl,
    cookieJar: authLogin.cookieJar,
    fetchImpl
  });
}

export async function obtainAuthAppToken({
  region,
  tenant,
  email,
  password,
  fetchImpl = globalThis.fetch
} = {}) {
  const login = await obtainAuthAppLogin({
    region,
    tenant,
    email,
    password,
    fetchImpl
  });
  return login.authToken;
}

async function obtainAuthAppLogin({
  region,
  tenant,
  email,
  password,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedRegion = normalizeRegion(region || "us");
  const regionConfig = getRegionConfig(normalizedRegion);
  const host = tenantHost(tenant);
  const tenantDomain = tenantName(host);
  const jar = new CookieJar();
  const verifyUrl = new URL("/Login/VerifyEmail", regionConfig.authBaseUrl);
  verifyUrl.searchParams.set("tenant", tenantDomain);
  verifyUrl.searchParams.set("isChangePassword", "false");

  const verifyPage = await fetchWithCookies(fetchImpl, jar, verifyUrl, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  const verifyHtml = await verifyPage.text();
  if (!verifyPage.ok) {
    throw new Error(`HammerTech VerifyEmail page failed: ${verifyPage.status} ${verifyPage.statusText}`);
  }

  const verifyForm = parseHtmlForm(verifyHtml, verifyUrl, {
    fieldNames: ["email"]
  });
  const verifyFields = { ...verifyForm.fields };
  setField(verifyFields, "email", email, { addIfMissing: true });
  let response = await fetchWithCookies(fetchImpl, jar, verifyForm.action, {
    method: verifyForm.method || "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: regionConfig.authBaseUrl,
      referer: verifyUrl.href
    },
    body: new URLSearchParams(verifyFields).toString()
  });
  response = await followRedirects(fetchImpl, jar, response, verifyForm.action, verifyUrl.href);
  const loginHtml = await response.text();
  const callbackSessionFromVerify = await submitTenantCallbackFormIfPresent({
    html: loginHtml,
    pageUrl: response.url || verifyForm.action.href,
    fetchImpl,
    jar,
    region: normalizedRegion,
    tenant: tenantDomain,
    host,
    referer: verifyForm.action.href
  });
  if (callbackSessionFromVerify) return { uiSession: callbackSessionFromVerify };

  const tokenFromVerify = extractAuthAppToken(loginHtml, response.url || "", {
    email
  });
  if (tokenFromVerify) {
    return {
      authToken: tokenFromVerify,
      authPageUrl: authRootPageUrl({
        regionConfig,
        tenant: tenantDomain,
        email,
        html: loginHtml,
        fallbackUrl: response.url || verifyForm.action.href
      }),
      cookieJar: jar
    };
  }

  const loginUrl = response.url ? new URL(response.url) : new URL("/Login/LoginUser", regionConfig.authBaseUrl);
  const loginForm = parseHtmlForm(loginHtml, loginUrl, {
    fieldNames: ["password"]
  });
  const loginFields = { ...loginForm.fields };
  setField(loginFields, "password", password, { addIfMissing: true });

  response = await fetchWithCookies(fetchImpl, jar, loginForm.action, {
    method: loginForm.method || "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: regionConfig.authBaseUrl,
      referer: loginUrl.href
    },
    body: new URLSearchParams(loginFields).toString()
  });
  response = await followRedirects(fetchImpl, jar, response, loginForm.action, loginUrl.href);
  const finalHtml = await response.text();
  if (hasTenantAuthCookie(jar, host)) {
    return {
      uiSession: tenantAuthCookieResult({
        jar,
        region: normalizedRegion,
        tenant: tenantDomain,
        host
      })
    };
  }

  const token = extractAuthAppToken(finalHtml, response.url || "", {
    email
  });
  if (!token) {
    const callbackSession = await submitTenantCallbackFormIfPresent({
      html: finalHtml,
      pageUrl: response.url || loginForm.action.href,
      fetchImpl,
      jar,
      region: normalizedRegion,
      tenant: tenantDomain,
      host,
      referer: loginForm.action.href
    });
    if (callbackSession) return { uiSession: callbackSession };

    const pageMessage = extractPageMessage(finalHtml);
    const pageSummary = describeAuthPage(finalHtml, response.url || loginForm.action.href, jar);
    throw new Error(
      `HammerTech auth app login did not return HT-AuthToken. ` +
      `Final status: ${response.status}. Final URL: ${response.url || loginForm.action.href}.` +
      `${pageMessage ? ` Page message: ${pageMessage}.` : ""}` +
      `${pageSummary ? ` Returned page: ${pageSummary}.` : ""}`
    );
  }
  return {
    authToken: token,
    authPageUrl: authRootPageUrl({
      regionConfig,
      tenant: tenantDomain,
      email,
      html: finalHtml,
      fallbackUrl: response.url || loginForm.action.href
    }),
    cookieJar: jar
  };
}

export async function authenticateTenantBranchUiSession({
  region,
  tenant,
  authToken,
  authPageUrl,
  cookieJar,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedRegion = normalizeRegion(region || "us");
  const regionConfig = getRegionConfig(normalizedRegion);
  const host = tenantHost(tenant);
  const tenantDomain = tenantName(host);
  if (!authToken) throw new Error("Missing authToken for tenant branch login.");

  const jar = cookieJar instanceof CookieJar ? cookieJar : new CookieJar(cookieJar || []);
  const generateUrl = new URL("/Login/GenerateTenantToken", regionConfig.authBaseUrl);
  const callbackUrl = new URL("/company/account/AuthCallBack", `https://${host}`);
  const authRootUrl = authPageUrl ? new URL(authPageUrl) : new URL("/", regionConfig.authBaseUrl);
  if (!authPageUrl) {
    authRootUrl.searchParams.set("returnUrl", "");
    authRootUrl.searchParams.set("tenant", tenantDomain);
  }

  const verify = await postForm(fetchImpl, jar, new URL("/Login/VerifyToken", regionConfig.authBaseUrl), {
    token: authToken,
    tenantKey: tenantDomain
  }, {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      origin: regionConfig.authBaseUrl,
      referer: authRootUrl.href
    }
  });
  const verifyBody = await readResponseBody(verify);
  if (!verify.ok || verifyBody?.status === false) {
    throw new Error(
      `VerifyToken failed: ${verify.status} ${verify.statusText}` +
      `${verifyBody?.message ? ` - ${verifyBody.message}` : ""}` +
      `${verifyBody && typeof verifyBody === "object" ? ` Response keys: ${Object.keys(verifyBody).join(", ")}.` : ""}` +
      ` Auth token: ${describeJwt(authToken)}.`
    );
  }
  if (verifyBody?.isEmailValidForTenant === false) {
    throw new Error(`VerifyToken rejected this email for tenant ${tenantDomain}. Auth token: ${describeJwt(authToken)}.`);
  }

  const generated = await postForm(fetchImpl, jar, generateUrl, {
    authToken,
    tenantDomain
  }, {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      origin: regionConfig.authBaseUrl,
      referer: authRootUrl.href
    }
  });

  const generatedBody = await readResponseBody(generated);
  if (!generated.ok) {
    throw new Error(
      `GenerateTenantToken failed: ${generated.status} ${generated.statusText}` +
      `${generatedBody?.message ? ` - ${generatedBody.message}` : ""}` +
      `${generatedBody && typeof generatedBody === "object" ? ` Response keys: ${Object.keys(generatedBody).join(", ")}.` : ""}` +
      ` Auth token: ${describeJwt(authToken)}.`
    );
  }

  const tenantToken = generatedBody?.token || generatedBody?.authToken || generatedBody?.data?.token;
  if (!tenantToken) {
    throw new Error(
      `GenerateTenantToken did not return a token. ` +
      `Status: ${generatedBody?.status ?? "unknown"}. ` +
      `Status code: ${generatedBody?.statusCode ?? "unknown"}. ` +
      `${generatedBody?.message ? `Message: ${generatedBody.message}. ` : ""}` +
      `Response keys: ${Object.keys(generatedBody || {}).join(", ")}. ` +
      `Auth token: ${describeJwt(authToken)}.`
    );
  }

  const callbackFields = {
    token: tenantToken,
    returnUrl: ""
  };
  const verificationToken = generatedBody.__RequestVerificationToken ||
    generatedBody.requestVerificationToken ||
    generatedBody.verificationToken;
  if (verificationToken) callbackFields.__RequestVerificationToken = verificationToken;

  let callbackResponse = await postForm(fetchImpl, jar, callbackUrl, callbackFields, {
    xhr: false,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: regionConfig.authBaseUrl,
      referer: authRootUrl.href
    }
  });
  callbackResponse = await followRedirects(fetchImpl, jar, callbackResponse, callbackUrl, authRootUrl.href);
  if (hasTenantAuthCookie(jar, host)) {
    return tenantAuthCookieResult({
      jar,
      region: normalizedRegion,
      tenant: tenantDomain,
      host
    });
  }

  const validate = await postTenantAccountForm(fetchImpl, jar, host, "/Account/ValidateToken", {
    token: tenantToken
  }, callbackUrl);
  const validateBody = await readResponseBody(validate);
  if (!validate.ok || validateBody?.status !== "SUCCESS") {
    throw new Error(`Tenant ValidateToken failed: ${validateBody?.status || validate.status}`);
  }

  const authResponse = await postTenantAccountForm(fetchImpl, jar, host, "/Account/AuthenticateFromAuthServiceToken", {
    token: tenantToken,
    returnUrl: ""
  }, callbackUrl);
  const authBody = await readResponseBody(authResponse);
  if (!authResponse.ok || authBody?.status !== "SUCCESS" || !authBody?.id) {
    throw new Error(
      `Tenant AuthenticateFromAuthServiceToken failed: ${authBody?.status || authResponse.status}` +
      `${authBody?.reason ? ` - ${authBody.reason}` : ""}`
    );
  }

  const loginSuccessUrl = new URL("/company/account/loginsuccess", `https://${host}`);
  let finalResponse = await postForm(fetchImpl, jar, loginSuccessUrl, {
    id: authBody.id,
    returnUrl: ""
  }, {
    xhr: false,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: `https://${host}`,
      referer: callbackUrl.href
    }
  });
  finalResponse = await followRedirects(fetchImpl, jar, finalResponse, loginSuccessUrl, callbackUrl.href);

  return requireTenantAuthCookie({
    jar,
    region: normalizedRegion,
    tenant: tenantDomain,
    host,
    finalResponse,
    finalUrl: finalResponse.url || loginSuccessUrl.href,
    flow: "tenant branch"
  });
}

async function authenticatePasswordFormUiSession({
  region,
  tenant,
  email,
  password,
  fetchImpl
}) {
  const normalizedRegion = normalizeRegion(region || "us");
  const regionConfig = getRegionConfig(normalizedRegion);
  const host = tenantHost(tenant);
  const jar = new CookieJar();
  const loginUrl = new URL("/Login/LoginUser", regionConfig.authBaseUrl);
  loginUrl.searchParams.set("Email", email);
  loginUrl.searchParams.set("Tenant", tenantName(tenant));
  for (const [key, value] of Object.entries(defaultLoginQuery)) loginUrl.searchParams.set(key, value);

  const loginPage = await fetchWithCookies(fetchImpl, jar, loginUrl, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  const loginHtml = await loginPage.text();
  if (!loginPage.ok) {
    throw new Error(`HammerTech UI login page failed: ${loginPage.status} ${loginPage.statusText}`);
  }

  const form = parseHtmlForm(loginHtml, loginUrl);
  const fields = {
    ...form.fields
  };
  setField(fields, "Email", email, { addIfMissing: false });
  setField(fields, "email", email, { addIfMissing: false });
  setField(fields, "Tenant", tenantName(tenant), { addIfMissing: false });
  setField(fields, "tenant", tenantName(tenant), { addIfMissing: false });
  setField(fields, "password", password, { addIfMissing: true });

  let currentUrl = form.action || loginUrl;
  let response = await fetchWithCookies(fetchImpl, jar, currentUrl, {
    method: form.method || "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: loginUrl.origin,
      referer: loginUrl.href
    },
    body: new URLSearchParams(fields).toString()
  });

  for (let count = 0; count < 12; count += 1) {
    const location = response.headers.get("location");
    if (!isRedirect(response.status) || !location) break;
    currentUrl = new URL(location, currentUrl);
    response = await fetchWithCookies(fetchImpl, jar, currentUrl, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: loginUrl.href
      }
    });
  }

  return requireTenantAuthCookie({
    jar,
    region: normalizedRegion,
    tenant: tenantName(tenant),
    host,
    finalResponse: response,
    finalUrl: currentUrl.href,
    flow: "password form"
  });
}

function fetchWithCookies(fetchImpl, jar, url, options = {}) {
  const requestHeaders = {
    ...(options.headers || {})
  };
  const cookieHeader = jar.headerFor(url);
  if (cookieHeader) requestHeaders.cookie = cookieHeader;

  return fetchImpl(url, {
    ...options,
    redirect: "manual",
    headers: requestHeaders
  }).then((response) => {
    jar.storeFromHeaders(url, response.headers);
    return response;
  });
}

function postForm(fetchImpl, jar, url, fields, { headers = {}, xhr = true } = {}) {
  const requestHeaders = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    ...headers
  };
  if (xhr) requestHeaders["x-requested-with"] = "XMLHttpRequest";

  return fetchWithCookies(fetchImpl, jar, url, {
    method: "POST",
    headers: requestHeaders,
    body: new URLSearchParams(fields).toString()
  });
}

function postTenantAccountForm(fetchImpl, jar, host, path, fields, referer) {
  const url = new URL(path, `https://${host}`);
  return postForm(fetchImpl, jar, url, fields, {
    headers: {
      origin: `https://${host}`,
      referer: referer.href || String(referer)
    }
  });
}

async function followRedirects(fetchImpl, jar, response, currentUrl, referer) {
  let nextResponse = response;
  let nextUrl = new URL(currentUrl);
  for (let count = 0; count < 12; count += 1) {
    const location = nextResponse.headers.get("location");
    if (!isRedirect(nextResponse.status) || !location) break;
    nextUrl = new URL(location, nextUrl);
    nextResponse = await fetchWithCookies(fetchImpl, jar, nextUrl, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer
      }
    });
  }
  return nextResponse;
}

async function submitTenantCallbackFormIfPresent({
  html,
  pageUrl,
  fetchImpl,
  jar,
  region,
  tenant,
  host,
  referer
}) {
  const forms = parseHtmlForms(html, pageUrl);
  const callbackUrl = new URL("/company/account/AuthCallBack", `https://${host}`);
  const tokenForms = forms.filter((form) => formToken(form));
  const callbackForm = tokenForms.find((form) => {
    const action = form.action.href.toLowerCase();
    return action.includes("authcallback");
  }) || tokenForms[0];

  const token = callbackForm ? formToken(callbackForm) : extractInputValue(html, ["token", "tenantToken"]);
  if (!token) return null;
  const action = callbackForm?.action.href.toLowerCase().includes("authcallback")
    ? callbackForm.action
    : callbackUrl;
  const fields = callbackForm ? { ...callbackForm.fields } : { token, returnUrl: "" };
  setField(fields, "token", token, { addIfMissing: true });
  setField(fields, "returnUrl", "", { addIfMissing: true });

  const response = await postForm(fetchImpl, jar, action, fields, {
    xhr: false,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: new URL(pageUrl).origin,
      referer: referer.href || String(referer)
    }
  });
  const finalResponse = await followRedirects(fetchImpl, jar, response, action, referer.href || String(referer));
  if (!hasTenantAuthCookie(jar, host)) return null;

  return tenantAuthCookieResult({
    jar,
    region,
    tenant,
    host
  });
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json") || /^[\[{]/.test(text.trim())) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function requireTenantAuthCookie({
  jar,
  region,
  tenant,
  host,
  finalResponse,
  finalUrl,
  flow
}) {
  if (!hasTenantAuthCookie(jar, host)) {
    const responseText = await finalResponse.text().catch(() => "");
    const pageMessage = extractPageMessage(responseText);
    const cookieNames = jar.toJSON().map((cookie) => cookie.name).join(", ") || "none";
    throw new Error(
      `HammerTech UI ${flow} login did not return a tenant auth cookie for ${host}. ` +
      `Final status: ${finalResponse.status}. Final URL: ${finalUrl}. Cookies seen: ${cookieNames}.` +
      `${pageMessage ? ` Page message: ${pageMessage}.` : ""} ` +
      "The account may require a different tenant branch or the login flow may have changed."
    );
  }

  return tenantAuthCookieResult({
    jar,
    region,
    tenant,
    host
  });
}

function hasTenantAuthCookie(jar, host) {
  return jar.headerFor(`https://${host}/`).toUpperCase().includes("HAMMERTECHAUTH");
}

function tenantAuthCookieResult({
  jar,
  region,
  tenant,
  host
}) {
  const tenantUrl = `https://${host}/`;
  return {
    region,
    tenant,
    tenantHost: host,
    cookieJar: jar,
    cookieNames: cookieNamesFor(jar, tenantUrl)
  };
}

export function parseHtmlForm(html, pageUrl, { fieldNames = [], actionIncludes = "" } = {}) {
  const forms = parseHtmlForms(html, pageUrl);

  if (!forms.length) return formFromHtml(String(html || ""), pageUrl);

  const normalizedFieldNames = fieldNames.map((fieldName) => fieldName.toLowerCase());
  const selected = forms.find((form) => {
    const fieldSet = new Set(Object.keys(form.fields).map((name) => name.toLowerCase()));
    const matchesFields = normalizedFieldNames.every((fieldName) => fieldSet.has(fieldName));
    const matchesAction = !actionIncludes || form.action.href.toLowerCase().includes(actionIncludes.toLowerCase());
    return matchesFields && matchesAction;
  });

  return selected || forms[0];
}

function parseHtmlForms(html, pageUrl) {
  return [...String(html || "").matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)]
    .map((match) => formFromHtml(match[0], pageUrl));
}

function formToken(form) {
  const tokenKey = Object.keys(form?.fields || {}).find((name) => name.toLowerCase() === "token");
  const token = tokenKey ? String(form.fields[tokenKey] || "").trim() : "";
  return token || "";
}

function formFromHtml(formHtml, pageUrl) {
  const action = attr(formHtml, "action");
  const method = (attr(formHtml, "method") || "POST").toUpperCase();
  const fields = {};

  for (const inputMatch of formHtml.matchAll(/<input\b[^>]*>/gi)) {
    const input = inputMatch[0];
    const name = attr(input, "name");
    if (!name) continue;
    const type = (attr(input, "type") || "text").toLowerCase();
    if (hasAttr(input, "disabled")) continue;
    if (["button", "submit", "reset", "file"].includes(type)) continue;
    fields[name] = htmlDecode(attr(input, "value") || "");
  }

  const submitter = firstSubmitter(formHtml);
  if (submitter.name && fields[submitter.name] === undefined) {
    fields[submitter.name] = submitter.value;
  }

  return {
    action: action ? new URL(htmlDecode(action), pageUrl) : new URL(pageUrl),
    method,
    fields
  };
}

function extractInputValue(html, names) {
  const normalized = names.map((name) => name.toLowerCase());
  for (const inputMatch of String(html || "").matchAll(/<input\b[^>]*>/gi)) {
    const input = inputMatch[0];
    const name = attr(input, "name") || attr(input, "id");
    if (!normalized.includes(name.toLowerCase())) continue;
    const value = htmlDecode(attr(input, "value") || "").trim();
    if (value) return value;
  }
  return "";
}

function authRootPageUrl({
  regionConfig,
  tenant,
  email,
  html,
  fallbackUrl
}) {
  const url = new URL("/", regionConfig.authBaseUrl);
  const returnUrl = extractInputValue(html, ["returnUrl", "hdnReturnUrl"]);
  url.searchParams.set("returnUrl", returnUrl || "");
  url.searchParams.set("tenant", extractInputValue(html, ["tenant", "hdnTenant"]) || tenant);
  if (email) url.searchParams.set("email", email);

  const fallback = safeUrl(fallbackUrl);
  if (fallback?.pathname === "/" && fallback.origin === url.origin) {
    for (const key of ["returnUrl", "tenant", "email"]) {
      if (fallback.searchParams.has(key)) {
        url.searchParams.set(key, fallback.searchParams.get(key) || "");
      }
    }
  }

  return url.href;
}

function describeAuthPage(html, pageUrl, jar) {
  const parts = [];
  const title = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  if (title) parts.push(`title="${htmlDecode(title)}"`);

  const forms = parseHtmlForms(html, pageUrl).slice(0, 4).map((form) => {
    const fieldNames = Object.keys(form.fields)
      .map((name) => sanitizeFieldName(name))
      .slice(0, 8)
      .join(",");
    return `${form.method} ${sanitizeAction(form.action)} fields=[${fieldNames}]`;
  });
  if (forms.length) parts.push(`forms=${forms.join(" | ")}`);

  const markers = [];
  if (/frmLoginSuccess/i.test(html)) markers.push("frmLoginSuccess");
  if (/tenantToken/i.test(html)) markers.push("tenantToken");
  if (/setJwtToken|HT-AuthToken|localStorage/i.test(html)) markers.push("authTokenScript");
  if (/validation-summary-errors|text-danger/i.test(html)) markers.push("validation");
  if (markers.length) parts.push(`markers=${markers.join(",")}`);

  const cookieNames = jar.toJSON().map((cookie) => cookie.name).join(",");
  if (cookieNames) parts.push(`cookies=${cookieNames}`);

  return parts.join("; ");
}

function sanitizeFieldName(name) {
  if (/password/i.test(name)) return "password";
  if (/token/i.test(name)) return name.startsWith("__") ? "__RequestVerificationToken" : "token";
  return name;
}

function sanitizeAction(action) {
  const url = action instanceof URL ? new URL(action.href) : new URL(String(action));
  const keys = [...url.searchParams.keys()];
  url.search = "";
  return `${url.origin}${url.pathname}${keys.length ? `?${keys.join("&")}` : ""}`;
}

export function extractAuthAppToken(html, finalUrl = "", { email } = {}) {
  const source = htmlDecode(String(html || ""));
  const mayContainAuthJwt = /HT-AuthToken|setJwtToken|localStorage|authJwt|VerifyToken|GenerateTenantToken/i.test(source);
  const expectedEmail = String(email || "").trim().toLowerCase();
  const candidates = [
    ...matchTokens(source, /setJwtToken\(\s*(["'`])([^"'`]+)\1\s*\)/gi, 2),
    ...matchTokens(source, /localStorage\.setItem\(\s*(["'`])HT-AuthToken\1\s*,\s*(["'`])([^"'`]+)\2\s*\)/gi, 3),
    ...matchTokens(source, /localStorage\[\s*(["'`])HT-AuthToken\1\s*\]\s*=\s*(["'`])([^"'`]+)\2/gi, 3),
    ...matchTokens(source, /localStorage\.HT-AuthToken\s*=\s*(["'`])([^"'`]+)\1/gi, 2),
    ...matchTokens(source, /\bHT-AuthToken\b[^=:{]{0,80}[:=]\s*(["'`])([^"'`]+)\1/gi, 2),
    ...matchTokens(source, /\bAuthToken\b[^=:{]{0,80}[:=]\s*(["'`])([^"'`]+)\1/gi, 2),
    ...(mayContainAuthJwt ? jwtCandidates(source).filter((candidate) => jwtMatchesEmail(candidate, expectedEmail)) : [])
  ];

  for (const candidate of candidates) {
    const token = normalizeTokenCandidate(candidate);
    if (isLikelyJwt(token)) return token;
  }

  const url = safeUrl(finalUrl);
  if (url) {
    for (const key of ["authToken", "AuthToken", "HT-AuthToken"]) {
      const token = normalizeTokenCandidate(url.searchParams.get(key));
      if (isLikelyJwt(token)) return token;
    }
  }

  return "";
}

function firstSubmitter(formHtml) {
  const buttonTags = [
    ...String(formHtml || "").matchAll(/<button\b[^>]*>/gi),
    ...String(formHtml || "").matchAll(/<input\b[^>]*>/gi)
  ].map((match) => match[0]);

  for (const tag of buttonTags) {
    if (hasAttr(tag, "disabled")) continue;
    const type = (attr(tag, "type") || "submit").toLowerCase();
    if (type !== "submit") continue;
    const name = attr(tag, "name");
    if (!name) continue;
    return {
      name,
      value: htmlDecode(attr(tag, "value") || "")
    };
  }

  return {};
}

function attr(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(tag || "").match(pattern);
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : "";
}

function hasAttr(tag, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|>|/)`, "i");
  return pattern.test(String(tag || ""));
}

function htmlDecode(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function matchTokens(source, pattern, groupIndex) {
  return [...String(source || "").matchAll(pattern)]
    .map((match) => match[groupIndex])
    .filter(Boolean);
}

function normalizeTokenCandidate(value) {
  if (!value) return "";
  const unescaped = String(value)
    .replace(/\\u002e/gi, ".")
    .replace(/\\x2e/gi, ".")
    .replace(/%2e/gi, ".")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'");
  try {
    return decodeURIComponent(unescaped.trim());
  } catch {
    return unescaped.trim();
  }
}

function isLikelyJwt(value) {
  return /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*)?$/.test(String(value || ""));
}

function jwtCandidates(source) {
  return [...String(source || "").matchAll(/\beyJ[A-Za-z0-9_-]{10,}(?:\.|%2E|\\u002e|\\x2e)[A-Za-z0-9_-]{10,}(?:(?:\.|%2E|\\u002e|\\x2e)[A-Za-z0-9_-]*)?/gi)]
    .map((match) => match[0]);
}

function jwtMatchesEmail(candidate, expectedEmail) {
  if (!expectedEmail) return true;
  const payload = decodeJwtPayload(candidate);
  if (!payload) return false;
  return JSON.stringify(payload).toLowerCase().includes(expectedEmail);
}

function decodeJwtPayload(candidate) {
  const token = normalizeTokenCandidate(candidate);
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function describeJwt(candidate) {
  const token = normalizeTokenCandidate(candidate);
  const payload = decodeJwtPayload(token);
  if (!payload) return `length=${token.length}, payload=unreadable`;
  const keys = Object.keys(payload).slice(0, 12).join(",") || "none";
  const issuer = payload.iss ? ", hasIssuer=true" : "";
  const audience = payload.aud ? ", hasAudience=true" : "";
  return `length=${token.length}, payloadKeys=${keys}${issuer}${audience}`;
}

function safeUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function setField(fields, preferredName, value, { addIfMissing = true } = {}) {
  const match = Object.keys(fields).find((key) => key.toLowerCase() === preferredName.toLowerCase());
  if (match || addIfMissing) fields[match || preferredName] = value;
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function tenantName(tenant) {
  const host = tenantHost(tenant);
  return host.replace(/\.hammertechonline\.com$/i, "");
}

function cookieNamesFor(jar, url) {
  const header = jar.headerFor(url);
  return header.split(";")
    .map((pair) => pair.trim().split("=")[0])
    .filter(Boolean);
}

function extractPageMessage(html) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const likely = text.match(/(?:invalid|incorrect|locked|required|error|unauthorized|multi-factor|mfa|sso)[^.]{0,180}/i);
  return likely ? likely[0].trim() : "";
}
