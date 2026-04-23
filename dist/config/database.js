"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const connectionString = 'postgresql://apple@localhost:5432/owodealajo_db?schema=public';
const adapter = new adapter_pg_1.PrismaPg({ connectionString });
exports.prisma = new client_1.PrismaClient({ adapter });
//# sourceMappingURL=database.js.map