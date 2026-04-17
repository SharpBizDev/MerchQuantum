export type GoldenCorpusFixture = {
  name: string;
  imageFile: string;
  request: {
    fileName: string;
    title: string;
    productFamily: string;
    templateContext?: string;
  };
  payloadOverrides: Record<string, any>;
  expected: {
    grade: "green" | "red";
    titleMustInclude: string[];
    titleMustExclude?: string[];
    leadMustInclude?: string[];
    reasonIncludes?: string[];
    filename: {
      classification: "strong_support" | "partial_support" | "weak_or_generic" | "conflicting";
      shouldIgnore: boolean;
      conflictSeverity: "none" | "low" | "medium" | "high";
    };
  };
};

export const GOLDEN_CORPUS_FIXTURES: GoldenCorpusFixture[] = [
  {
    name: "readable design plus useless filename",
    imageFile: "readable-faith-slogan.png",
    request: {
      fileName: "IMG_2044_final.png",
      title: "",
      productFamily: "t-shirt",
      templateContext: "Heavyweight cotton with shoulder taping.",
    },
    payloadOverrides: {},
    expected: {
      grade: "green",
      titleMustInclude: ["Faith Over Fear"],
      filename: {
        classification: "weak_or_generic",
        shouldIgnore: true,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "useful filename plus weak image",
    imageFile: "weak-mountain-art.png",
    request: {
      fileName: "mountain_adventure_outdoors_hiking.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: [],
        visibleFacts: ["small low-contrast mountain line art"],
        inferredMeaning: ["outdoor adventure"],
        dominantTheme: "outdoor adventure",
        likelyAudience: "hiking fans",
        likelyOccasion: "trail trips",
        uncertainty: ["Visible text is too faint to confirm."],
        ocrWeakness: "weak contrast",
        meaningClarity: 0.62,
        hasReadableText: false,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Mountain Adventure Hiking Tee",
        benefitCore: "Outdoor-themed merch copy for hiking buyers.",
        likelyAudience: "hiking fans",
        styleOccasion: "trail trips",
        visibleKeywords: ["mountain line art"],
        inferredKeywords: ["hiking shirt", "outdoor gift"],
        forbiddenClaims: [],
      },
      marketplaceDrafts: {
        etsy: {
          title: "Mountain Adventure Hiking Tee",
          leadParagraphs: [
            "Outdoor-focused design for trail-minded shoppers and gift-ready discovery.",
            "Built to pair with factual template details instead of hype-heavy copy.",
          ],
          discoveryTerms: ["hiking shirt", "mountain tee", "outdoor gift", "trail style", "nature design"],
        },
      },
      validator: { grade: "green", confidence: 0.67, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Mountain Adventure Hiking Tee",
      canonicalLeadParagraphs: [
        "Outdoor-focused design for trail-minded shoppers and gift-ready discovery.",
        "Built to pair with factual template details instead of hype-heavy copy.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Mountain Adventure"],
      leadMustInclude: ["Outdoor-focused design"],
      reasonIncludes: ["OCR/text legibility"],
      filename: {
        classification: "partial_support",
        shouldIgnore: false,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "transparent png weak contrast",
    imageFile: "transparent-weak-contrast.png",
    request: {
      fileName: "transparent-motivational-design.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: ["be kind"],
        visibleFacts: ["thin white text on transparent background"],
        inferredMeaning: ["minimal encouragement"],
        dominantTheme: "minimal encouragement",
        likelyAudience: "gift shoppers",
        likelyOccasion: "everyday wear",
        uncertainty: ["Thin strokes reduce OCR certainty."],
        ocrWeakness: "weak contrast on transparent background",
        meaningClarity: 0.58,
        hasReadableText: true,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Be Kind Minimal Graphic Tee",
        benefitCore: "Minimal encouragement messaging for gift-ready discovery.",
        likelyAudience: "gift shoppers",
        styleOccasion: "everyday wear",
        visibleKeywords: ["be kind", "minimal design"],
        inferredKeywords: ["encouragement shirt", "simple gift"],
        forbiddenClaims: [],
      },
      validator: { grade: "green", confidence: 0.63, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Be Kind Minimal Graphic Tee",
      canonicalLeadParagraphs: [
        "Minimal encouragement styling keeps the message readable without overloading the listing.",
        "Use template facts below to support the product details cleanly.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Be Kind"],
      reasonIncludes: ["OCR/text legibility"],
      filename: {
        classification: "weak_or_generic",
        shouldIgnore: true,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "partial cropped slogan",
    imageFile: "cropped-faith-slogan.png",
    request: {
      fileName: "cropped-faith-message.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: ["faith ov"],
        visibleFacts: ["cropped slogan on transparent artwork"],
        inferredMeaning: ["faith-forward message"],
        dominantTheme: "faith-forward",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "daily wear",
        uncertainty: ["Visible slogan appears cropped."],
        ocrWeakness: "partial cropped text",
        meaningClarity: 0.49,
        hasReadableText: true,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Faith Message Graphic Tee",
        benefitCore: "Faith-forward copy with cautious wording because the slogan is incomplete.",
        likelyAudience: "faith-based buyers",
        styleOccasion: "faith-forward",
        visibleKeywords: ["faith ov", "cropped slogan"],
        inferredKeywords: ["faith shirt", "christian tee"],
        forbiddenClaims: [],
      },
      validator: { grade: "green", confidence: 0.56, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Faith Message Graphic Tee",
      canonicalLeadParagraphs: [
        "Faith-forward styling is clear, but the cropped slogan means this listing should stay cautious.",
        "Keep the opening copy buyer-friendly, then rely on template facts below for hard details.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Faith Message"],
      reasonIncludes: ["cropped"],
      filename: {
        classification: "strong_support",
        shouldIgnore: false,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "filename conflict with visible text",
    imageFile: "faith-visible-filename-conflict.png",
    request: {
      fileName: "cat_mom_gift_meow_love.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: ["jesus saves"],
        visibleFacts: ["bold faith slogan"],
        inferredMeaning: ["faith-forward"],
        dominantTheme: "faith-forward",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "daily wear",
        uncertainty: [],
        ocrWeakness: "none",
        meaningClarity: 0.88,
        hasReadableText: true,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Jesus Saves Faith Graphic Tee",
        benefitCore: "Readable faith slogan for gift-ready apparel listings.",
        likelyAudience: "faith-based buyers",
        styleOccasion: "faith-forward",
        visibleKeywords: ["jesus saves"],
        inferredKeywords: ["faith shirt", "christian tee"],
        forbiddenClaims: [],
      },
      validator: { grade: "green", confidence: 0.74, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Jesus Saves Faith Graphic Tee",
      canonicalLeadParagraphs: [
        "Bold faith-forward messaging keeps the visible slogan clear for shoppers.",
        "The opening copy stays aligned to the artwork instead of the conflicting filename.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Jesus Saves"],
      titleMustExclude: ["Cat", "Mom", "Meow"],
      reasonIncludes: ["Filename"],
      filename: {
        classification: "conflicting",
        shouldIgnore: true,
        conflictSeverity: "high",
      },
    },
  },
  {
    name: "text only design",
    imageFile: "text-only-blessed.png",
    request: {
      fileName: "blessed-script-clean.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: ["blessed"],
        visibleFacts: ["single bold blessed wordmark"],
        inferredMeaning: ["faith-forward"],
        dominantTheme: "faith-forward",
        likelyAudience: "faith-based buyers",
        likelyOccasion: "daily wear",
        uncertainty: [],
        ocrWeakness: "none",
        meaningClarity: 0.86,
        hasReadableText: true,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Blessed Faith Graphic Tee",
        benefitCore: "Simple readable faith message for gift-ready discovery.",
        likelyAudience: "faith-based buyers",
        styleOccasion: "faith-forward",
        visibleKeywords: ["blessed"],
        inferredKeywords: ["faith shirt", "christian gift"],
        forbiddenClaims: [],
      },
      validator: { grade: "green", confidence: 0.86, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Blessed Faith Graphic Tee",
      canonicalLeadParagraphs: [
        "Simple readable faith styling helps the message land quickly for shoppers.",
        "Use the supporting template facts below instead of stuffing the opening copy.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Blessed"],
      filename: {
        classification: "strong_support",
        shouldIgnore: false,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "image only design",
    imageFile: "image-only-palm.png",
    request: {
      fileName: "sunset-palm-beach-art.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: [],
        visibleFacts: ["sunset palm silhouette"],
        inferredMeaning: ["beach lifestyle", "summer gift"],
        dominantTheme: "beach lifestyle",
        likelyAudience: "vacation shoppers",
        likelyOccasion: "summer wear",
        uncertainty: ["No readable text appears in the design."],
        ocrWeakness: "text-free artwork",
        meaningClarity: 0.66,
        hasReadableText: false,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Sunset Palm Beach Graphic Tee",
        benefitCore: "Image-led summer styling for vacation-ready discovery.",
        likelyAudience: "vacation shoppers",
        styleOccasion: "summer wear",
        visibleKeywords: ["sunset palm silhouette"],
        inferredKeywords: ["beach shirt", "summer gift"],
        forbiddenClaims: [],
      },
      validator: { grade: "green", confidence: 0.7, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Sunset Palm Beach Graphic Tee",
      canonicalLeadParagraphs: [
        "Image-led summer styling gives this listing a clean beach-lifestyle angle.",
        "The design reads clearly even without text, but still benefits from cautious copy framing.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Sunset Palm"],
      filename: {
        classification: "partial_support",
        shouldIgnore: false,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "minimal design",
    imageFile: "minimal-dot.png",
    request: {
      fileName: "minimal-dot-mark.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: [],
        visibleFacts: ["single small dot mark"],
        inferredMeaning: ["minimal abstract design"],
        dominantTheme: "minimal",
        likelyAudience: "general audience",
        likelyOccasion: "everyday wear",
        uncertainty: ["Design meaning is extremely minimal."],
        ocrWeakness: "no readable text",
        meaningClarity: 0.31,
        hasReadableText: false,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Minimal Abstract Graphic Tee",
        benefitCore: "Ultra-minimal design with limited semantic specificity.",
        likelyAudience: "general audience",
        styleOccasion: "minimal",
        visibleKeywords: ["single small dot mark"],
        inferredKeywords: ["minimal shirt"],
        forbiddenClaims: [],
      },
      validator: { grade: "red", confidence: 0.33, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Minimal Abstract Graphic Tee",
      canonicalLeadParagraphs: [
        "The visual is extremely minimal, so the listing should stay cautious.",
        "More caution is needed before this should be treated as a strong ready state.",
      ],
    },
    expected: {
      grade: "red",
      titleMustInclude: ["Minimal"],
      reasonIncludes: ["minimal"],
      filename: {
        classification: "partial_support",
        shouldIgnore: false,
        conflictSeverity: "none",
      },
    },
  },
  {
    name: "visually weak low information design",
    imageFile: "low-information-mark.png",
    request: {
      fileName: "quiet-soft-mark-abstract.png",
      title: "",
      productFamily: "t-shirt",
    },
    payloadOverrides: {
      imageTruth: {
        visibleText: [],
        visibleFacts: ["faint abstract mark with low contrast"],
        inferredMeaning: ["abstract design"],
        dominantTheme: "minimal",
        likelyAudience: "general audience",
        likelyOccasion: "everyday wear",
        uncertainty: ["The visual is low-information and semantically weak."],
        ocrWeakness: "no readable text",
        meaningClarity: 0.38,
        hasReadableText: false,
      },
      semanticRecord: {
        productNoun: "graphic tee",
        titleCore: "Abstract Mark Graphic Tee",
        benefitCore: "Low-information abstract design with limited buyer-intent clarity.",
        likelyAudience: "general audience",
        styleOccasion: "minimal",
        visibleKeywords: ["abstract mark"],
        inferredKeywords: ["abstract tee"],
        forbiddenClaims: [],
      },
      validator: { grade: "green", confidence: 0.42, reasonFlags: [], complianceFlags: [], reasonDetails: [] },
      canonicalTitle: "Abstract Mark Graphic Tee",
      canonicalLeadParagraphs: [
        "The visual is quiet and abstract, so the listing needs a cautious tone.",
        "Extra caution is recommended before treating this as a strong ready-to-publish draft.",
      ],
    },
    expected: {
      grade: "green",
      titleMustInclude: ["Abstract Mark"],
      reasonIncludes: ["low-information"],
      filename: {
        classification: "partial_support",
        shouldIgnore: false,
        conflictSeverity: "none",
      },
    },
  },
];
