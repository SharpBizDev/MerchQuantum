import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.GEMINI_LISTING_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
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
  reasonFlags: string[];
  source: "gemini" | "fallback";
};

function cleanSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripExtension(value: string) {
  return value.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function titleCaseWord(word: string) {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (["AI", "USA", "DTG", "DTF", "SVG", "PNG", "JPG", "PDF"].includes(upper)) return upper;
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

  return cleanSpaces(
    deduped
      .map((word) => {
        if (/^(and|or|for|with|the|a|an|of|to|in|on)$/i.test(word)) return word.toLowerCase();
        if (/^\d+%$/.test(word)) return word;
        return titleCaseWord(word);
      })
      .join(" ")
  ).slice(0, 120).trim();
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

function detectTheme(title: string, templateContext: string) {
  const haystack = `${title} ${templateContext}`.toLowerCase();
  if (/(christian|jesus|faith|saved|forgiven|church|bible|gospel|cross)/.test(haystack)) return "faith-forward";
  if (/(funny|humor|sarcastic|joke|hilarious|snarky)/.test(haystack)) return "conversation-starting";
  if (/(retro|vintage|distressed)/.test(haystack)) return "retro-inspired";
  if (/(healthy|natural|organic|wellness|fitness)/.test(haystack)) return "wellness-inspired";
  if (/(dog|cat|pet|puppy)/.test(haystack)) return "pet-loving";
  if (/(holiday|christmas|halloween|fall|thanksgiving)/.test(haystack)) return "seasonal";
  return "graphic";
}

function summarizeTemplateContext(templateContext: string) {
  const cleaned = cleanSpaces(templateContext.slice(0, MAX_TEMPLATE_CONTEXT));
  if (!cleaned) {
    return "Keep the imported product features and care instructions intact below the custom lead copy.";
  }
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanSpaces(sentence))
    .filter(Boolean);
  return (sentences.slice(0, 2).join(" ") || cleaned).slice(0, 300).trim();
}

function trimToSentence(value: string, maxChars: number) {
  const clean = cleanSpaces(value);
  if (!clean || clean.length <= maxChars) return clean;
  const clipped = clean.slice(0, maxChars).trim();
  const sentenceBreak = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (sentenceBreak >= Math.floor(maxChars * 0.6)) {
    return clipped.slice(0, sentenceBreak + 1).trim();
  }
  const spaceBreak = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, Math.max(spaceBreak, 1)).trim()}...`;
}

function normalizeLeadParagraphs(paragraphs: string[]) {
  return paragraphs
    .map((paragraph) => trimToSentence(paragraph, 220))
    .map((paragraph) => cleanSpaces(paragraph))
    .filter(Boolean)
    .slice(0, 2);
}

function buildFallbackLead(title: string, family: string, templateContext: string) {
  const normalizedTitle = normalizeTitle(title);
  const theme = detectTheme(normalizedTitle, templateContext);
  const label = familyLabel(family);

  const paragraphOne = cleanSpaces(
    `${normalizedTitle} is a ${theme} ${label} built for clearer merchandising, strong first-glance appeal, and a cleaner final listing.`
  );

  const paragraphTwo = cleanSpaces(
    summarizeTemplateContext(templateContext) ||
      "Keep the imported product features and care instructions intact below the custom lead copy."
  );

  return [paragraphOne, paragraphTwo];
}

function parseGeminiJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractGeminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

async function callGemini(input: ListingRequest): Promise<ListingResponse | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const normalizedTitle = normalizeTitle(input.title || "", input.fileName || "");
  const family = cleanSpaces(input.productFamily || "product");
  const templateContext = cleanSpaces((input.templateContext || "").slice(0, MAX_TEMPLATE_CONTEXT));

  const imageDataUrl = typeof input.imageDataUrl === "string" ? input.imageDataUrl : "";
  const imageMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!imageMatch) return null;

  const [, mimeType, inlineData] = imageMatch;

  const prompt = [
    "You are Quantum AI for a bulk print-on-demand listing tool.",
    "Analyze the uploaded artwork and produce ecommerce-ready copy.",
    "Return valid JSON only with keys: title, leadParagraphs, confidence, reasonFlags.",
    "Rules:",
    "- Keep title marketable and specific.",
    "- Keep title between 60 and 110 characters when possible.",
    "- leadParagraphs must be an array of exactly 2 short paragraphs.",
    "- Keep the lead copy concise because the imported template features and care instructions will remain below it.",
    "- If the image is ambiguous, low quality, text-heavy, or hard to read, lower confidence and explain in reasonFlags.",
    "- If the file is clear and usable, return an empty reasonFlags array.",
    `Product family hint: ${family}`,
    `Current title seed: ${normalizedTitle}`,
    `Imported template context: ${templateContext || "None provided"}`,
  ].join("\n");

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: inlineData,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Gemini request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const rawText = extractGeminiText(payload);
  const parsed = parseGeminiJson(rawText);
  if (!parsed) return null;

  const title = normalizeTitle(String(parsed.title || normalizedTitle), input.fileName || normalizedTitle);
  const leadParagraphs = normalizeLeadParagraphs(
    Array.isArray(parsed.leadParagraphs) ? parsed.leadParagraphs.map((value: unknown) => String(value || "")) : []
  );

  if (!title || leadParagraphs.length < 2) return null;

  return {
    title,
    leadParagraphs,
    model: GEMINI_MODEL,
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.8,
    reasonFlags: Array.isArray(parsed.reasonFlags)
      ? parsed.reasonFlags.map((value: unknown) => cleanSpaces(String(value || ""))).filter(Boolean).slice(0, 4)
      : [],
    source: "gemini",
  };
}

function buildFallbackResponse(input: ListingRequest): ListingResponse {
  const normalizedTitle = normalizeTitle(input.title || "", input.fileName || "");
  const family = cleanSpaces(input.productFamily || "product");
  const templateContext = cleanSpaces((input.templateContext || "").slice(0, MAX_TEMPLATE_CONTEXT));

  return {
    title: normalizedTitle,
    leadParagraphs: buildFallbackLead(normalizedTitle, family, templateContext),
    model: GEMINI_MODEL,
    confidence: 0.72,
    reasonFlags: [],
    source: "fallback",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ListingRequest;
    if (!body?.imageDataUrl) {
      return NextResponse.json({ error: "Image data is required." }, { status: 400 });
    }

    try {
      const gemini = await callGemini(body);
      if (gemini) return NextResponse.json(gemini);
    } catch {
      // fall through to local fallback
    }

    return NextResponse.json(buildFallbackResponse(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate listing copy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
