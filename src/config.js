export const REGIONS = {
  us: {
    name: "North America",
    authBaseUrl: "https://us-auth.hammertechonline.com",
    apiBaseUrl: "https://us-api.hammertechonline.com"
  },
  au: {
    name: "Asia/Australia/NZ",
    authBaseUrl: "https://au-auth.hammertechonline.com",
    apiBaseUrl: "https://au-api.hammertechonline.com"
  },
  eu: {
    name: "Europe/UK",
    authBaseUrl: "https://eu-auth.hammertechonline.com",
    apiBaseUrl: "https://eu-api.hammertechonline.com"
  }
};

export function normalizeRegion(region) {
  const value = String(region || "").trim().toLowerCase();
  if (!value) {
    throw new Error("Missing region. Use --region us|au|eu or HAMMERTECH_REGION.");
  }

  if (value === "na" || value === "northamerica" || value === "north-america") return "us";
  if (value === "australia" || value === "oceania" || value === "asia") return "au";
  if (value === "uk" || value === "gb" || value === "europe") return "eu";

  if (!REGIONS[value]) {
    throw new Error(`Unsupported region "${region}". Expected one of: ${Object.keys(REGIONS).join(", ")}.`);
  }
  return value;
}

export function getRegionConfig(region) {
  return REGIONS[normalizeRegion(region)];
}

export function resolveAuthOptions(flags = {}, env = process.env) {
  return {
    region: flags.region ?? env.HAMMERTECH_REGION,
    tenant: flags.tenant ?? env.HAMMERTECH_TENANT,
    email: flags.email ?? env.HAMMERTECH_EMAIL,
    password: flags.password ?? env.HAMMERTECH_PASSWORD,
    token: flags.token ?? env.HAMMERTECH_BEARER_TOKEN,
    sessionPath: flags.session ?? env.HAMMERTECH_SESSION_PATH ?? ".hammertech/session.json"
  };
}

