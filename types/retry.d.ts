export interface HistoryProps {
  func: () => void;
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
