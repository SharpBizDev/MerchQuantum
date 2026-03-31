import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.OPENAI_LISTING_MODEL || "gpt-4o-mini";
const MAX_TEMPLATE_CONTEXT = 1400;

type ListingRequest = {
  imageDataUrl?: string;
  title?: string;
  fileName?: string;
  productFamily?: string;
  templateContext?: string;
};

type ListingResponse = {
  title: string;
  leadParagraphs: string[];
  model: string;
  confidence: number;
  source: "openai" | "fallback";
};

function cleanSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripExtension(value: string) {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function titleCaseWord(word: string) {
  if (!word) return word;
  if (/^[A-Z0-9]+$/.test(word)) return word;
  if (word.length <= 3 && /^(usa|uk|dtg|dtf|ai)$/i.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeTitle(rawTitle: string, fileName = "") {
  const seed = cleanSpaces(stripExtension(rawTitle || fileName || "Product"));
  const words = seed
    .replace(/[\/_|]+/g, " ")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/[^A-Za-z0-9&+'% ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(word);
  }

  const titled = deduped.map((word) => {
    if (/^(and|or|for|with|the|a|an|of|to|in|on)$/i.test(word)) return word.toLowerCase();
    if (/^\d+%$/.test(word)) return word;
    return titleCaseWord(word);
  });

  const joined = cleanSpaces(titled.join(" "));
  return joined.length > 120 ? joined.slice(0, 120).trim() : joined;
}

function detectTheme(title: string, templateContext: string) {
  const haystack = `${title} ${templateContext}`.toLowerCase();
  if (/(christian|jesus|faith|saved|forgiven|church|bible|gospel|cross)/.test(haystack)) return "faith-forward";
  if (/(funny|humor|sarcastic|joke|hilarious|snarky)/.test(haystack)) return "conversation-starting";
  if (/(retro|vintage|distressed)/.test(haystack)) return "retro-inspired";
  if (/(healthy|natural|organic|wellness|fitness)/.test(haystack)) return "wellness-inspired";
  if (/(dog|cat|pet|puppy)/.test(haystack)) return "pet-loving";
  return "graphic";
}

function familyLabel(family: string) {
  switch ((family || "").toLowerCase()) {
    case "t-shirt":
      return "graphic tee";
    case "hoodie":
      return "hoodie";
    case "sweatshirt":
      return "sweatshirt";
    case "tank top":
      return "tank top";
    case "hat":
      return "hat";
    case "drinkware":
      return "drinkware piece";
    case "candle":
      return "candle";
    case "bath-body":
      return "bath and body item";
    case "home-kitchen":
      return "home and kitchen piece";
    case "wall-art":
      return "wall art piece";
    case "sticker":
      return "sticker";
    case "bag":
      return "bag";
    case "accessory":
      return "accessory";
    case "footwear":
      return "footwear item";
    default:
      return "product";
  }
}

function summarizeTemplateContext(templateContext: string) {
  const cleaned = cleanSpaces(
    templateContext
      .replace(/Product features/gi, "")
      .replace(/Care instructions/gi, "")
      .replace(/[-•]\s*/g, "")
      .replace(/\s+/g, " ")
      .slice(0, MAX_TEMPLATE_CONTEXT)
  );

  if (!cleaned) {
    return "It keeps the loaded template details intact so the material, features, and care information remain clear and easy to review.";
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanSpaces(sentence))
    .filter(Boolean);

  const summary = sentences.slice(0, 2).join(" ");
  if (summary.length >= 110 && summary.length <= 280) return summary;

  if (sentences.length) {
    return `${sentences[0]} ${sentences[1] || ""}`.trim();
  }

  return cleaned.slice(0, 260).trim();
}

function buildFallbackLead(title: string, family: string, templateContext: string) {
  const normalizedTitle = normalizeTitle(title);
  const theme = detectTheme(normalizedTitle, templateContext);
  const label = familyLabel(family);

  const paragraphOne = cleanSpaces(
    `${normalizedTitle} is a ${theme} ${label} built for clean presentation, everyday appeal, and stronger first-glance clarity in a live listing.`
  );

  const paragraphTwo = cleanSpaces(
    summarizeTemplateContext(templateContext) ||
      "It keeps the loaded template structure intact so the product features and care instructions stay clean, readable, and ready for upload."
  );

  return [paragraphOne, paragraphTwo];
}

function sanitizeLeadParagraphs(value: unknown, title: string, family: string, templateContext: string) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((item) => (typeof item === "string" ? cleanSpaces(item) : ""))
    .filter(Boolean)
    .slice(0, 2);

  if (cleaned.length >= 2) return cleaned;
  return buildFallbackLead(title, family, templateContext);
}

function extractTextFromResponsesApi(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const chunk of content) {
      if (typeof chunk?.text === "string") parts.push(chunk.text);
    }
  }

  return parts.join("\n").trim();
}

