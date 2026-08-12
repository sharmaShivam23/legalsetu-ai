export type EvidenceLevel = "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
  requestId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN" | "RESEARCHER";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    role?: "USER" | "ADMIN" | "RESEARCHER";
  }
}
