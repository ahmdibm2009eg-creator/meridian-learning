import path from "node:path";

// Unit tests must never touch the development database. Modules that import
// @/lib/db instantiate PrismaClient at import time, so DATABASE_URL must be
// set before any project module loads. An absolute scratch path is used so
// resolution does not depend on the working directory.
process.env.DATABASE_URL ??= "file:" + path.resolve("db/vitest-scratch.db");
(process.env as { NODE_ENV?: string }).NODE_ENV ??= "test";
