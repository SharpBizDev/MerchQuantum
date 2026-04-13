export type DemoListing = {
  id: string;
  name: string;
  label: string;
  preview: string;
  previewBackground: string;
  svgMarkup: string;
  title: string;
  description: string;
  tags: string[];
};

export type DemoShopOption = {
  id: string;
  label: string;
};

const DEMO_SPEC_BLOCK = [
  "Classic Tee Demo Specs",
  "- Unisex everyday fit with a clean front-print presentation",
  "- Soft cotton feel built for comfortable daily wear",
  "- Ribbed collar and taped shoulder seams for structure",
  "- Print-ready layout suited for store demos and draft previews",
].join("\n");

function toDataUrl(svgMarkup: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`;
}

function buildDescription(paragraphOne: string, paragraphTwo: string) {
  return `${paragraphOne}\n\n${paragraphTwo}\n\n${DEMO_SPEC_BLOCK}`;
}

function createDemoListing(config: {
  id: string;
  name: string;
  label: string;
  previewBackground: string;
  title: string;
  paragraphOne: string;
  paragraphTwo: string;
  tags: string[];
  svgMarkup: string;
}): DemoListing {
  return {
    id: config.id,
    name: config.name,
    label: config.label,
    previewBackground: config.previewBackground,
    title: config.title,
    description: buildDescription(config.paragraphOne, config.paragraphTwo),
    tags: config.tags,
    svgMarkup: config.svgMarkup,
    preview: toDataUrl(config.svgMarkup),
  };
}

export const DEMO_LISTINGS: DemoListing[] = [
  createDemoListing({
    id: "retro-peace",
    name: "Retro Peace Sign Demo.svg",
    label: "Peace",
    previewBackground: "#000000",
    title: "Retro Peace Sign Graphic Tee with Vintage Festival Energy",
    paragraphOne: "This retro peace sign design gives the listing an instantly readable message with warm sunset color, laid-back nostalgia, and clean festival-ready styling that feels easy to wear.",
    paragraphTwo: "It works well for shoppers looking for vintage-inspired graphics, boho outfit pieces, and casual statement tees that pair strong symbolism with approachable everyday color.",
    tags: ["retro peace sign", "festival shirt", "boho tee", "vintage graphic", "hippie style", "sunset tee", "peace symbol", "casual statement", "gift for her", "gift for him", "music fest", "laid back style", "unisex tee"],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g fill="none" fill-rule="evenodd"><circle cx="120" cy="120" r="74" fill="#F59E0B"/><circle cx="120" cy="120" r="56" fill="#FB7185"/><circle cx="120" cy="120" r="54" stroke="#FFFFFF" stroke-width="12"/><path d="M120 66v108M120 120l-34 42M120 120l34 42" stroke="#FFFFFF" stroke-linecap="round" stroke-width="12"/><path d="M54 86h18M168 86h18M42 120h20M178 120h20M52 154h18M170 154h18" stroke="#FDE68A" stroke-linecap="round" stroke-width="8"/></g></svg>`,
  }),
  createDemoListing({
    id: "atomic-orbit",
    name: "Atomic Symbol Demo.svg",
    label: "Atomic",
    previewBackground: "#FFFFFF",
    title: "Minimal Atomic Symbol STEM Graphic Tee for Science Fans",
    paragraphOne: "This atomic symbol demo shows how MerchQuantum can turn a clean, minimalist science graphic into focused buyer-facing copy that still feels specific, modern, and merch-ready.",
    paragraphTwo: "The result fits STEM gifts, classroom style, lab humor, and everyday nerd-culture storefronts where shoppers want something sharp, readable, and easy to style.",
    tags: ["atomic symbol", "science shirt", "stem tee", "chemist gift", "physics tee", "minimal graphic", "science lover", "lab style", "teacher gift", "geek apparel", "clean design", "nerd shirt", "unisex science tee"],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g fill="none" fill-rule="evenodd"><circle cx="120" cy="120" r="12" fill="#111827"/><ellipse cx="120" cy="120" rx="74" ry="26" stroke="#111827" stroke-width="8"/><ellipse cx="120" cy="120" rx="74" ry="26" stroke="#111827" stroke-width="8" transform="rotate(60 120 120)"/><ellipse cx="120" cy="120" rx="74" ry="26" stroke="#111827" stroke-width="8" transform="rotate(-60 120 120)"/><circle cx="190" cy="124" r="9" fill="#2563EB"/><circle cx="74" cy="60" r="9" fill="#2563EB"/><circle cx="90" cy="180" r="9" fill="#2563EB"/></g></svg>`,
  }),
  createDemoListing({
    id: "arcade-joystick",
    name: "Arcade Joystick Demo.svg",
    label: "Arcade",
    previewBackground: "#000000",
    title: "Classic Arcade Joystick Graphic Tee with Retro Gamer Style",
    paragraphOne: "This arcade-inspired demo design gives the app a bold gaming signal right away, letting the listing copy lean into retro joystick culture, neon contrast, and instant pixel-era recognition.",
    paragraphTwo: "It reads well for gamer gift shops, convention drops, streamer-adjacent apparel, and nostalgic storefronts that need a clear, marketable title without losing the fun of the art.",
    tags: ["arcade shirt", "retro gamer tee", "joystick graphic", "pixel style", "gaming gift", "neon arcade", "classic gamer", "vintage gaming", "player one tee", "console nostalgia", "unisex gamer", "arcade fan", "gaming apparel"],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g fill="none" fill-rule="evenodd"><rect x="52" y="122" width="136" height="54" rx="22" fill="#0F172A" stroke="#38BDF8" stroke-width="8"/><path d="M106 130l10-38c1-6 6-10 12-10s11 4 12 10l10 38" stroke="#FFFFFF" stroke-linecap="round" stroke-width="10"/><circle cx="120" cy="84" r="16" fill="#F43F5E"/><circle cx="158" cy="146" r="10" fill="#F59E0B"/><circle cx="134" cy="156" r="10" fill="#22C55E"/><path d="M78 146h30M93 131v30" stroke="#FFFFFF" stroke-linecap="round" stroke-width="10"/></g></svg>`,
  }),
  createDemoListing({
    id: "summit-badge",
    name: "Summit Badge Demo.svg",
    label: "Summit",
    previewBackground: "#FFFFFF",
    title: "Mountain Sunrise Badge Graphic Tee for Outdoors and Trail Life",
    paragraphOne: "This outdoors badge demo gives MerchQuantum a clear lifestyle story to work with, pairing layered mountains, sunrise color, and a simple crest shape that translates smoothly into a believable product listing.",
    paragraphTwo: "It feels right for hiking shops, camp gifts, travel-themed apparel, and everyday adventure branding where the art needs to read as clean, giftable, and easy to merchandise.",
    tags: ["mountain shirt", "hiking tee", "outdoors graphic", "sunrise badge", "trail life shirt", "camp gift", "nature tee", "adventure apparel", "travel shirt", "summit design", "unisex outdoor tee", "weekend hiking", "mountain gift"],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g fill="none" fill-rule="evenodd"><path d="M120 28l76 42v56c0 44-28 78-76 92-48-14-76-48-76-92V70l76-42z" fill="#E2E8F0" stroke="#0F172A" stroke-width="8"/><circle cx="120" cy="92" r="26" fill="#F59E0B"/><path d="M68 160l36-46 20 24 20-30 28 52H68z" fill="#166534"/><path d="M84 160l28-34 14 18 14-20 16 36H84z" fill="#0F766E"/></g></svg>`,
  }),
  createDemoListing({
    id: "faith-anchor",
    name: "Faith Anchor Demo.svg",
    label: "Faith",
    previewBackground: "#000000",
    title: "Faith Anchor Script Graphic Tee with Clean Inspirational Style",
    paragraphOne: "This faith-forward demo uses a simple anchor and script pairing that gives the listing a readable inspirational message, polished contrast, and a clear niche without tipping into clutter or overclaiming.",
    paragraphTwo: "It fits church event merchandise, encouragement gifts, and boutique faith apparel where buyers respond to calm symbolism, graceful lettering, and an easy-to-style unisex tee format.",
    tags: ["faith shirt", "anchor tee", "inspirational graphic", "church shirt", "hope design", "christian apparel", "encouragement gift", "script graphic", "boutique tee", "faith gift", "calm style", "clean typography", "unisex faith tee"],
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g fill="none" fill-rule="evenodd"><path d="M120 56v96M92 164c0 18 12 30 28 30s28-12 28-30M70 144c0 26 20 48 50 48s50-22 50-48" stroke="#FFFFFF" stroke-linecap="round" stroke-width="10"/><circle cx="120" cy="42" r="14" fill="#FFFFFF"/><path d="M74 152H48M192 152h-26" stroke="#FFFFFF" stroke-linecap="round" stroke-width="10"/><path d="M70 78c16-8 32-12 50-12 28 0 48 10 64 28" stroke="#A78BFA" stroke-linecap="round" stroke-width="8"/></g></svg>`,
  }),
];

export const DEMO_SHOPS: DemoShopOption[] = [
  { id: "etsy", label: "Your Etsy Shop" },
  { id: "amazon", label: "Your Amazon Store" },
  { id: "ebay", label: "Your eBay Store" },
  { id: "walmart", label: "Your Walmart Store" },
  { id: "shopify", label: "Your Shopify Store" },
];
