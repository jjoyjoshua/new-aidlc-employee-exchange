/**
 * Server entry point.
 *
 * Configuration is validated before anything else starts. A missing or malformed value stops
 * the process here, with a message naming every problem at once (US-034/AC-04). That is the
 * designed behaviour: a service that boots with half a configuration fails later, in
 * production, quietly.
 */
import { ConfigurationError, config } from './config/index.js';
import { buildApp } from './composition.js';
import { logger } from './infra/logger/index.js';

function main(): void {
  let port: number;
  let timezone: string;

  try {
    port = config().PORT;
    timezone = config().OFFICE_TIMEZONE;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      // Not logger.error: the logger is part of the running server, and this is a refusal to
      // become one. Write it plainly and leave with a non-zero code so a supervisor notices.
      // eslint-disable-next-line no-console
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  buildApp().listen(port, () => {
    logger.info('server listening', { port, officeTimezone: timezone });
  });
}

main();
