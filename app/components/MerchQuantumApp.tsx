'use client';

import React, { useMemo, useRef, useState } from "react";

const APP_TAGLINE = "Bulk product creation, simplified";
const PRIMARY_PLATFORM = "Printify";

type Img = {
  id: string;
  name: string;
  preview: string;
  cleaned: string;
  final: string;
};

type Template = {
  reference: string;
  nickname: string;
  source: "product" | "manual";
  shopId: string;
  description: string;
};

type Shop = { id: string; title: string };

type Product = {
  id: string;
  title: string;
  type: string;
  shopId: string;
  description?: string;
};

type ApiShop = { id: number | string; title: string; sales_channel?: string };
type ApiProduct = {
  id: string;
  title: string;
  description?: string;
  shop_id?: number | string;
};

type BatchResult = {
  fileName: string;
  title: string;
  productId?: string;
  published?: boolean;
  message: string;
};

const MAX_BATCH_FILES = 50;

const FALLBACK_SHOPS: Shop[] = [
  { id: "451293", title: "Primary Printify Shop" },
  { id: "451294", title: "Secondary Printify Shop" },
];

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "12345ABCDE",
    title: "Example Template Product 12345ABCDE",
    type: "Apparel",
    shopId: "451293",
  },
  {
    id: "67890FGHIJ",
    title: "Example Template Product 67890FGHIJ",
    type: "Accessory",
    shopId: "451294",
  },
];

