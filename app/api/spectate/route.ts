export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

// ====== 設定 ======
const TTL_SECONDS = 6 * 60 * 60; // 6時間
const KEY_PREFIX = "spectate:";

// 公開用・最低限の防御
const MAX_PAYLOAD_BYTES = 120_000; // 目安 120KB
const ID_RE = /^[a-z0-9]{16}$/; // 16 chars

type StoreValue = { payload: unknown; updatedAt: number };

function isValidId(id: string) {
  return ID_RE.test(id);
}

function payloadSizeBytes(payload: unknown) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function makeId() {
  // 16 chars, a-z0-9（cryptoで生成）
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // base36化して長さを稼ぐ（小文字のみ）
  const s = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
  return s.slice(0, 16);
}

function keyOf(id: string) {
  return `${KEY_PREFIX}${id}`;
}

const NO_STORE = { "Cache-Control": "no-store" };

// ====== GET /api/spectate?id=xxxx -> { payload, updatedAt } ======
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400, headers: NO_STORE });
  }

  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400, headers: NO_STORE });
  }

  const v = await kv.get<StoreValue>(keyOf(id));
  if (!v) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(v, { status: 200, headers: NO_STORE });
}

// ====== POST /api/spectate ======
// body: { payload } -> 新規作成 { id, updatedAt }
// body: { id, payload } -> 同一idを上書き更新 { id, updatedAt }
export async function POST(req: Request) {
  const serverToken = (process.env.SPECTATE_WRITE_TOKEN ?? "").trim();

  if (!serverToken) {
    return NextResponse.json(
      { error: "server token is not configured" },
      { status: 500, headers: NO_STORE }
    );
  }

  const token = (req.headers.get("x-spectate-token") ?? "").trim();
  if (!token || token !== serverToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: NO_STORE });
  }

  const safeBody =
    typeof body === "object" && body !== null
      ? (body as { id?: unknown; payload?: unknown })
      : null;

  const payload = safeBody?.payload;
  if (payload == null) {
    return NextResponse.json({ error: "payload is required" }, { status: 400, headers: NO_STORE });
  }

  // サイズ制限（公開時の事故防止）
  const bytes = payloadSizeBytes(payload);
  if (bytes > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: "payload too large", maxBytes: MAX_PAYLOAD_BYTES, bytes },
      { status: 413, headers: NO_STORE }
    );
  }

  const id =
    typeof safeBody?.id === "string" && safeBody.id.trim()
      ? safeBody.id.trim()
      : makeId();

  if (!isValidId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400, headers: NO_STORE });
  }

  const now = Date.now();
  const value: StoreValue = { payload, updatedAt: now };

  await kv.set(keyOf(id), value, { ex: TTL_SECONDS });

  return NextResponse.json({ id, updatedAt: now }, { status: 200, headers: NO_STORE });
}