import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 90000;
const FRONT_POSITION_PATTERNS = [/front/i, /chest/i, /center/i, /default/i];

const DEFAULT_PLACEMENT_GUIDE = {
  position: "front",
  width: 3153,
  height: 3995,
};
const FIXED_TOP_GAP_PCT = 10;
const FIXED_FILL_PCT = 90;

type ArtworkBounds = {
  canvasWidth?: number;
  canvasHeight?: number;
  visibleLeft?: number;
  visibleTop?: number;
  visibleWidth?: number;
  visibleHeight?: number;
};

type IncomingItem = {
  fileName: string;
  title: string;
  description: string;
  tags: string[];
  imageDataUrl: string;
  artworkBounds?: ArtworkBounds;
};

type TemplateProduct = {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: Array<{
    id: number;
    price: number;
    is_enabled?: boolean;
    is_default?: boolean;
  }>;
  print_areas: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images: Array<{
        x?: number;
        y?: number;
        scale?: number;
        angle?: number;
        pattern?: Record<string, unknown>;
      }>;
    }>;
    background?: string;
  }>;
  print_details?: Record<string, unknown>;
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

type ImageDimensions = {
  width: number;
  height: number;
  mime: string;
};

type PlacementGuide = {
  position: string;
  width: number;
  height: number;
  decorationMethod?: string;
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

function extractDataUrlParts(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mime: match[1].toLowerCase(),
    contents: match[2],
  };
}

function extractBase64(dataUrl: string) {
  const parts = extractDataUrlParts(dataUrl);
  return parts ? parts.contents : "";
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24) return null;
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) return null;

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readGifDimensions(buffer: Buffer) {
  if (buffer.length < 10) return null;
  const header = buffer.subarray(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") return null;

  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 1 >= buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);

    if (isStartOfFrame) {
      if (offset + 7 >= buffer.length) break;
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += length;
  }

  return null;
}

