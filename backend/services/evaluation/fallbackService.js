const { clamp, toLower, truncateText } = require('../utils/textUtils');

const fallbackProposalEvaluation = ({ ideaText, course }) => {
  const text = toLower(ideaText);
  const curriculum = toLower(course.curriculum);
  const objectives = toLower(course.learning_objectives);

  const topicHits = ['llm', 'rag', 'transformer', 'nlp', 'prompt', 'evaluation'].reduce(
    (acc, word) => acc + (text.includes(word) ? 1 : 0),
    0
  );
  const contextHits = [curriculum, objectives].reduce(
    (acc, ctx) => acc + (ctx && text.split(/\s+/).some((token) => token.length > 4 && ctx.includes(token)) ? 1 : 0),
    0
  );

  const relevance = clamp(4 + topicHits + contextHits, 0, 10);
  const alignment = clamp(4 + contextHits, 0, 10);
  const feasibility = clamp(5 + Math.min(2, Math.floor((text.length || 0) / 500)), 0, 10);
  const technical_depth = clamp(4 + Math.min(3, topicHits), 0, 10);
  const mean = (relevance + alignment + feasibility + technical_depth) / 4;

  return {
    relevance,
    alignment,
    feasibility,
    technical_depth,
    decision: mean >= 6.5 ? 'approved' : 'rejected',
    feedback: 'Fallback evaluation used because LLM response was malformed. Expand course alignment and implementation details if rejected.',
  };
};

const fallbackMilestoneFeedback = () => ({
  feedback: 'Fallback feedback: progress recorded. Include architecture, completed modules, measurable results, and next sprint tasks for stronger evaluation.',
});

const fallbackSubmissionScore = ({ submission, isFinal, codeEvidenceAnalysis, lastError }) => {
  const text = toLower(submission.progress_notes || '');
  const lengthScore = clamp(Math.floor(text.length / 50), 0, 100);
  const keywordScore = ['implemented', 'tested', 'result', 'accuracy', 'dataset', 'api', 'model', 'evaluation'].reduce(
    (acc, word) => acc + (text.includes(word) ? 5 : 0),
    0
  );

  const textScore = clamp(Math.round(lengthScore * 0.7 + keywordScore * 0.6), 0, 100);
  const codeScore = codeEvidenceAnalysis?.summary?.code_evidence_score ?? 0;
  const consistencyScore = codeEvidenceAnalysis?.summary?.claim_match_score ?? 0;

  const weighted = Math.round(textScore * 0.2 + codeScore * 0.5 + consistencyScore * 0.3);
  const bonus = isFinal ? 5 : 0;
  const penalty = codeEvidenceAnalysis?.summary?.penalty_points ?? 0;
  const score = clamp(weighted + bonus - penalty, 0, 100);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return {
    score,
    grade,
    feedback: [
      'Fallback grading used because LLM JSON output was invalid.',
      lastError?.message ? `Last LLM error: ${truncateText(lastError.message, 180)}.` : null,
      `Weighted formula (text 20%, code 50%, consistency 30%) produced score=${score}.`,
      'Re-run evaluation later for richer rubric-based comments.',
    ].filter(Boolean).join(' '),
    text_score: textScore,
    code_score: codeScore,
    consistency_score: consistencyScore,
  };
};

module.exports = {
  fallbackProposalEvaluation,
  fallbackMilestoneFeedback,
  fallbackSubmissionScore,
};