const STOP_WORDS = new Set([
  "the","a","an","and","or","for","with","of","to","in","on","graphic",
  "unisex","shirt","t","tee","this","it","product","features","care",
  "instructions","size","chart","details"
]);

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanTitle(filename: string) {
  const raw = filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/&/g, " & ")
    .replace(/[^A-Za-z0-9&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "Untitled Product";

  return raw
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word === "&") return word;
      if (/^\d+$/.test(word)) return word;
      const upper = word.toUpperCase();
      if (["AI","USA","POD","DTG","DTF","SVG","PNG","JPG","PDF","XL","XXL","2XL","3XL"].includes(upper)) {
        return upper;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeRef(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.findIndex((segment) => segment.toLowerCase() === "products");
    return idx >= 0 && segments[idx + 1]
      ? segments[idx + 1]
      : segments[segments.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}

function maskToken(value: string) {
  const s = value.trim();
  if (!s) return "";
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(Math.max(4, s.length - 8))}${s.slice(-4)}`;
}

function safeTitle(value: string, fallback: string) {
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function formatTemplateDescription(templateDescription: string) {
  const normalized = decodeHtmlEntities(templateDescription)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ");

  const headers = new Set([
    "Product features",
    "Care instructions",
    "Size chart",
    "Product details",
    "Materials",
    "Sizing",
    "Dimensions",
  ]);

  const rawLines = normalized.split("\n");
  const out: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    const cleaned = trimmed.startsWith("-")
      ? "- " + trimmed.replace(/^[-–—]\s*/, "")
      : trimmed.replace(/\s+/g, " ");
    const header = cleaned.replace(/:$/, "");

    if (headers.has(header) && out.length && out[out.length - 1] !== "") out.push("");
    out.push(cleaned);
  }

  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function extractReusableTemplateSections(formattedDescription: string) {
  const headers = [
    "Product features",
    "Care instructions",
    "Size chart",
    "Product details",
    "Materials",
    "Sizing",
    "Dimensions",
  ];
  const positions = headers
    .map((header) => formattedDescription.indexOf(header))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  if (!positions.length) return "";
  return formattedDescription.slice(positions[0]).trim();
}

function detectProductType(title: string) {
  const lower = title.toLowerCase();
  if (/(t-shirt|t shirt|tee)\b/.test(lower)) return "t-shirt";
  if (/hoodie\b/.test(lower)) return "hoodie";
  if (/sweatshirt\b/.test(lower)) return "sweatshirt";
  if (/tank top\b|tank\b/.test(lower)) return "tank top";
  if (/sticker\b/.test(lower)) return "sticker";
  if (/mug\b/.test(lower)) return "mug";
  if (/poster\b/.test(lower)) return "poster";
  if (/canvas\b/.test(lower)) return "canvas print";
  return "product";
}

function detectThemePhrase(title: string) {
  const lower = title.toLowerCase();
  if (/(christian|jesus|faith|saved|forgiven|church|bible|gospel|cross)\b/.test(lower)) return "faith-forward style";
  if (/(retro|vintage|distressed)\b/.test(lower)) return "a retro-inspired look";
  if (/(funny|humor|sarcastic|joke)\b/.test(lower)) return "a playful, conversation-starting look";
  if (/(dog|cat|pet|puppy)\b/.test(lower)) return "pet-lover style";
  if (/(floral|rose|flower|botanical)\b/.test(lower)) return "a bold graphic look";
  return "a standout graphic look";
}

function detectAudiencePhrase(title: string, productType: string) {
  const lower = title.toLowerCase();
  if (/(christian|jesus|faith|saved|forgiven|church|bible|gospel|cross)\b/.test(lower)) {
    return productType === "product"
      ? "Christian merchandise with bold devotional artwork"
      : `Christian ${productType} designs with bold devotional artwork`;
  }
  if (/(retro|vintage|distressed)\b/.test(lower)) return "retro graphic designs with easy everyday appeal";
  if (/(funny|humor|sarcastic|joke)\b/.test(lower)) return "funny graphic designs with strong gift appeal";
  if (/(dog|cat|pet|puppy)\b/.test(lower)) return "pet-lover graphic designs that still feel giftable";
  return productType === "product"
    ? "niche product designs that stand out"
    : `${productType} designs that stand out`;
}

function detectUseCasePhrase(productType: string) {
  if (["t-shirt", "hoodie", "sweatshirt", "tank top"].includes(productType)) {
    return "daily wear, gifting, and casual styling";
  }
  if (productType === "sticker") return "laptops, water bottles, notebooks, and gifting";
  if (productType === "mug") return "daily routines, desk setups, and gifting";
  if (["poster", "canvas print"].includes(productType)) return "home décor, office spaces, and gifting";
  return "everyday use, gifting, and niche-specific collections";
}

function buildSeoLead(title: string) {
  const clean = safeTitle(title, "Product");
  const productType = detectProductType(clean);
  const theme = detectThemePhrase(clean);
  const audience = detectAudiencePhrase(clean, productType);
  const useCase = detectUseCasePhrase(productType);
  const sentenceOne =
    productType === "product"
      ? `${clean} delivers ${theme} with a clear, niche-focused presentation.`
      : `${clean} delivers ${theme} in a ${productType}.`;

  return `${sentenceOne} Built for shoppers looking for ${audience}, it works well for ${useCase}.`;
}

function buildDescription(title: string, templateDescription: string) {
  const base =
    formatTemplateDescription(templateDescription) ||
    "Template description will load here after live API wiring.";

  const intro = buildSeoLead(title);
  const reusableSections = extractReusableTemplateSections(base);

  return reusableSections
    ? `${intro}\n\n${reusableSections}`.trim()
    : `${intro}\n\n${base}`.trim();
}

function buildTags(title: string, description: string, count: number) {
  if (count <= 0) return [];

  const words = `${title} ${description}`
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()));

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const word of words) {
    const formatted = cleanTitle(word);
    const key = formatted.toLowerCase();
    if (!formatted || seen.has(key)) continue;
    seen.add(key);
    tags.push(formatted);
    if (tags.length >= count) break;
  }

  return tags;
}

function isImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatApiError(message: string) {
  const raw = message.trim();
  if (!raw) return "Live Printify connection is not available in this preview.";
  if (raw.includes("UnsupportedHttpVerb")) {
    return "Live Printify connection is not available in this preview. The backend API route is not installed in this environment yet.";
  }
  if (raw.startsWith("<?xml")) {
    return "Live Printify connection is not available in this preview. The request reached a static host instead of a backend API route.";
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-950">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ${props.className || ""}`.trim()}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ${props.className || ""}`.trim()}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${props.className || ""}`.trim()}
    />
  );
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  }
) {
  const variant = props.variant || "primary";
  const classes =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-500"
      : variant === "secondary"
        ? "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
        : "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900";

  return (
    <button
      {...props}
      className={`rounded-xl px-3 py-2 text-sm disabled:opacity-50 ${classes} ${props.className || ""}`.trim()}
    />
  );
}

function Badge({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs ${on ? "bg-slate-900 text-white dark:bg-violet-600" : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
    >
      {children}
    </span>
  );
}

function BrandMark() {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <span className="absolute left-[10px] top-[13px] z-10 text-[2rem] font-semibold leading-none text-violet-500">
        M
      </span>
      <span className="absolute right-[8px] top-[8px] text-[2.45rem] font-semibold leading-none text-white">
        Q
      </span>
    </div>
  );
}

