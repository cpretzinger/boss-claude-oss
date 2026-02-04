/**
 * Boss Claude Setup Utilities
 *
 * Centralized exports for all setup modules
 */

export {
  setupGitHubRepo,
  setupGitHubRepoCommand,
  getGitHubToken,
  getGitHubUsername,
  repositoryExists,
  createRepository
} from './github-repo.js';

export {
  initializeRedis,
  getRedisStats,
  resetRedis,
  verifyRedis,
  printInitResults as printRedisInitResults,
  setupRedisForWizard,
  DEFAULT_IDENTITY,
  ACHIEVEMENTS
} from './init-redis.js';

export {
  initializePostgres,
  getPostgresStats,
  resetPostgres,
  verifyPostgres,
  printInitResults as printPostgresInitResults,
  setupPostgresForWizard
} from './init-postgres.js';

export {
  runIntegrationTests,
  testEnvironmentVariables,
  testRedisConnection,
  testPostgreSQLConnection,
  testGitHubIntegration,
  testSystemIntegration
} from './integration-test.js';

export {
  RollbackManager,
  SetupState,
  quickRollback,
  createSnapshot,
  recordAction
} from './rollback.js';

export { EnvManager } from './env-manager.js';

export {
  displaySetupSummary,
  displayQuickSummary,
  displayPartialSummary,
  displayRollbackSummary,
  displayValidationSummary,
  createSummaryConfig
} from './summary.js';
