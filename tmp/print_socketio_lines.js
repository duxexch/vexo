import fs from "node:fs";

const path = "server/socketio/index.ts";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);

// Expanded ranges:
// - around setupSocketIO start for missing-return flow issues
// - around rtc:invite status check (suspected extra brace)
// - around emitRtcError (comma-op complaint line 669)
const ranges = [
    { from: 205, to: 240 }, // setupSocketIO start + early returns
    { from: 540, to: 620 }, // rtc:invite authz status check area
    { from: 640, to: 690 }, // rtc payload hardening + emitRtcError
    { from: 910, to: 1020 }, // setupSocketIO end
];

for (const r of ranges) {
    for (let i = r.from; i <= r.to; i++) {
        const line = lines[i] ?? "";
        console.log(String(i + 1).padStart(4, " ") + ": " + line);
    }
    console.log("----");
}
