// Safe JSON for API responses.
//
// A route that crashes (or whose database is momentarily unreachable)
// answers with an EMPTY or HTML body. Calling response.json() on that throws
// "Unexpected end of JSON input" and, inside a component, takes the page
// down with the Next.js error overlay. readApi() never throws: a body that
// is not JSON becomes the same { success: false, error } shape the real
// routes use, so callers handle it like any other failed request.

export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

export async function readApi(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    const failure: ApiFailure = {
      success: false,
      error: {
        code: "BAD_RESPONSE",
        message:
          res.status >= 500 || res.status === 0
            ? "The server had a problem. Please try again in a moment."
            : "Unexpected response from the server. Please try again.",
      },
    };
    return failure;
  }
}
