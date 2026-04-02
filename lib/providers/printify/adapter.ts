import type { ProviderAdapter, ProviderAdapterContext } from "../contracts";
import { ProviderError, providerErrorFromResponse, toProviderError } from "../errors";
import type {
  ArtworkBounds,
  DraftProductInput,
  DraftProductResult,
  NormalizedArtworkUpload,
  NormalizedPlacementGuide,
  NormalizedStore,
  NormalizedTemplateDetail,
  NormalizedTemplateSummary,
  ProviderCapabilities,
} from "../types";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";
const PROVIDER_TIMEOUT_MS = 90000;
const FRONT_POSITION_PATTERNS = [/front/i, /chest/i, /center/i, /default/i];
const FIXED_TOP_GAP_PCT = 10;
const FIXED_FILL_PCT = 90;

const DEFAULT_PLACEMENT_GUIDE: NormalizedPlacementGuide = {
  position: "front",
  width: 3153,
  height: 3995,
  source: "fallback",
};

type PrintifyShop = {
  id: number | string;
  title: string;
  sales_channel?: string;
};

type PrintifyProduct = {
  id: string;
  title: string;
  description?: string;
  shop_id?: number | string;
  blueprint_id?: number;
  print_provider_id?: number;
  variants?: Array<{
    id: number;
    price?: number;
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

type PrintifyAdapterOptions = {
  fetch?: typeof fetch;
  apiBase?: string;
  timeoutMs?: number;
  userAgent?: string;
};

export const PRINTIFY_CAPABILITIES: ProviderCapabilities = {
  supportsStores: true,
  supportsTemplates: true,
  supportsProductDrafts: true,
  supportsMockups: false,
  supportsWebhooks: false,
  supportsOrderOnly: false,
  supportsPublishStep: false,
  supportsMultiplePlacements: false,
};

function extractDataUrlParts(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number) {
  return Number(value.toFixed(4));
}

function chooseFrontPosition(product: PrintifyProduct) {
  for (const area of product.print_areas || []) {
    for (const placeholder of area.placeholders || []) {
      const position = String(placeholder.position || "").trim();
      if (FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(position))) {
        return position;
      }
    }
  }

  return DEFAULT_PLACEMENT_GUIDE.position;
}

function chooseFrontPlacement(product: PrintifyProduct) {
  let fallback: {
    areaIndex: number;
    placeholderIndex: number;
    position: string;
    imageDefaults?: NonNullable<PrintifyProduct["print_areas"]>[number]["placeholders"][number]["images"][number];
  } | null = null;

  for (let areaIndex = 0; areaIndex < (product.print_areas || []).length; areaIndex += 1) {
    const area = product.print_areas?.[areaIndex];
    for (let placeholderIndex = 0; placeholderIndex < (area?.placeholders || []).length; placeholderIndex += 1) {
      const placeholder = area?.placeholders?.[placeholderIndex];
      const imageDefaults = Array.isArray(placeholder?.images) && placeholder.images.length ? placeholder.images[0] : undefined;
      const position = String(placeholder?.position || "").trim() || DEFAULT_PLACEMENT_GUIDE.position;

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

function chooseVariantId(product: PrintifyProduct) {
  const enabled = (product.variants || []).filter((variant) => variant.is_enabled !== false);
  return enabled.find((variant) => variant.is_default)?.id || enabled[0]?.id || product.variants?.[0]?.id;
}

function normalizeArtworkBounds(dimensions: ImageDimensions | null, bounds?: ArtworkBounds) {
  const canvasWidth =
    Number.isFinite(bounds?.canvasWidth) && (bounds?.canvasWidth || 0) > 0
      ? Number(bounds?.canvasWidth)
      : dimensions?.width || DEFAULT_PLACEMENT_GUIDE.width;
  const canvasHeight =
    Number.isFinite(bounds?.canvasHeight) && (bounds?.canvasHeight || 0) > 0
      ? Number(bounds?.canvasHeight)
      : dimensions?.height || DEFAULT_PLACEMENT_GUIDE.height;

  const visibleLeft = Number.isFinite(bounds?.visibleLeft) ? clamp(Number(bounds?.visibleLeft), 0, canvasWidth) : 0;
  const visibleTop = Number.isFinite(bounds?.visibleTop) ? clamp(Number(bounds?.visibleTop), 0, canvasHeight) : 0;
  const visibleWidth =
    Number.isFinite(bounds?.visibleWidth) && (bounds?.visibleWidth || 0) > 0
      ? clamp(Number(bounds?.visibleWidth), 1, canvasWidth - visibleLeft)
      : canvasWidth;
  const visibleHeight =
    Number.isFinite(bounds?.visibleHeight) && (bounds?.visibleHeight || 0) > 0
      ? clamp(Number(bounds?.visibleHeight), 1, canvasHeight - visibleTop)
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
  guide: NormalizedPlacementGuide,
  templateDefaults?: NonNullable<PrintifyProduct["print_areas"]>[number]["placeholders"][number]["images"][number],
  artworkBounds?: ArtworkBounds
) {
  const dimensions = getImageDimensionsFromDataUrl(imageDataUrl);
  const bounds = normalizeArtworkBounds(dimensions, artworkBounds);
  const placeholderWidth = Math.max(1, guide.width || DEFAULT_PLACEMENT_GUIDE.width);
  const placeholderHeight = Math.max(1, guide.height || DEFAULT_PLACEMENT_GUIDE.height);
  const safeLeft = placeholderWidth * 0.06;
  const safeTop = placeholderHeight * clamp(FIXED_TOP_GAP_PCT / 100, 0.1, 0.18);
  const safeWidth = placeholderWidth * 0.88;
  const safeHeight = placeholderHeight * (1 - clamp(FIXED_TOP_GAP_PCT / 100, 0.1, 0.18) - 0.08);
  const fillPct = clamp(FIXED_FILL_PCT / 100, 0.75, 0.9);

  const scaleFactor = Math.min(safeWidth / bounds.visibleWidth, safeHeight / bounds.visibleHeight) * fillPct;
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
  product: PrintifyProduct,
  uploadId: string,
  item: DraftProductInput["item"],
  guide: NormalizedPlacementGuide
) {
  const target = chooseFrontPlacement(product);
  if (!target) {
    return [];
  }

  const placement = getContentAwarePlacement(item.imageDataUrl, guide, target.imageDefaults, item.artworkBounds);

  return (product.print_areas || [])
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

      if (!placeholders.length) {
        return null;
      }

      return {
        variant_ids: area.variant_ids,
        ...(area.background ? { background: area.background } : {}),
        placeholders,
      };
    })
    .filter(Boolean);
}

export function createPrintifyAdapter(options: PrintifyAdapterOptions = {}): ProviderAdapter {
  const fetchFn = options.fetch ?? fetch;
  const apiBase = options.apiBase ?? PRINTIFY_API_BASE;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const userAgent = options.userAgent ?? USER_AGENT;

  async function fetchWithTimeout(path: string, init?: RequestInit, requestTimeoutMs = timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      return await fetchFn(`${apiBase}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestJson<T>(context: ProviderAdapterContext, path: string, fallbackMessage: string, init?: RequestInit) {
    if (!context.credentials.apiKey.trim()) {
      throw new ProviderError({
        providerId: "printify",
        code: "missing_credentials",
        status: 401,
        message: "Missing provider API key.",
      });
    }

    const response = await fetchWithTimeout(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${context.credentials.apiKey}`,
        "User-Agent": userAgent,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw await providerErrorFromResponse("printify", response, fallbackMessage);
    }

    return (await response.json()) as T;
  }

  async function resolvePlacementGuide(context: ProviderAdapterContext, product: PrintifyProduct) {
    if (!product.blueprint_id || !product.print_provider_id) {
      return DEFAULT_PLACEMENT_GUIDE;
    }

    const preferredPosition = chooseFrontPosition(product);

    try {
      const variants = await requestJson<CatalogVariant[]>(
        context,
        `/catalog/blueprints/${encodeURIComponent(String(product.blueprint_id))}/print_providers/${encodeURIComponent(String(product.print_provider_id))}/variants.json`,
        "Unable to load provider placement metadata."
      );

      const preferredVariantId = chooseVariantId(product);
      const orderedVariants = [variants.find((variant) => variant.id === preferredVariantId), ...variants].filter(Boolean) as CatalogVariant[];

      for (const variant of orderedVariants) {
        const exact = (variant.placeholders || []).find((placeholder) => String(placeholder.position || "").trim() === preferredPosition);
        const generic =
          exact ||
          (variant.placeholders || []).find((placeholder) => {
            const position = String(placeholder.position || "").trim();
            return FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(position));
          });

        if (generic?.width && generic?.height) {
          return {
            position: generic.position || preferredPosition,
            width: generic.width,
            height: generic.height,
            decorationMethod: generic.decoration_method,
            source: "live" as const,
          };
        }
      }
    } catch (error) {
      if (error instanceof ProviderError && error.code !== "invalid_credentials") {
        return {
          ...DEFAULT_PLACEMENT_GUIDE,
          position: preferredPosition || DEFAULT_PLACEMENT_GUIDE.position,
        };
      }

      throw error;
    }

    return {
      ...DEFAULT_PLACEMENT_GUIDE,
      position: preferredPosition || DEFAULT_PLACEMENT_GUIDE.position,
    };
  }

  return {
    id: "printify",
    displayName: "Printify",
    capabilities: PRINTIFY_CAPABILITIES,
    async connect(context) {
      const stores = await this.listStores(context);
      return {
        providerId: this.id,
        displayName: this.displayName,
        capabilities: this.capabilities,
        stores,
      };
    },
    async listStores(context) {
      const shops = await requestJson<PrintifyShop[]>(context, "/shops.json", "Unable to load provider stores.");

      return shops.map((shop): NormalizedStore => ({
        id: String(shop.id),
        name: shop.title,
        salesChannel: shop.sales_channel,
      }));
    },
    async listTemplatesOrProducts(context) {
      if (!context.storeId.trim()) {
        throw new ProviderError({
          providerId: "printify",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId.",
        });
      }

      const payload = await requestJson<PrintifyProduct[] | { data?: PrintifyProduct[] }>(
        context,
        `/shops/${encodeURIComponent(context.storeId)}/products.json`,
        "Unable to load provider templates."
      );

      const products = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

      return products.map((product): NormalizedTemplateSummary => ({
        id: product.id,
        storeId: context.storeId,
        title: product.title,
        description: product.description,
        type: "product",
      }));
    },
    async getTemplateDetail(context) {
      if (!context.storeId.trim() || !context.sourceId.trim()) {
        throw new ProviderError({
          providerId: "printify",
          code: "missing_parameter",
          status: 400,
          message: "Missing storeId or sourceId.",
        });
      }

      const product = await requestJson<PrintifyProduct>(
        context,
        `/shops/${encodeURIComponent(context.storeId)}/products/${encodeURIComponent(context.sourceId)}.json`,
        "Unable to load template detail."
      );
      const placementGuide = await resolvePlacementGuide(context, product);

      return {
        id: product.id,
        storeId: context.storeId,
        title: product.title,
        description: product.description || "",
        placementGuide,
        metadata: {
          rawTemplate: product,
        },
      };
    },
    async uploadArtwork(context) {
      const contents = extractBase64(context.imageDataUrl);
      if (!contents) {
        throw new ProviderError({
          providerId: "printify",
          code: "validation_error",
          status: 400,
          message: "Image data is missing or not base64.",
        });
      }

      const uploaded = await requestJson<{ id: string }>(
        context,
        "/uploads/images.json",
        "Unable to upload artwork.",
        {
          method: "POST",
          body: JSON.stringify({
            file_name: context.fileName,
            contents,
          }),
        }
      );

      return {
        id: String(uploaded.id),
        fileName: context.fileName,
        providerId: "printify",
      } satisfies NormalizedArtworkUpload;
    },
    async createDraftProduct(context) {
      try {
        const templateDetail =
          context.templateDetail ||
          (await this.getTemplateDetail({
            credentials: context.credentials,
            storeId: context.storeId,
            sourceId: context.templateId,
          }));

        const rawTemplate = templateDetail.metadata?.rawTemplate as PrintifyProduct | undefined;
        const template =
          rawTemplate ||
          (await requestJson<PrintifyProduct>(
            context,
            `/shops/${encodeURIComponent(context.storeId)}/products/${encodeURIComponent(context.templateId)}.json`,
            "Unable to load template detail."
          ));

        const enabledVariants = (template.variants || [])
          .filter((variant) => variant.is_enabled !== false)
          .map((variant) => ({
            id: variant.id,
            price: variant.price ?? 0,
            is_enabled: true,
            is_default: !!variant.is_default,
          }));

        if (!enabledVariants.length) {
          throw new ProviderError({
            providerId: "printify",
            code: "validation_error",
            status: 400,
            message: "Template has no enabled variants.",
          });
        }

        const upload = await this.uploadArtwork({
          credentials: context.credentials,
          fileName: context.item.fileName,
          imageDataUrl: context.item.imageDataUrl,
        });

        const printAreas = buildFrontOnlyPrintAreas(template, upload.id, context.item, templateDetail.placementGuide);
        if (!printAreas.length) {
          throw new ProviderError({
            providerId: "printify",
            code: "validation_error",
            status: 400,
            message: "Unable to determine a front print area from the selected template.",
          });
        }

        const created = await requestJson<{ id: string }>(
          context,
          `/shops/${encodeURIComponent(context.storeId)}/products.json`,
          "Unable to create draft product.",
          {
            method: "POST",
            body: JSON.stringify({
              title: context.item.title,
              description: context.item.description,
              blueprint_id: template.blueprint_id,
              print_provider_id: template.print_provider_id,
              tags: Array.isArray(context.item.tags) ? context.item.tags.slice(0, 13) : [],
              variants: enabledVariants,
              print_areas: printAreas,
              ...(template.print_details ? { print_details: template.print_details } : {}),
            }),
          }
        );

        return {
          providerId: "printify",
          fileName: context.item.fileName,
          title: context.item.title,
          productId: created.id,
          message: `Created draft product with guided ${templateDetail.placementGuide.position || "front"} placement.`,
          placementGuide: templateDetail.placementGuide,
        } satisfies DraftProductResult;
      } catch (error) {
        throw toProviderError(error, {
          providerId: "printify",
          code: "upstream_error",
          status: 500,
          message: "Unable to create draft product.",
        });
      }
    },
  };
}