function parseJsonLoose(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callOpenAi(input: ListingRequest): Promise<ListingResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const normalizedTitle = normalizeTitle(input.title || "", input.fileName || "");
  const family = cleanSpaces(input.productFamily || "product");
  const templateContext = cleanSpaces((input.templateContext || "").slice(0, MAX_TEMPLATE_CONTEXT));

  const prompt = [
    "Rewrite the product title and write only two lead intro paragraphs for an ecommerce product listing preview.",
    "Do not include product features or care instructions.",
    "Keep the returned title between 45 and 120 characters when possible.",
    "Keep the two lead paragraphs concise, marketable, and natural.",
    "Return valid JSON only with keys: title, leadParagraphs, confidence.",
    `Product family: ${family}`,
    `Current title: ${normalizedTitle}`,
    `Template context: ${templateContext}`,
  ].join("\n");

  const body: any = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "listing_rewrite",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            leadParagraphs: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              items: { type: "string" },
            },
            confidence: { type: "number" },
          },
          required: ["title", "leadParagraphs", "confidence"],
        },
      },
    },
  };

  if (typeof input.imageDataUrl === "string" && input.imageDataUrl.startsWith("data:image/")) {
    body.input[0].content.push({
      type: "input_image",
      image_url: input.imageDataUrl,
      detail: "low",
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const rawText = extractTextFromResponsesApi(payload);
  const parsed = parseJsonLoose(rawText);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI returned an unexpected rewrite payload.");
  }

  const title = normalizeTitle(String((parsed as any).title || normalizedTitle), input.fileName || "");
  const leadParagraphs = sanitizeLeadParagraphs((parsed as any).leadParagraphs, title, family, templateContext);
  const confidence = typeof (parsed as any).confidence === "number" ? (parsed as any).confidence : 0.86;

  return {
    title,
    leadParagraphs,
    confidence,
    model: DEFAULT_MODEL,
    source: "openai",
  };
}

function buildFallbackResponse(input: ListingRequest): ListingResponse {
  const title = normalizeTitle(input.title || "", input.fileName || "");
  const family = cleanSpaces(input.productFamily || "product");
  const templateContext = cleanSpaces((input.templateContext || "").slice(0, MAX_TEMPLATE_CONTEXT));

  return {
    title,
    leadParagraphs: buildFallbackLead(title, family, templateContext),
    confidence: 0.62,
    model: "Built-in fallback rewrite",
    source: "fallback",
  };
}

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as ListingRequest;

    if (!input?.title && !input?.fileName) {
      return NextResponse.json({ error: "A title or filename is required." }, { status: 400 });
    }

    try {
      const aiResponse = await callOpenAi(input);
      if (aiResponse) {
        return NextResponse.json(aiResponse, {
          headers: {
            "Cache-Control": "no-store",
          },
        });
      }
    } catch (error) {
      console.error("AI listing rewrite failed. Falling back.", error);
    }

    return NextResponse.json(buildFallbackResponse(input), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate the listing rewrite.",
      },
      { status: 500 }
    );
  }
}
