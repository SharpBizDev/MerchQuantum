import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";
const FRONT_POSITION_PATTERNS = [
  /front/i,
  /chest/i,
  /center/i,
  /default/i,
];

type IncomingItem = {
  fileName: string;
  title: string;
  description: string;
  tags: string[];
  imageDataUrl: string;
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

function extractBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : "";
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

function chooseFrontPlacement(template: TemplateProduct) {
  let fallback: {
    areaIndex: number;
    placeholderIndex: number;
    imageDefaults?: TemplateProduct["print_areas"][number]["placeholders"][number]["images"][number];
  } | null = null;

  for (let areaIndex = 0; areaIndex < (template.print_areas || []).length; areaIndex += 1) {
    const area = template.print_areas[areaIndex];
    for (let placeholderIndex = 0; placeholderIndex < (area.placeholders || []).length; placeholderIndex += 1) {
      const placeholder = area.placeholders[placeholderIndex];
      const imageDefaults = Array.isArray(placeholder.images) && placeholder.images.length
        ? placeholder.images[0]
        : undefined;

      if (!fallback) {
        fallback = { areaIndex, placeholderIndex, imageDefaults };
      }

      if (FRONT_POSITION_PATTERNS.some((pattern) => pattern.test(placeholder.position || ""))) {
        return { areaIndex, placeholderIndex, imageDefaults };
      }
    }
  }

  return fallback;
}

function buildFrontOnlyPrintAreas(template: TemplateProduct, uploadId: string) {
  const target = chooseFrontPlacement(template);

  if (!target) return [];

  return (template.print_areas || [])
    .map((area, areaIndex) => {
      const placeholders = (area.placeholders || [])
        .map((placeholder, placeholderIndex) => {
          if (
            areaIndex !== target.areaIndex ||
            placeholderIndex !== target.placeholderIndex
          ) {
            return null;
          }

          const img = target.imageDefaults;

          return {
            position: placeholder.position,
            images: [
              {
                id: uploadId,
                x: typeof img?.x === "number" ? img.x : 0.5,
                y: typeof img?.y === "number" ? img.y : 0.5,
                scale: typeof img?.scale === "number" ? img.scale : 1,
                angle: typeof img?.angle === "number" ? img.angle : 0,
                ...(img?.pattern ? { pattern: img.pattern } : {}),
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
    const items = Array.isArray(body?.items) ? (body.items as IncomingItem[]) : [];

    if (!shopId || !templateProductId || !items.length) {
      return NextResponse.json(
        { error: "Missing shopId, templateProductId, or items." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("printify_token")?.value?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "No Printify token found. Connect again." },
        { status: 401 }
      );
    }

    const templateResponse = await fetch(
      `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(
        shopId
      )}/products/${encodeURIComponent(templateProductId)}.json`,
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
      return NextResponse.json(
        { error: text },
        { status: templateResponse.status }
      );
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
      return NextResponse.json(
        { error: "Template has no enabled variants." },
        { status: 400 }
      );
    }

    const results: Array<{
      fileName: string;
      title: string;
      productId?: string;
      message: string;
    }> = [];

    for (const item of items) {
      try {
        const contents = extractBase64(item.imageDataUrl);
        if (!contents) {
          throw new Error("Image data is missing or not base64.");
        }

        const uploadResponse = await fetch(`${PRINTIFY_API_BASE}/uploads/images.json`, {
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
          const text = await readErrorMessage(
            uploadResponse,
            `Upload failed with status ${uploadResponse.status}.`
          );
          throw new Error(text);
        }

        const uploaded = await uploadResponse.json();
        const printAreas = buildFrontOnlyPrintAreas(template, uploaded.id);

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

        const createResponse = await fetch(
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
          const text = await readErrorMessage(
            createResponse,
            `Create failed with status ${createResponse.status}.`
          );
          throw new Error(text);
        }

        const created = await createResponse.json();

        results.push({
          fileName: item.fileName,
          title: item.title,
          productId: created.id,
          message: "Created draft product. Front print area only.",
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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run batch create.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
