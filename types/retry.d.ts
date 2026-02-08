export interface HistoryProps {
  func: (attempt: number) => unknown;
  flag: FlagTypes;
  retry_attempts: RetryAttempProps[];
}

export interface ErrorDetailsProps {
  flag: FlagTypes;
  retry_attempts: RetryAttempProps[];
}

export type FlagTypes = "SUCCESS" | "UNKNOWN" | "FAILURE";

export interface RetryAttempProps {
  attempt: number;
  timestamp: Date;
  error: string;
  errorCode: number | string;
}
