export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const TTL_SECONDS = 6 * 60 * 60;
const KEY_PREFIX = "spectate:";
const MAX_PAYLOAD_BYTES = 120_000;
const ID_RE = /^[a-z0-9]{16}$/;
const WRITE_KEY_RE = /^[A-Za-z0-9_-]{32,120}$/;

type StoreValue = { payload: unknown; updatedAt: number; writeKey: string };

function isValidId(id: string) {
  return ID_RE.test(id);
}

function isValidWriteKey(writeKey: string) {
  return WRITE_KEY_RE.test(writeKey);
}

function payloadSizeBytes(payload: unknown) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function makeId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
  return s.slice(0, 16);
}

function makeWriteKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `swk_${base64}`;
}

function keyOf(id: string) {
  return `${KEY_PREFIX}${id}`;
}

const NO_STORE = { "Cache-Control": "no-store" };

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

  return NextResponse.json(
    { payload: v.payload, updatedAt: v.updatedAt },
    { status: 200, headers: NO_STORE }
  );
}

export async function POST(req: Request) {
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

  const bytes = payloadSizeBytes(payload);
  if (bytes > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: "payload too large", maxBytes: MAX_PAYLOAD_BYTES, bytes },
      { status: 413, headers: NO_STORE }
    );
  }

  const requestedId = typeof safeBody?.id === "string" ? safeBody.id.trim() : "";
  const now = Date.now();

  if (!requestedId) {
    const id = makeId();
    const writeKey = makeWriteKey();
    const value: StoreValue = { payload, updatedAt: now, writeKey };
    await kv.set(keyOf(id), value, { ex: TTL_SECONDS });
    return NextResponse.json({ id, updatedAt: now, writeKey }, { status: 200, headers: NO_STORE });
  }

  if (!isValidId(requestedId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400, headers: NO_STORE });
  }

  const existing = await kv.get<StoreValue>(keyOf(requestedId));
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  }

  const writeKey = (req.headers.get("x-spectate-key") ?? "").trim();
  if (!isValidWriteKey(writeKey) || writeKey !== existing.writeKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const value: StoreValue = { payload, updatedAt: now, writeKey: existing.writeKey };
  await kv.set(keyOf(requestedId), value, { ex: TTL_SECONDS });

  return NextResponse.json({ id: requestedId, updatedAt: now }, { status: 200, headers: NO_STORE });
}
