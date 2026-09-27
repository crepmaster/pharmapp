import { jest } from "@jest/globals";

const cleanupOrphanUser = jest.fn(async () => ({
  success: true,
  message: "deleted",
  actions: ["Deleted Firebase Auth user"],
}));

// Invoke the registered HTTP handler directly, without the Firebase HTTP
// wrapper. The service mock is the deletion boundary we must never cross.
jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (_options: unknown, handler: unknown) => handler,
}));
jest.mock("../shared/auth/unified-auth-service.js", () => ({
  UnifiedAuthService: { cleanupOrphanUser },
}));

import { cleanupTestUserUnified } from "../auth/unified-auth-functions.js";

type Response = {
  status: ReturnType<typeof jest.fn>;
  json: ReturnType<typeof jest.fn>;
};

const handler = cleanupTestUserUnified as unknown as (
  request: Record<string, unknown>, response: Response
) => void | Promise<void>;

describe("cleanupTestUserUnified retirement", () => {
  beforeEach(() => cleanupOrphanUser.mockClear());

  it.each(["GET", "POST", "OPTIONS"])(
    "returns 410 for %s without calling the destructive service",
    async (method) => {
      const response = {} as Response;
      response.status = jest.fn(() => response);
      response.json = jest.fn(() => response);

      await handler({
        method,
        query: { email: "existing@example.com" },
        body: { email: "existing@example.com" },
      }, response);

      expect(response.status).toHaveBeenCalledWith(410);
      expect(response.json).toHaveBeenCalledWith({
        success: false,
        error: "ENDPOINT_RETIRED",
      });
      expect(cleanupOrphanUser).not.toHaveBeenCalled();
    }
  );
});
