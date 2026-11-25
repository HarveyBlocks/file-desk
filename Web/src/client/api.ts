import type { ApiFailure } from "@/shared/files";

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/** Status and error codes remain structured; display messages are never parsed. */
export async function mutate(url: string, options: RequestInit): Promise<void> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const failure: ApiFailure = await response.json();
    throw new ApiError(failure.code, failure.message);
  }
}

export function jsonRequest(body: object): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "CONFLICT") return "This name is already in use. Choose another name.";
    return error.message;
  }
  return "The operation failed. Check your connection and try again.";
}
