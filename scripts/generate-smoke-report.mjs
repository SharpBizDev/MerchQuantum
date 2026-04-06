import fs from "node:fs/promises";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    args[key] = value;
    index += 1;
  }

  return args;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function summarizeProviderCoverage(passNames) {
  const notes = [];

  if (passNames.some((name) => /registry exposes printify/i.test(name))) {
    notes.push("Provider registry and activation-state coverage is present.");
  }

  if (passNames.some((name) => /hosted artwork bridge/i.test(name))) {
    notes.push("Hosted-artwork bridge behavior is exercised in smoke coverage.");
  }

  if (passNames.some((name) => /printify adapter/i.test(name)) && passNames.some((name) => /printful adapter/i.test(name))) {
    notes.push("Primary store-template draft adapters are covered for Printify and Printful.");
  }

  if (passNames.some((name) => /gooten adapter/i.test(name)) || passNames.some((name) => /apliiq adapter/i.test(name))) {
    notes.push("Secondary provider adapters are covered beyond the Printify-first baseline.");
  }

  if (passNames.some((name) => /prodigi adapter/i.test(name))) {
    notes.push("Order-first Prodigi adapter coverage exists, even though storefront listing remains unsupported.");
  }

  if (passNames.some((name) => /spod adapter/i.test(name))) {
    notes.push("SPOD / Spreadconnect draft article flow is included in smoke coverage.");
  }

  return notes;
}

function summarizeAiCoverage(passNames) {
  const notes = [];

  if (passNames.some((name) => /image-backed golden corpus/i.test(name))) {
    notes.push("Image-backed golden corpus regression coverage is active in the smoke layer.");
  }

  if (passNames.some((name) => /backward compatible/i.test(name))) {
    notes.push("The locked AI route contract is still guarded by the smoke suite.");
  }

  if (passNames.some((name) => /retry ladder/i.test(name))) {
    notes.push("Gemini retry-vs-fallback behavior is covered.");
  }

  if (passNames.some((name) => /complete sentence endings|finished sentences/i.test(name))) {
    notes.push("Lead paragraph finalization and clipped-sentence regressions are covered.");
  }

  if (passNames.some((name) => /filters unsupported compliance flags|reason/i.test(name))) {
    notes.push("Reason-flag and compliance-noise regressions have focused smoke coverage.");
  }

  if (passNames.some((name) => /template-aware second paragraph varies/i.test(name))) {
    notes.push("Paragraph-2 repetition and template-aware variety checks are present.");
  }

  return notes;
}

function buildRegressionNotes(providerSummary, aiSummary) {
  const notes = [];

  if (aiSummary.passNames.some((name) => /image-backed golden corpus/i.test(name))) {
    notes.push("Weak-output guardrail: AI smoke includes real fixture-image regression coverage instead of synthetic-only checks.");
  } else {
    notes.push("AI weak-output note: no golden-corpus signal was detected in the current run output.");
  }

  if (aiSummary.passNames.some((name) => /cropped|OCR\/text legibility|weak filename|conflict/i.test(name))) {
    notes.push("Regression-sensitive AI cases include filename conflict, cropped/weak OCR, and low-confidence visual interpretation.");
  } else {
    notes.push("Regression-sensitive AI detail is limited by current test output; richer weak-output notes will need more explicit emitted metadata later.");
  }

  if (providerSummary.passNames.length > 0) {
    notes.push("Provider smoke currently verifies adapter/contract behavior, not full live provider account execution.");
  }

  notes.push("Run-to-run delta comparison is not wired yet; this artifact captures a clean current-run schema for later historical comparison.");

  return notes;
}

function parseSuiteLog({ name, content, stepOutcome, completionMarker, coverageBuilder }) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const passNames = lines
    .filter((line) => line.startsWith("PASS "))
    .map((line) => line.slice(5).trim());

  const failureHints = unique(
    lines.filter(
      (line) =>
        /(^FAIL\b)|AssertionError|ERR_|Error:|TypeError:|ReferenceError:|SyntaxError:/i.test(line) &&
        !line.startsWith("PASS ")
    )
  );

  const complete = completionMarker ? content.includes(completionMarker) : false;
  const status =
    stepOutcome === "success"
      ? "passed"
      : stepOutcome === "failure"
        ? "failed"
        : stepOutcome === "cancelled"
          ? "cancelled"
          : complete && failureHints.length === 0
            ? "passed"
            : "unknown";

  return {
    suite: name,
    status,
    stepOutcome: stepOutcome || "unknown",
    passCount: passNames.length,
    passNames,
    failureHints,
    complete,
    notableCoverage: coverageBuilder(passNames),
    limitations: [
      "Current suite output is line-oriented pass/fail text, so richer case-level metrics will need explicit structured test emission later.",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args["provider-log"] || !args["ai-log"] || !args.output) {
    throw new Error("Expected --provider-log, --ai-log, and --output arguments.");
  }

  const [providerLog, aiLog] = await Promise.all([
    fs.readFile(args["provider-log"], "utf8").catch(() => ""),
    fs.readFile(args["ai-log"], "utf8").catch(() => ""),
  ]);

  const providerSummary = parseSuiteLog({
    name: "provider",
    content: providerLog,
    stepOutcome: process.env.PROVIDER_SMOKE_OUTCOME,
    completionMarker: "provider-core tests passed",
    coverageBuilder: summarizeProviderCoverage,
  });

  const aiSummary = parseSuiteLog({
    name: "ai",
    content: aiLog,
    stepOutcome: process.env.AI_SMOKE_OUTCOME,
    completionMarker: "listing-engine tests passed",
    coverageBuilder: summarizeAiCoverage,
  });

  const overallStatus =
    [process.env.INSTALL_OUTCOME, process.env.TYPECHECK_OUTCOME, process.env.BUILD_OUTCOME, providerSummary.stepOutcome, aiSummary.stepOutcome]
      .filter(Boolean)
      .every((outcome) => outcome === "success")
      ? "passed"
      : "attention_required";

  const report = {
    generatedAt: new Date().toISOString(),
    workflow: {
      name: "merchquantum-smoke",
      event: process.env.GITHUB_EVENT_NAME || null,
      ref: process.env.GITHUB_REF || null,
      commitSha: process.env.GITHUB_SHA || null,
      runId: process.env.GITHUB_RUN_ID || null,
    },
    install: {
      outcome: process.env.INSTALL_OUTCOME || "unknown",
    },
    typecheck: {
      outcome: process.env.TYPECHECK_OUTCOME || "unknown",
    },
    build: {
      outcome: process.env.BUILD_OUTCOME || "unknown",
    },
    suites: {
      provider: providerSummary,
      ai: aiSummary,
    },
    regressionNotes: buildRegressionNotes(providerSummary, aiSummary),
    delta: {
      available: false,
      reason: "Historical smoke artifacts are not wired into this workflow yet.",
      suggestedFutureKeys: ["commitSha", "overallStatus", "provider.passCount", "ai.passCount", "regressionNotes"],
    },
    overallStatus,
  };

  await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
