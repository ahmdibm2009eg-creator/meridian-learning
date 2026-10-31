/** Direct Prisma access to the TEST database for assertions and fixture tweaks. */
import { PrismaClient } from "@prisma/client";

export const tdb = new PrismaClient({ log: ["error"] });
