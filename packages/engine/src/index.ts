export { ENGINE_VERSION } from './version';
export * from './types';
export * from './time';
export { simulate } from './simulate';
export { detectProblems, isHealthy } from './problems';
export type { Problem, ProblemId, Severity, DetectOptions } from './problems';
export {
  recommend,
  analyse,
  searchLever,
  buildLevers,
  criterionFor,
} from './recommend';
export type { Lever, Criterion, Recommendation, Proof } from './recommend';
export { scorePlan } from './score';
export type {
  HealthScore,
  ScoreDimension,
  ScoreDimensionId,
  ScoreAdviceId,
  ScoreOptions,
} from './score';
