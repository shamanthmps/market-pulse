import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_PATH = join(process.cwd(), "data", "holdings.json");

function readHoldings() {
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return { etfHoldings: [], liquidcaseAmount: 0 };
  }
}

export async function GET() {
  return NextResponse.json(readHoldings());
}

export async function POST(req: Request) {
  const body = await req.json();
  const current = readHoldings();
  const updated = {
    ...current,
    ...body,
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  // On Vercel the filesystem is read-only — write is skipped silently.
  // Holdings are stored in git (data/holdings.json) and updated locally.
  try {
    writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2));
  } catch {
    // Read-only filesystem (Vercel serverless) — in-memory update only
  }

  return NextResponse.json({ ok: true, data: updated });
}
