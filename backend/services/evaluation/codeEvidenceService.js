const { clamp } = require('../utils/textUtils');

const CLAIM_STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'another', 'because', 'before', 'being', 'between', 'could',
  'course', 'data', 'details', 'during', 'each', 'from', 'have', 'into', 'itself', 'milestone', 'more',
  'notes', 'project', 'results', 'should', 'submission', 'student', 'system', 'their', 'there', 'these',
  'those', 'using', 'with', 'without', 'would', 'your', 'ours', 'theirs', 'this', 'that', 'they', 'them',
  'been', 'were', 'when', 'where', 'what', 'which', 'will', 'shall', 'can', 'cant', 'dont', 'didnt',
]);

const sanitizeCodeSnippets = (codeSnippets = []) => {
  if (!Array.isArray(codeSnippets)) return [];

  return codeSnippets
    .map((item, index) => {
      const fileName = String(item?.file_name || item?.fileName || item?.name || `file_${index + 1}`)
        .trim()
        .slice(0, 200);
      const content = String(item?.content || '').slice(0, 2500);
      return {
        fileName,
        content,
        charCount: content.length,
        lineCount: content ? content.split(/\r?\n/).length : 0,
      };
    })
    .filter((item) => item.content.length > 0)
    .slice(0, 6);
};

const extractClaimTerms = (text = '') => {
  const tokens = String(text)
    .toLowerCase()
    .match(/[a-z_][a-z0-9_]{3,}/g) || [];

  const unique = [];
  for (const token of tokens) {
    if (CLAIM_STOP_WORDS.has(token)) continue;
    if (!/[a-z]/.test(token)) continue;
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= 24) break;
  }

  return unique;
};

const analyzeCodeEvidence = ({ progressNotes = '', codeSnippets = [] }) => {
  const snippets = sanitizeCodeSnippets(codeSnippets);
  const claimTerms = extractClaimTerms(progressNotes);
  const combinedCode = snippets.map((item) => item.content.toLowerCase()).join('\n');
  const matchedClaims = claimTerms.filter((term) => combinedCode.includes(term));
  const claimMatchRatio = claimTerms.length ? matchedClaims.length / claimTerms.length : 0;

  const codeChars = snippets.reduce((acc, item) => acc + item.charCount, 0);
  const codeLines = snippets.reduce((acc, item) => acc + item.lineCount, 0);

  const codeStructureSignals = [
    /\bfunction\b/g,
    /\bclass\b/g,
    /\bimport\b/g,
    /\bexport\b/g,
    /\bdef\b/g,
    /\breturn\b/g,
    /\basync\b/g,
    /=>/g,
    /\{/g,
    /;/g,
  ].reduce((acc, regex) => acc + ((combinedCode.match(regex) || []).length > 0 ? 1 : 0), 0);

  const quantityScore = clamp(Math.round((codeChars / 3500) * 100), 0, 100);
  const structureScore = clamp(codeStructureSignals * 10, 0, 100);
  const claimMatchScore = clamp(Math.round(claimMatchRatio * 100), 0, 100);
  const codeEvidenceScore = clamp(
    Math.round(quantityScore * 0.45 + structureScore * 0.2 + claimMatchScore * 0.35),
    0,
    100
  );

  let claimPenalty = 0;
  if (claimTerms.length >= 6) {
    if (!snippets.length) {
      claimPenalty = 12;
    } else if (claimMatchRatio < 0.2) {
      claimPenalty = 10;
    } else if (claimMatchRatio < 0.35) {
      claimPenalty = 5;
    }
  }

  const perFileEvidence = snippets.map((item) => {
    const lowered = item.content.toLowerCase();
    const matched = claimTerms.filter((term) => lowered.includes(term)).slice(0, 8);
    return {
      file_name: item.fileName,
      chars: item.charCount,
      lines: item.lineCount,
      matched_claim_terms: matched,
    };
  });

  return {
    snippets,
    summary: {
      file_count: snippets.length,
      code_chars: codeChars,
      code_lines: codeLines,
      claim_terms_count: claimTerms.length,
      matched_claim_terms_count: matchedClaims.length,
      claim_match_ratio: Number(claimMatchRatio.toFixed(2)),
      code_evidence_score: codeEvidenceScore,
      claim_match_score: claimMatchScore,
      penalty_points: claimPenalty,
    },
    claimTerms,
    matchedClaims,
    perFileEvidence,
  };
};

const buildCodeEvidencePrompt = (analysis) => {
  if (!analysis?.snippets?.length) {
    return 'No code files were attached by the student.';
  }

  const evidenceLines = analysis.perFileEvidence
    .map((item, idx) => {
      const terms = item.matched_claim_terms.length ? item.matched_claim_terms.join(', ') : 'none';
      return `${idx + 1}. ${item.file_name} | chars=${item.chars} | lines=${item.lines} | matched_terms=${terms}`;
    })
    .join('\n');

  const codeBlocks = analysis.snippets
    .map((item, idx) => {
      const preview = item.content.slice(0, 1200);
      return `File ${idx + 1}: ${item.fileName}\n${preview}`;
    })
    .join('\n\n---\n\n');

  return [
    'Attached code evidence summary:',
    evidenceLines,
    '',
    'Attached code content:',
    codeBlocks,
  ].join('\n');
};

const buildEvidenceTraceText = (analysis) => {
  const header = [
    '[Evidence Trace]',
    `files=${analysis.summary.file_count}`,
    `code_chars=${analysis.summary.code_chars}`,
    `code_lines=${analysis.summary.code_lines}`,
    `claim_match_ratio=${analysis.summary.claim_match_ratio}`,
    `code_evidence_score=${analysis.summary.code_evidence_score}`,
    `consistency_penalty=${analysis.summary.penalty_points}`,
  ].join(' | ');

  const fileLines = analysis.perFileEvidence.map((item, idx) => {
    const matched = item.matched_claim_terms.length ? item.matched_claim_terms.join(', ') : 'none';
    return `${idx + 1}. ${item.file_name} (chars=${item.chars}, lines=${item.lines}, matched_terms=${matched})`;
  });

  return [header, ...fileLines].join('\n');
};

module.exports = {
  analyzeCodeEvidence,
  buildCodeEvidencePrompt,
  buildEvidenceTraceText,
};