export default function MerchQuantumApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState("");
  const [apiShops, setApiShops] = useState<Shop[]>([]);
  const [apiProducts, setApiProducts] = useState<Product[]>([]);
  const [shopId, setShopId] = useState("");
  const [source, setSource] = useState<"product" | "manual">("product");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [nickname, setNickname] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [saved, setSaved] = useState<Template[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);

  const FIXED_TAG_COUNT = 13;

  const availableShops = connected
    ? apiShops.length
      ? apiShops
      : FALLBACK_SHOPS
    : [];
  const productSource = apiProducts.length ? apiProducts : FALLBACK_PRODUCTS;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productSource.filter(
      (p) =>
        p.shopId === shopId &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q))
    );
  }, [shopId, search, productSource]);

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedId) || images[0] || null,
    [images, selectedId]
  );

  const previewDescription = selectedImage
    ? buildDescription(selectedImage.final, templateDescription)
    : templateDescription;

  const previewTags = selectedImage
    ? buildTags(selectedImage.final, previewDescription, FIXED_TAG_COUNT)
    : [];

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setMessage("");

    const room = Math.max(0, MAX_BATCH_FILES - images.length);
    const valid = Array.from(list).filter(isImage).slice(0, room);
    const skippedByType = Array.from(list).filter((f) => !isImage(f)).length;
    const skippedByLimit = Math.max(
      0,
      Array.from(list).filter(isImage).length - valid.length
    );

    const results = await Promise.allSettled(
      valid.map(async (file) => {
        const cleaned = cleanTitle(file.name);
        return {
          id: makeId(),
          name: file.name,
          preview: await readDataUrl(file),
          cleaned,
          final: cleaned,
        } as Img;
      })
    );

    const good = results
      .filter((r): r is PromiseFulfilledResult<Img> => r.status === "fulfilled")
      .map((r) => r.value);

    const failed = results.length - good.length;

    setImages((current) => {
      const next = [...current, ...good];
      if (!selectedId && next[0]) setSelectedId(next[0].id);
      return next;
    });

    const parts: string[] = [];
    if (good.length)
      parts.push(`Loaded ${good.length} image${good.length === 1 ? "" : "s"}.`);
    if (skippedByType) {
      parts.push(
        `Skipped ${skippedByType} non-image file${skippedByType === 1 ? "" : "s"}.`
      );
    }
    if (skippedByLimit) {
      parts.push(
        `Skipped ${skippedByLimit} image${skippedByLimit === 1 ? "" : "s"} above the ${MAX_BATCH_FILES}-file batch cap.`
      );
    }
    if (failed)
      parts.push(`Failed to preview ${failed} image${failed === 1 ? "" : "s"}.`);
    setMessage(parts.join(" "));
  }

  async function loadProductsForShop(nextShopId: string) {
    if (!connected || !nextShopId) {
      setApiProducts([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/printify/products?shopId=${encodeURIComponent(nextShopId)}`
      );
      if (!response.ok) {
        throw new Error(`Products request failed with status ${response.status}.`);
      }

      const data = await response.json();
      const mapped: Product[] = Array.isArray(data?.products)
        ? data.products.map((product: ApiProduct) => ({
            id: product.id,
            title: product.title || product.id,
            type: "Template",
            shopId: String(product.shop_id ?? nextShopId),
            description: product.description || "",
          }))
        : [];

      setApiProducts(mapped);
    } catch (error) {
      setApiProducts([]);
      const msg =
        error instanceof Error ? error.message : "Unable to load products.";
      setApiStatus(formatApiError(msg));
    }
  }

  async function connectPrintify() {
    if (!token.trim()) return;
    setLoadingApi(true);
    setApiStatus("");

    try {
      const response = await fetch("/api/printify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Connect failed with status ${response.status}.`);
      }

      const data = await response.json();
      const shopsFromApi: Shop[] = Array.isArray(data?.shops)
        ? data.shops.map((shop: ApiShop) => ({
            id: String(shop.id),
            title: shop.title || `Shop ${shop.id}`,
          }))
        : [];

      setApiShops(shopsFromApi);
      setConnected(true);
      const firstShopId = shopsFromApi[0]?.id || FALLBACK_SHOPS[0].id;
      setShopId(firstShopId);
      setApiStatus("Connected to Printify.");
      void loadProductsForShop(firstShopId);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unable to connect to Printify.";
      setConnected(false);
      setApiShops([]);
      setApiProducts([]);
      setApiStatus(formatApiError(msg));
    } finally {
      setLoadingApi(false);
    }
  }

  function disconnectPrintify() {
    setConnected(false);
    setLoadingApi(false);
    setApiStatus("");
    setApiShops([]);
    setApiProducts([]);
    setShopId("");
    setProductId("");
    setTemplate(null);
    setBatchResults([]);
    setRunStatus("");
  }

  async function loadProductTemplate() {
    const fallback = productSource.find((p) => p.id === productId);
    if (!fallback || !shopId) return;

    try {
      const response = await fetch(
        `/api/printify/product?shopId=${encodeURIComponent(
          shopId
        )}&productId=${encodeURIComponent(productId)}`
      );

      if (!response.ok) {
        throw new Error(`Product request failed with status ${response.status}.`);
      }

      const data = await response.json();
      const chosen = data?.product || fallback;
      const title = chosen?.title || fallback.title;
      const base = formatTemplateDescription(
        chosen?.description?.trim() ||
          fallback.description?.trim() ||
          `${title}. This is the base description from your saved template. Live product descriptions from Printify will replace this placeholder after API wiring.`
      );

      setTemplate({
        reference: chosen?.id || fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
      });

      setNickname(title);
      setManualRef(chosen?.id || fallback.id);
      setTemplateDescription(base);
    } catch {
      const title = fallback.title;
      const base = formatTemplateDescription(
        fallback.description?.trim() ||
          `${title}. This is the base description from your saved template. Live product descriptions from Printify will replace this placeholder after API wiring.`
      );

      setTemplate({
        reference: fallback.id,
        nickname: title,
        source: "product",
        shopId,
        description: base,
      });

      setNickname(title);
      setManualRef(fallback.id);
      setTemplateDescription(base);
    }
  }

  function loadManualTemplate() {
    const ref = normalizeRef(manualRef);
    if (!ref || !shopId) return;
    const name = safeTitle(nickname, "Template");
    const base =
      formatTemplateDescription(templateDescription.trim()) ||
      "Base description from the user template goes here until live API wiring is added.";

    setTemplate({
      reference: ref,
      nickname: name,
      source: "manual",
      shopId,
      description: base,
    });

    setNickname(name);
    setManualRef(ref);
    setTemplateDescription(base);
  }

  function saveTemplate() {
    if (!template) return;

    const nextTemplate = {
      ...template,
      nickname: safeTitle(nickname, template.nickname),
      description: templateDescription,
    };

    setTemplate(nextTemplate);
    setSaved((current) => {
      const idx = current.findIndex(
        (t) =>
          t.reference === nextTemplate.reference &&
          t.shopId === nextTemplate.shopId
      );
      if (idx === -1) return [...current, nextTemplate];
      const next = [...current];
      next[idx] = nextTemplate;
      return next;
    });
  }

  async function runDraftBatch() {
    if (!template || !shopId || images.length === 0) return;

    setIsRunningBatch(true);
    setRunStatus("");
    setBatchResults([]);

    try {
      const items = images.map((img) => {
        const description = buildDescription(img.final, templateDescription);
        const tags = buildTags(img.final, description, FIXED_TAG_COUNT);
        return {
          fileName: img.name,
          title: safeTitle(img.final, img.cleaned),
          description,
          tags,
          imageDataUrl: img.preview,
        };
      });

      const response = await fetch("/api/printify/batch-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shopId,
          templateProductId: template.reference,
          items,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Batch request failed with status ${response.status}.`);
      }

      setBatchResults(Array.isArray(data?.results) ? data.results : []);
      setRunStatus(data?.message || "Batch completed.");
    } catch (error) {
      setRunStatus(error instanceof Error ? error.message : "Batch failed.");
    } finally {
      setIsRunningBatch(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900 transition-colors dark:bg-black dark:text-slate-100 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <BrandMark />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                <span className="text-violet-600">Merch</span>
                <span className="text-slate-900 dark:text-white">Quantum</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {APP_TAGLINE}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge on={connected}>
              {connected ? "Printify connected" : "Printify not connected"}
            </Badge>
            {connected ? (
              <Button variant="secondary" onClick={disconnectPrintify}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Box title={`${PRIMARY_PLATFORM} Connection`}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Connection Method">
                  <Select disabled value="pat">
                    <option value="pat">Personal Access Token</option>
                  </Select>
                </Field>

                <Field label="Masked Preview">
                  <div className="max-w-[260px] overflow-hidden rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm whitespace-nowrap text-ellipsis dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {maskToken(token) || "No token entered"}
                  </div>
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                <Field label="Personal Access Token">
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste token once"
                  />
                </Field>

                <div className="flex items-end">
                  <Button
                    onClick={() => {
                      void connectPrintify();
                    }}
                    disabled={!token.trim() || connected || loadingApi}
                  >
                    {loadingApi ? "Connecting..." : "Connect to Printify"}
                  </Button>
                </div>
              </div>

              {apiStatus ? (
                <p className={`mt-3 text-sm ${connected ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {apiStatus}
                </p>
              ) : null}
            </Box>

            <Box title="Batch Setup">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Shop">
                  <Select
                    value={shopId}
                    onChange={(e) => {
                      const nextShopId = e.target.value;
                      setShopId(nextShopId);
                      setProductId("");
                      void loadProductsForShop(nextShopId);
                    }}
                    disabled={!connected || loadingApi}
                  >
                    <option value="">Select a shop</option>
                    {availableShops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.title}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Template Source">
                  <Select
                    value={source}
                    onChange={(e) => setSource(e.target.value as "product" | "manual")}
                  >
                    <option value="product">Choose From My Products</option>
                    <option value="manual">Paste Product Reference</option>
                  </Select>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Template Nickname">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Example: Unisex Tee Front Print"
                  />
                </Field>
              </div>

              {source === "product" ? (
                <div className="mt-4 space-y-4">
                  <Field label="Search My Products">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by title or type"
                      disabled={!connected || !shopId}
                    />
                  </Field>

                  <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-900">
                        <tr>
                          <th className="px-3 py-2 text-left">Use</th>
                          <th className="px-3 py-2 text-left">Example</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!connected || !shopId ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                              Connect to Printify and select a shop first.
                            </td>
                          </tr>
                        ) : visibleProducts.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                              No examples found.
                            </td>
                          </tr>
                        ) : (
                          visibleProducts.map((product) => (
                            <tr key={product.id} className="border-t border-slate-200 dark:border-slate-800">
                              <td className="px-3 py-2">
                                <input
                                  type="radio"
                                  name="template-product"
                                  checked={productId === product.id}
                                  onChange={() => setProductId(product.id)}
                                />
                              </td>
                              <td className="px-3 py-2">{product.title}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button onClick={loadProductTemplate} disabled={!productId || !shopId}>
                    Load Selected Template Example
                  </Button>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Paste Product Reference
                  </div>
                  <Field label="Template Product Reference">
                    <Input
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      placeholder="Paste a Printify product ID or URL"
                    />
                  </Field>
                  <Button onClick={loadManualTemplate} disabled={!manualRef.trim() || !shopId}>
                    Load Manual Template
                  </Button>
                </div>
              )}

              <div className="mt-4">
                <Field label="Template Description Source">
                  <Textarea
                    rows={8}
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="This is where the loaded template description will appear after the selected product template is loaded."
                  />
                </Field>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <b>Loaded Template:</b> {template ? template.nickname : "None loaded"}
                </div>
                {template ? (
                  <div className="mt-1 break-all text-slate-600 dark:text-slate-400">
                    {template.reference} • {template.source} • Shop {template.shopId}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Title Source">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    Filename Required
                  </div>
                </Field>

                <Field label="Description Mode">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    Title Assisted
                  </div>
                </Field>

                <Field label="Tags">
                  <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    13 from Title + Description
                  </div>
                </Field>
              </div>
            </Box>

            <Box title="Image Upload">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void addFiles(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
                  className="hidden"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl dark:bg-slate-900">
                  🖼️
                </div>
                <p className="mt-4 font-medium">Drop images here or click to upload</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  File titles drive the listing title. Current prototype cap: {MAX_BATCH_FILES} images per batch.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => fileRef.current?.click()}>Add Images</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setImages([]);
                    setSelectedId("");
                    setMessage("");
                  }}
                  disabled={!images.length}
                >
                  Clear All
                </Button>
                <Badge>{images.length}/{MAX_BATCH_FILES}</Badge>
              </div>

              {message ? (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{message}</p>
              ) : null}
            </Box>

            <Box title="Batch Preview">
              <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-left">Preview</th>
                      <th className="px-3 py-2 text-left">Filename</th>
                      <th className="px-3 py-2 text-left">Suggested Title</th>
                      <th className="px-3 py-2 text-left">Final Title</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {images.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400">
                          No images loaded yet.
                        </td>
                      </tr>
                    ) : (
                      images.map((img) => (
                        <tr
                          key={img.id}
                          className={`border-t border-slate-200 dark:border-slate-800 ${selectedImage?.id === img.id ? "bg-slate-50 dark:bg-slate-900" : ""}`}
                          onClick={() => setSelectedId(img.id)}
                        >
                          <td className="px-3 py-2">
                            {img.preview ? (
                              <img
                                src={img.preview}
                                alt={safeTitle(img.final, img.cleaned)}
                                className="h-16 w-16 rounded-lg border border-slate-200 object-contain bg-white dark:border-slate-800 dark:bg-slate-950"
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs dark:border-slate-800 dark:bg-slate-900">
                                No Preview
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                            {img.name}
                          </td>
                          <td className="px-3 py-2 font-medium">{img.cleaned}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-2">
                              <Input
                                value={img.final}
                                onChange={(e) =>
                                  setImages((current) =>
                                    current.map((x) =>
                                      x.id === img.id
                                        ? { ...x, final: e.target.value }
                                        : x
                                    )
                                  )
                                }
                                onBlur={() =>
                                  setImages((current) =>
                                    current.map((x) =>
                                      x.id === img.id
                                        ? { ...x, final: safeTitle(x.final, x.cleaned) }
                                        : x
                                    )
                                  )
                                }
                              />
                              <Button
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImages((current) =>
                                    current.map((x) =>
                                      x.id === img.id ? { ...x, final: x.cleaned } : x
                                    )
                                  );
                                }}
                              >
                                Use Suggested
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setImages((current) =>
                                  current.filter((x) => x.id !== img.id)
                                );
                                if (selectedId === img.id) setSelectedId("");
                              }}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Box>
          </div>

          <div className="space-y-6">
            <Box title="Listing Content Preview">
              {!selectedImage ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Select or upload an image to preview title, description, and tags.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex h-64 w-full items-center justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    {selectedImage.preview ? (
                      <img
                        src={selectedImage.preview}
                        alt={safeTitle(selectedImage.final, selectedImage.cleaned)}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : null}
                  </div>

                  <Field label="Title">
                    <Input
                      value={selectedImage.final}
                      onChange={(e) =>
                        setImages((current) =>
                          current.map((x) =>
                            x.id === selectedImage.id
                              ? { ...x, final: e.target.value }
                              : x
                          )
                        )
                      }
                    />
                  </Field>

                  <Field label="Description">
                    <Textarea rows={16} value={previewDescription} readOnly />
                  </Field>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {previewTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Box>

            <Box title="Run Summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Shop
                  </div>
                  <div className="mt-1 font-medium">
                    {availableShops.find((s) => s.id === shopId)?.title ||
                      "None selected"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Loaded Template
                  </div>
                  <div className="mt-1 font-medium">
                    {template?.nickname || "None loaded"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Description
                  </div>
                  <div className="mt-1 font-medium">Title Assisted</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Tags
                  </div>
                  <div className="mt-1 font-medium">
                    From Title + Description (13)
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                The main button creates products in Printify and also sends a publish request when the connected sales channel supports it.
              </div>

              <div className="mt-4">
                <Button
                  className="w-full"
                  disabled={!connected || !template || images.length === 0 || isRunningBatch}
                  onClick={() => {
                    void runDraftBatch();
                  }}
                >
                  {isRunningBatch ? "Creating Products..." : "Create Products"}
                </Button>
              </div>

              {runStatus ? (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{runStatus}</p>
              ) : null}

              {batchResults.length > 0 ? (
                <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
                  {batchResults.map((result) => (
                    <div key={`${result.fileName}-${result.title}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="font-medium">{result.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{result.fileName}</div>
                      <div className="mt-1 text-sm">{result.message}</div>
                      {result.productId ? (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Product ID: {result.productId}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Box>

            <Box title="Saved Templates">
              {saved.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No saved templates yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {saved.map((t) => (
                    <div
                      key={`${t.shopId}:${t.reference}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{t.nickname}</div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {t.reference}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setTemplate(t);
                          setShopId(t.shopId);
                          setNickname(t.nickname);
                          setManualRef(t.reference);
                          setSource(t.source);
                          setTemplateDescription(t.description);
                        }}
                      >
                        Use
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <Button
                  variant="secondary"
                  onClick={saveTemplate}
                  disabled={!template}
                >
                  Save Loaded Template
                </Button>
              </div>
            </Box>
          </div>
        </div>
      </div>
    </div>
  );
}
