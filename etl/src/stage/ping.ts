import { connectionOnly, pingReadOnly, runPing } from "../db/read-only-ping"
import { stagePoolConfig } from "./connection"

runPing(() => pingReadOnly(connectionOnly(stagePoolConfig()), { table: "housing_universe", expected: 536 }))
