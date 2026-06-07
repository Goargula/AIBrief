export const FILTER_CATEGORIES = new Set(["funding", "models", "papers", "pushback", "general"]);

function storySearchText(item = {}) {
  return [
    item.title,
    item.summary,
    item.fullSummary,
    item.sourceName,
    item.lane,
    ...(Array.isArray(item.keyFacts) ? item.keyFacts : []),
    ...(Array.isArray(item.relatedSources) ? item.relatedSources : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function inferFilterCategory(item = {}) {
  const text = storySearchText(item);
  const headlineText = [
    item.title,
    ...(Array.isArray(item.keyFacts) ? item.keyFacts : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const titleText = String(item.title || "").toLowerCase();
  const isModelRelease =
    !/\bmodel context protocol\b/.test(text) &&
    (/\b(model release|released|launch(?:ed|es)?|ship(?:ped|s)?|unveil(?:ed|s)?|debut(?:ed|s)?|introduc(?:ed|es)|preview|open-weight|checkpoint|access)\b/.test(titleText) ||
      /\b(open-weight|checkpoint|model release)\b/.test(text)) &&
    /\b(model|gpt|claude|gemini|llama|mistral|deepseek|qwen|grok|holo|mai-|weathermesh|diffusion|embedding|reasoning|audio|video|image)\b/.test(headlineText);
  const isResearchArtifact =
    item.lane === "papers" ||
    /\b(arxiv|preprint|research paper|technical report|benchmark|dataset|evaluation method|empirical (?:study|analysis|report)|peer-reviewed|journal article)\b/.test(text);
  const isDirectPushback =
    /\b(pushback|backlash|lawsuit|sued|sues|ban|banned|blocked|protest|opposition|criticism|criticized|copyright complaint|privacy complaint|security risk|moratorium|strike|layoff|job loss|environmental harm|unauthorized|takedown|warning|warns|danger|harm|abuse|threat|pause)\b/.test(headlineText);
  const isRestrictivePolicy =
    /\b(regulation|regulator|law|rule|oversight|guardrail|requirement|mandate)\b/.test(headlineText) &&
    /\b(restrict|limit|control|block|ban|require|mandate|crackdown|penalty|enforcement|pre-approval)\b/.test(text);
  const isExploratoryPublicOwnership =
    /\b(government|public|president|white house|administration|state)\b/.test(text) &&
    /\b(proposal|proposes|proposed|floats|may|might|consider|discuss|exploratory)\b/.test(text) &&
    /\b(stake|ownership|investment|invest)\b/.test(text);

  if (
    !isExploratoryPublicOwnership &&
    /\b(raised|raises|funding|funded|series [a-z]|seed round|venture|valuation|invested|investment|acquire|acquires|acquired|acquisition|merger|m&a|ipo|initial public offering|public listing|going public)\b/.test(text)
  ) {
    return "funding";
  }

  if (isModelRelease) return "models";
  if (isResearchArtifact) return "papers";
  if (isDirectPushback || isRestrictivePolicy) return "pushback";
  return "general";
}

export function normalizeFilterCategory(value, item = {}) {
  return FILTER_CATEGORIES.has(value) ? value : inferFilterCategory(item);
}

export function storyFilterType(item = {}) {
  return normalizeFilterCategory(item.filterCategory, item);
}
