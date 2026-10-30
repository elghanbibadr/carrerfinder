export type Status = "found" | "platform" | "not_found" | "blocked" | "invalid" | "error";

export type FindResult = {
  input: string;
  url?: string;
  status: Status;
  careersUrl?: string;
  platform?: string;
  source?: string;
  roles?: "open" | "none" | "unknown";
  email?: string;
  note?: string;
};
