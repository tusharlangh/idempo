import type {
  ErrorDetailsProps,
  FlagTypes,
  HistoryProps,
  RetryAttempProps,
} from "../types/retry.d.ts";

export class Retry {
  history: HistoryProps[];

  constructor() {
    this.history = [];
  }

  sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async retry<T>(
    func: (attempt: number) => T | Promise<T>,
    retries: number,
  ): Promise<{
    result: T | undefined;
    error_details: ErrorDetailsProps;
  }> {
    retries = Math.min(retries, 100);

    let curRetry: number = 0;
    let retryIndex: number = 1;
    let flag: FlagTypes = "UNKNOWN";
    let result: T | undefined;
    const retryAttempts: RetryAttempProps[] = [];

    while (true) {
      try {
        result = await func(retryIndex);
        flag = "SUCCESS";
        break;
      } catch (error: any) {
        const errorAttempt = {
          attempt: retryIndex,
          timestamp: new Date(),
          error: error.message || String(error),
          errorCode: error.code || error.status || -1,
        };
        retryAttempts.push(errorAttempt);

        if (curRetry === retries) {
          flag = "FAILURE";
          break;
        }
        console.log(
          `retrying for the ${retryIndex} with error: ${error.message}`,
        );
        await this.sleep(100 * retryIndex);
        curRetry++;
        retryIndex++;
      }
    }

    this.history.push({
      func: func,
      flag: flag,
      retry_attempts: retryAttempts,
    });

    return {
      result: result,
      error_details: { flag: flag, retry_attempts: retryAttempts },
    };
  }
}
