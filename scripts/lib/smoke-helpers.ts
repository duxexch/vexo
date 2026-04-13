export class SmokeScriptError extends Error {
    details?: unknown;

    constructor(errorName: string, message: string, details?: unknown) {
        super(message);
        this.name = errorName;
        this.details = details;
    }
}

export function createErrorHelpers(errorName = "SmokeError"): {
    fail: (message: string, details?: unknown) => never;
    assertCondition: (condition: unknown, message: string, details?: unknown) => asserts condition;
} {
    const fail = (message: string, details?: unknown): never => {
        throw new SmokeScriptError(errorName, message, details);
    };

    const assertCondition = (
        condition: unknown,
        message: string,
        details?: unknown,
    ): asserts condition => {
        if (!condition) {
            fail(message, details);
        }
    };

    return { fail, assertCondition };
}
