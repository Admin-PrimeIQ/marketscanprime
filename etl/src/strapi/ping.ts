import { connectionOnly, pingReadOnly, runPing } from "../db/read-only-ping"
import { strapiPoolConfig } from "./connection"

runPing(() => pingReadOnly(connectionOnly(strapiPoolConfig()), { table: "projects", expected: 1115 }))
