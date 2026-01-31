export class Retry {
  history: any[];

  constructor() {
    this.history = [];
  }

  sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async retry<T>(func: () => T | Promise<T>, retries: number): Promise<T> {
    let curRetry: number = 0;
    let retryIndex: number = 1;
    let flag = "UNKNOWN";
    let cause: null | string = null;
    let code: number = 0;
    let result: T | undefined;

    while (true) {
      try {
        result = await func();
        flag = "SUCCESS";
        code = 200;
        break;
      } catch (error: any) {
        if (curRetry === retries) {
          flag = "FAILURE";
          cause = error.message || String(error);
          code = error.code || -1;
          break;
        }
        console.log(
          `retrying for the ${curRetry} with error: ${error.message}`,
        );
        await this.sleep(100 * retryIndex);
        curRetry++;
        retryIndex++;
      }
    }

    this.history.push({
      func: func,
      flag: flag,
      cause: cause,
      causeCode: code,
    });

    return result!;
  }
}
