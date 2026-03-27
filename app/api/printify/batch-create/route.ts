import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const USER_AGENT = "MerchQuantum";

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

function buildPrintAreas(template: TemplateProduct, uploadId: string) {
  return (template.print_areas || []).map((area) => ({
    variant_ids: area.variant_ids,
    ...(area.background ? { background: area.background } : {}),
    placeholders: (area.placeholders || []).map((placeholder) => {
      const sourceImages =
        Array.isArray(placeholder.images) && placeholder.images.length
          ? placeholder.images
          : [{ x: 0.5, y: 0.5, scale: 1, angle: 0 }];

      return {
        position: placeholder.position,
        images: sourceImages.map((img) => ({
          id: uploadId,
          x: typeof img.x === "number" ? img.x : 0.5,
          y: typeof img.y === "number" ? img.y : 0.5,
          scale: typeof img.scale === "number" ? img.scale : 1,
          angle: typeof img.angle === "number" ? img.angle : 0,
          ...(img.pattern ? { pattern: img.pattern } : {}),
        })),
      };
    }),
  }));
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
      const text = await templateResponse.text();
      return NextResponse.json(
        { error: text || `Template request failed with status ${templateResponse.status}.` },
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
      published?: boolean;
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
          const text = await uploadResponse.text();
          throw new Error(text || `Upload failed with status ${uploadResponse.status}.`);
        }

        const uploaded = await uploadResponse.json();

        const createPayload = {
          title: item.title,
          description: item.description,
          blueprint_id: template.blueprint_id,
          print_provider_id: template.print_provider_id,
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 13) : [],
          variants: enabledVariants,
          print_areas: buildPrintAreas(template, uploaded.id),
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
          const text = await createResponse.text();
          throw new Error(text || `Create failed with status ${createResponse.status}.`);
        }

        const created = await createResponse.json();

        let published = false;
        let message = "Created.";

        const publishResponse = await fetch(
          `${PRINTIFY_API_BASE}/shops/${encodeURIComponent(
            shopId
          )}/products/${encodeURIComponent(created.id)}/publish.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": USER_AGENT,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: true,
              description: true,
              images: true,
              variants: true,
              tags: true,
              keyFeatures: true,
              shipping_template: true,
            }),
          }
        );

        if (publishResponse.ok) {
          published = true;
          message = "Created and publish request sent.";
        } else {
          const text = await publishResponse.text();
          message =
            text || `Created, but publish failed with status ${publishResponse.status}.`;
        }

        results.push({
          fileName: item.fileName,
          title: item.title,
          productId: created.id,
          published,
          message,
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
      message: `Processed ${results.length} item(s). Created ${createdCount}.`,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run batch create.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
