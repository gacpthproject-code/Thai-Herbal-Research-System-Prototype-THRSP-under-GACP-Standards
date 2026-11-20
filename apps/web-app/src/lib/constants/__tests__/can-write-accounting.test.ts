import { CANONICAL_ROLES, canWriteAccounting } from "../canonical-roles";

describe("canWriteAccounting matches the backend company-books writer (order 29)", () => {
    it("lets only the company finance officer write the company books", () => {
        const allowed = Object.values(CANONICAL_ROLES).filter((role) => canWriteAccounting(role));
        expect(allowed).toEqual([CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM]);
    });

    it("refuses a missing role", () => {
        expect(canWriteAccounting(null)).toBe(false);
        expect(canWriteAccounting(undefined)).toBe(false);
    });
});
