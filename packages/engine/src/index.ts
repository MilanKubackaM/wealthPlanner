export { ENGINE_VERSION } from './version.js';
export * from './types.js';
export * from './time.js';
export { simulate } from './simulate.js';
export { detectProblems, isHealthy } from './problems.js';
export type { Problem, ProblemId, Severity, DetectOptions } from './problems.js';
export {
  recommend,
  analyse,
  searchLever,
  buildLevers,
  criterionFor,
} from './recommend.js';
export type { Lever, Criterion, Recommendation, Proof } from './recommend.js';