function readSvgDimensions(svgText: string) {
  const widthMatch = svgText.match(/\bwidth=["']([0-9.]+)(px)?["']/i);
  const heightMatch = svgText.match(/\bheight=["']([0-9.]+)(px)?["']/i);

  if (widthMatch && heightMatch) {
    return {
      width: Number(widthMatch[1]),
      height: Number(heightMatch[1]),
    };
  }

  const viewBoxMatch = svgText.match(/\bviewBox=["']\s*([0-9.+-]+)[ ,]+([0-9.+-]+)[ ,]+([0-9.+-]+)[ ,]+([0-9.+-]+)\s*["']/i);
  if (viewBoxMatch) {
    return {
      width: Number(viewBoxMatch[3]),
      height: Number(viewBoxMatch[4]),
    };
  }

  return null;
}

function getImageDimensionsFromDataUrl(dataUrl: string): ImageDimensions | null {
  const parts = extractDataUrlParts(dataUrl);
  if (!parts) return null;

  try {
    const buffer = Buffer.from(parts.contents, "base64");
    let size: { width: number; height: number } | null = null;

    if (parts.mime === "image/png") {
      size = readPngDimensions(buffer);
    } else if (parts.mime === "image/jpeg" || parts.mime === "image/jpg") {
      size = readJpegDimensions(buffer);
    } else if (parts.mime === "image/gif") {
      size = readGifDimensions(buffer);
    } else if (parts.mime === "image/svg+xml") {
      size = readSvgDimensions(buffer.toString("utf8"));
    }

    if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
      return null;
    }

    return {
      width: size.width,
      height: size.height,
      mime: parts.mime,
    };
  } catch {
    return null;
  }
}

async function parseJsonOrText(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = await parseJsonOrText(response);
  if (typeof payload === "string") {
    return payload.trim() || fallback;
  }

  if (payload && typeof payload === "object") {
    const errorValue =
      "error" in payload
        ? payload.error
        : "message" in payload
          ? payload.message
          : "errors" in payload
            ? JSON.stringify(payload.errors)
            : "";

    if (typeof errorValue === "string" && errorValue.trim()) {
      return errorValue.trim();
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number) {
  return Number(value.toFixed(4));
}

function chooseFrontPlacement(template: TemplateProduct) {
  let fallback: {
    areaIndex: number;
    placeholderIndex: number;
    position: string;
    imageDefaults?: TemplateProduct["print_areas"][number]["placeholders"][number]["images"][number];
  } | null = null;

  for (let areaIndex = 0; areaIndex < (template.print_areas || []).length; areaIndex += 1) {
    const area = template.print_areas[areaIndex];
    for (let placeholderIndex = 0; placeholderIndex < (area.placeholders || []).length; placeholderIndex += 1) {
      const placeholder = area.placeholders[placeholderIndex];
      const imageDefaults = Array.isArray(placeholder.images) && placeholder.images.length ? placeholder.images[0] : undefined;
      const position = String(placeholder.position || "").trim() || DEFAULT_PLACEMENT_GUIDE.position;

      if (!fallback) {
        fallback = { areaIndex, placeholderIndex, position, imageDefaults };
      }

      if (FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(position))) {
        return { areaIndex, placeholderIndex, position, imageDefaults };
      }
    }
  }

  return fallback;
}

function chooseVariantId(template: TemplateProduct) {
  const enabled = (template.variants || []).filter((variant) => variant.is_enabled !== false);
  return enabled.find((variant) => variant.is_default)?.id || enabled[0]?.id || template.variants?.[0]?.id;
}

async function resolvePlacementGuide(
  template: TemplateProduct,
  token: string,
  preferredPosition: string
): Promise<PlacementGuide> {
  if (!template.blueprint_id || !template.print_provider_id) {
    return { ...DEFAULT_PLACEMENT_GUIDE };
  }

  try {
    const response = await fetchWithTimeout(
      `${PRINTIFY_API_BASE}/catalog/blueprints/${encodeURIComponent(String(template.blueprint_id))}/print_providers/${encodeURIComponent(String(template.print_provider_id))}/variants.json`,
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
      return { ...DEFAULT_PLACEMENT_GUIDE, position: preferredPosition || DEFAULT_PLACEMENT_GUIDE.position };
    }

    const variants = (await response.json()) as CatalogVariant[];
    const preferredVariantId = chooseVariantId(template);
    const orderedVariants = [
      variants.find((variant) => variant.id === preferredVariantId),
      ...variants,
    ].filter(Boolean) as CatalogVariant[];

    for (const variant of orderedVariants) {
      const exact = (variant.placeholders || []).find((placeholder) => String(placeholder.position || "").trim() === preferredPosition);
      const generic = exact || (variant.placeholders || []).find((placeholder) => {
        const position = String(placeholder.position || "").trim();
        return FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(position));
      });

      if (generic?.width && generic?.height) {
        return {
          position: generic.position || preferredPosition,
          width: generic.width,
          height: generic.height,
          decorationMethod: generic.decoration_method,
        };
      }
    }
  } catch {
    // Fall through to default guide.
  }

  return { ...DEFAULT_PLACEMENT_GUIDE, position: preferredPosition || DEFAULT_PLACEMENT_GUIDE.position };
}

function normalizeArtworkBounds(dimensions: ImageDimensions | null, bounds?: ArtworkBounds) {
  const canvasWidth = Number.isFinite(bounds?.canvasWidth) && (bounds?.canvasWidth || 0) > 0
    ? Number(bounds!.canvasWidth)
    : dimensions?.width || DEFAULT_PLACEMENT_GUIDE.width;
  const canvasHeight = Number.isFinite(bounds?.canvasHeight) && (bounds?.canvasHeight || 0) > 0
    ? Number(bounds!.canvasHeight)
    : dimensions?.height || DEFAULT_PLACEMENT_GUIDE.height;

  const visibleLeft = Number.isFinite(bounds?.visibleLeft) ? clamp(Number(bounds!.visibleLeft), 0, canvasWidth) : 0;
  const visibleTop = Number.isFinite(bounds?.visibleTop) ? clamp(Number(bounds!.visibleTop), 0, canvasHeight) : 0;
  const visibleWidth = Number.isFinite(bounds?.visibleWidth) && (bounds?.visibleWidth || 0) > 0
    ? clamp(Number(bounds!.visibleWidth), 1, canvasWidth - visibleLeft)
    : canvasWidth;
  const visibleHeight = Number.isFinite(bounds?.visibleHeight) && (bounds?.visibleHeight || 0) > 0
    ? clamp(Number(bounds!.visibleHeight), 1, canvasHeight - visibleTop)
    : canvasHeight;

  return {
    canvasWidth,
    canvasHeight,
    visibleLeft,
    visibleTop,
    visibleWidth,
    visibleHeight,
  };
}

function getContentAwarePlacement(
  imageDataUrl: string,
  guide: PlacementGuide,
  templateDefaults?: TemplateProduct["print_areas"][number]["placeholders"][number]["images"][number],
  artworkBounds?: ArtworkBounds
) {
  const dimensions = getImageDimensionsFromDataUrl(imageDataUrl);
  const bounds = normalizeArtworkBounds(dimensions, artworkBounds);

  const placeholderWidth = Math.max(1, guide.width || DEFAULT_PLACEMENT_GUIDE.width);
  const placeholderHeight = Math.max(1, guide.height || DEFAULT_PLACEMENT_GUIDE.height);
  const sideInsetPct = 0.06;
  const bottomInsetPct = 0.08;
  const topInsetPct = clamp(FIXED_TOP_GAP_PCT / 100, 0.1, 0.18);
  const fillPct = clamp(FIXED_FILL_PCT / 100, 0.75, 0.9);

  const safeLeft = placeholderWidth * sideInsetPct;
  const safeTop = placeholderHeight * topInsetPct;
  const safeWidth = placeholderWidth * (1 - sideInsetPct * 2);
  const safeHeight = placeholderHeight * (1 - topInsetPct - bottomInsetPct);

  const scaleFactor = Math.min(
    safeWidth / bounds.visibleWidth,
    safeHeight / bounds.visibleHeight
  ) * fillPct;

  const renderedWidth = bounds.canvasWidth * scaleFactor;
  const renderedHeight = bounds.canvasHeight * scaleFactor;
  const visibleRenderedWidth = bounds.visibleWidth * scaleFactor;

  const left = safeLeft + (safeWidth - visibleRenderedWidth) / 2 - bounds.visibleLeft * scaleFactor;
  const top = safeTop - bounds.visibleTop * scaleFactor;

  const x = (left + renderedWidth / 2) / placeholderWidth;
  const y = (top + renderedHeight / 2) / placeholderHeight;
  const scale = renderedWidth / placeholderWidth;

  return {
    x: round4(x),
    y: round4(y),
    scale: round4(scale),
    angle: typeof templateDefaults?.angle === "number" ? templateDefaults.angle : 0,
    ...(templateDefaults?.pattern ? { pattern: templateDefaults.pattern } : {}),
  };
}

function buildFrontOnlyPrintAreas(
  template: TemplateProduct,
  uploadId: string,
  item: IncomingItem,
  guide: PlacementGuide
) {
  const target = chooseFrontPlacement(template);
  if (!target) return [];

  const placement = getContentAwarePlacement(
    item.imageDataUrl,
    guide,
    target.imageDefaults,
    item.artworkBounds
  );

  return (template.print_areas || [])
    .map((area, areaIndex) => {
      const placeholders = (area.placeholders || [])
        .map((placeholder, placeholderIndex) => {
          if (areaIndex !== target.areaIndex || placeholderIndex !== target.placeholderIndex) {
            return null;
          }

          return {
            position: placeholder.position,
            images: [
              {
                id: uploadId,
                x: placement.x,
                y: placement.y,
                scale: placement.scale,
                angle: placement.angle,
                ...(placement.pattern ? { pattern: placement.pattern } : {}),
              },
            ],
          };
        })
        .filter(Boolean);

      if (!placeholders.length) return null;

      return {
        variant_ids: area.variant_ids,
        ...(area.background ? { background: area.background } : {}),
        placeholders,
      };
    })
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shopId = String(body?.shopId || "").trim();
    const templateProductId = String(body?.templateProductId || "").trim();
    const items = Array.isArray(body?.items)
      ? (body.items as IncomingItem[])
      : body?.item
        ? [body.item as IncomingItem]
        : [];

    if (!shopId || !templateProductId || !items.length) {
      return NextResponse.json({ error: "Missing shopId, templateProductId, or item payload." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("printify_token")?.value?.trim();

    if (!token) {
      return NextResponse.json({ error: "No Printify token found. Connect again." }, { status: 401 });
    }

    const templateResponse = await fetchWithTimeout(
      `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(templateProductId)}.json`,
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

    if (!templateResponse.ok) {
      const text = await readErrorMessage(
        templateResponse,
        `Template request failed with status ${templateResponse.status}.`
      );
      return NextResponse.json({ error: text }, { status: templateResponse.status });
    }

    const template = (await templateResponse.json()) as TemplateProduct;

    const enabledVariants = (template.variants || [])
      .filter((variant) => variant.is_enabled !== false)
      .map((variant) => ({
        id: variant.id,
        price: variant.price,
        is_enabled: true,
        is_default: !!variant.is_default,
      }));

    if (!enabledVariants.length) {
      return NextResponse.json({ error: "Template has no enabled variants." }, { status: 400 });
    }

    const frontTarget = chooseFrontPlacement(template);
    if (!frontTarget) {
      return NextResponse.json({ error: "Unable to determine a front print area from the selected template." }, { status: 400 });
    }

    const placementGuide = await resolvePlacementGuide(template, token, frontTarget.position);
    const results: Array<{ fileName: string; title: string; productId?: string; message: string }> = [];

    for (const item of items) {
      try {
        const contents = extractBase64(item.imageDataUrl);
        if (!contents) {
          throw new Error("Image data is missing or not base64.");
        }

        const uploadResponse = await fetchWithTimeout(`${PRINTIFY_API_BASE}/uploads/images.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_name: item.fileName,
            contents,
          }),
        });

        if (!uploadResponse.ok) {
          const text = await readErrorMessage(uploadResponse, `Upload failed with status ${uploadResponse.status}.`);
          throw new Error(text);
        }

        const uploaded = await uploadResponse.json();
        const printAreas = buildFrontOnlyPrintAreas(template, uploaded.id, item, placementGuide);

        if (!printAreas.length) {
          throw new Error("Unable to determine a front print area from the selected template.");
        }

        const createPayload = {
          title: item.title,
          description: item.description,
          blueprint_id: template.blueprint_id,
          print_provider_id: template.print_provider_id,
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 13) : [],
          variants: enabledVariants,
          print_areas: printAreas,
          ...(template.print_details ? { print_details: template.print_details } : {}),
        };

        const createResponse = await fetchWithTimeout(
          `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(shopId)}/products.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": USER_AGENT,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(createPayload),
          }
        );

        if (!createResponse.ok) {
          const text = await readErrorMessage(createResponse, `Create failed with status ${createResponse.status}.`);
          throw new Error(text);
        }

        const created = await createResponse.json();

        results.push({
          fileName: item.fileName,
          title: item.title,
          productId: created.id,
          message: `Created draft product with guided ${placementGuide.position || "front"} placement.`,
        });
      } catch (error) {
        results.push({
          fileName: item.fileName,
          title: item.title,
          message: error instanceof Error ? error.message : "Batch item failed.",
        });
      }
    }

    const createdCount = results.filter((result) => !!result.productId).length;

    return NextResponse.json({
      message: `Processed ${results.length} item(s). Saved ${createdCount} draft product${createdCount === 1 ? "" : "s"}.`,
      results,
      placementGuide,
    });
  } catch (error) {
    const status = error instanceof DOMException && error.name === "AbortError" ? 504 : 500;
    return NextResponse.json(
      {
        error:
          status === 504
            ? "Printify took too long to respond during draft creation. Please try again."
            : error instanceof Error
              ? error.message
              : "Unable to run batch create.",
      },
      { status }
    );
  }
}
