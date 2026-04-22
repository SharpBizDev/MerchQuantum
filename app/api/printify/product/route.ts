import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildSanitizedErrorPayload, getUserFacingErrorMessage, logErrorToConsole } from "../../../../lib/user-facing-errors";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 45000;
const FRONT_POSITION_PATTERNS = [/front/i, /chest/i, /center/i, /default/i];

type PlacementGuide = {
  position: string;
  width: number;
  height: number;
  source: "live" | "fallback";
  decorationMethod?: string;
};

const DEFAULT_PLACEMENT_GUIDE: PlacementGuide = {
  position: "front",
  width: 3153,
  height: 3995,
  source: "fallback",
};

type TemplateProduct = {
  id: string;
  title: string;
  description?: string;
  blueprint_id: number;
  print_provider_id: number;
  variants?: Array<{
    id: number;
    is_enabled?: boolean;
    is_default?: boolean;
  }>;
  print_areas?: Array<{
    variant_ids?: number[];
    placeholders?: Array<{
      position?: string;
      images?: Array<{
        x?: number;
        y?: number;
        scale?: number;
        angle?: number;
      }>;
    }>;
  }>;
};

type CatalogVariant = {
  id: number;
  placeholders?: Array<{
    position?: string;
    decoration_method?: string;
    width?: number;
    height?: number;
  }>;
};

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    const errorValue = payload?.error || payload?.message;
    if (typeof errorValue === "string" && errorValue.trim()) {
      return errorValue.trim();
    }
  }

  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

function chooseFrontPosition(template: TemplateProduct) {
  for (const area of template.print_areas || []) {
    for (const placeholder of area.placeholders || []) {
      const position = String(placeholder.position || "").trim();
      if (FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(position))) {
        return position;
      }
    }
  }

  return DEFAULT_PLACEMENT_GUIDE.position;
}

function chooseVariantId(template: TemplateProduct) {
  const enabled = (template.variants || []).filter((variant) => variant.is_enabled !== false);
  return enabled.find((variant) => variant.is_default)?.id || enabled[0]?.id || template.variants?.[0]?.id;
}

function resolvePlacementGuideFromCatalog(
  template: TemplateProduct,
  catalogVariants: CatalogVariant[]
) {
  const preferredPosition = chooseFrontPosition(template);
  const preferredVariantId = chooseVariantId(template);

  const variantCandidates = [
    catalogVariants.find((variant) => variant.id === preferredVariantId),
    ...catalogVariants,
  ].filter(Boolean) as CatalogVariant[];

  for (const variant of variantCandidates) {
    const matching = (variant.placeholders || []).find((placeholder) => {
      const position = String(placeholder.position || "").trim();
      return position && FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(position));
    });

    if (matching?.width && matching?.height) {
      return {
        position: matching.position || preferredPosition,
        width: matching.width,
        height: matching.height,
        decorationMethod: matching.decoration_method,
        source: "live" as const,
      };
    }
  }

  return DEFAULT_PLACEMENT_GUIDE;
}

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get("shopId")?.trim();
    const productId = req.nextUrl.searchParams.get("productId")?.trim();

    if (!shopId || !productId) {
      return NextResponse.json({ error: "Missing shopId or productId." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("printify_token")?.value?.trim();

    if (!token) {
      return NextResponse.json({ error: getUserFacingErrorMessage("connection") }, { status: 401 });
    }

    const response = await fetchWithTimeout(
      `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}.json`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      logErrorToConsole("[api/printify/product] upstream template load failed", { status: response.status });
      return NextResponse.json({ error: getUserFacingErrorMessage("providerLoad") }, { status: response.status });
    }

    const product = (await response.json()) as TemplateProduct;
    let placementGuide: PlacementGuide = DEFAULT_PLACEMENT_GUIDE;

    if (product.blueprint_id && product.print_provider_id) {
      const catalogResponse = await fetchWithTimeout(
        `${PRINTIFY_API_BASE}/catalog/blueprints/${encodeURIComponent(String(product.blueprint_id))}/print_providers/${encodeURIComponent(String(product.print_provider_id))}/variants.json`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (catalogResponse.ok) {
        const catalogVariants = (await catalogResponse.json()) as CatalogVariant[];
        placementGuide = resolvePlacementGuideFromCatalog(product, Array.isArray(catalogVariants) ? catalogVariants : []);
      }
    }

    return NextResponse.json({ product, placementGuide });
  } catch (error) {
    logErrorToConsole("[api/printify/product] template load failed", error);
    const payload = buildSanitizedErrorPayload("providerLoad", error);
    return NextResponse.json({ error: payload.message }, { status: payload.status });
  }
}
