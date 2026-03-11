"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { POKEMON_LIST, ROLE_META, matchesPokemonSearch } from "./data/pokemons";
import type { Pokemon, Role } from "./data/pokemons";

type Format = "BO3" | "BO5";
type FearlessScope = "series" | "game";
type BanCount = 2 | 3;

type SeriesConfig = {
  format: Format;
  banCount: BanCount;
  fearlessScope: FearlessScope; // series: シリーズ累計 / game: ゲーム内のみ
  ngIncludesBans: boolean; // true: BANも使用NGに含める（デフォルト）
};

type Side = "A" | "B";
type Slot = "ban" | "pick";

type Game = {
  gameNo: number;
  locked: boolean; // ✅ P3: ロック状態
  bansA: string[];
  bansB: string[];
  picksA: string[];
  picksB: string[];
};


type SelectedSlot = {
  gameNo: number;
  side: Side;
  slot: Slot;
  index: number;
} | null;

type PersistedState = {
  config?: SeriesConfig;
  games?: Game[];
  currentGameNo?: number;
  teamAName?: string;
  teamBName?: string;
  lockHistory?: number[];
};

function normalizeName(s: string) {
  return s.replace(/\u3000/g, " ").trim();
}

function makeFixed(n: number) {
  return Array.from({ length: n }, () => "");
}

function createGames(format: Format, banCount: BanCount): Game[] {
  const gameCount = format === "BO5" ? 5 : 3;
  return Array.from({ length: gameCount }, (_, i) => ({
    gameNo: i + 1,
    locked: false, // ✅
    bansA: makeFixed(banCount),
    bansB: makeFixed(banCount),
    picksA: makeFixed(5),
    picksB: makeFixed(5),
  }));
}

// 既存データ（可変長配列・空欄なし配列等）を固定枠に正規化
function normalizeGameShape(g: Partial<Game>, banCount: BanCount): Game {
  const fixTo = (arr: string[] | undefined, n: number) => {
    const base = Array.isArray(arr) ? arr.slice(0, n) : [];
    while (base.length < n) base.push("");
    return base.map((x) => (x ? normalizeName(x) : ""));
  };

  return {
    ...g,
    gameNo: typeof g.gameNo === "number" ? g.gameNo : 1,
    locked: typeof g.locked === "boolean" ? g.locked : false,
    bansA: fixTo(g.bansA, banCount),
    bansB: fixTo(g.bansB, banCount),
    picksA: fixTo(g.picksA, 5),
    picksB: fixTo(g.picksB, 5),
  };
}

function normalizeGamesForConfig(games: Game[], format: Format, banCount: BanCount): Game[] {
  const need = format === "BO5" ? 5 : 3;
  const base = games.slice(0, need).map((g, i) => normalizeGameShape({ ...g, gameNo: i + 1 }, banCount));
  while (base.length < need) {
  base.push({
    gameNo: base.length + 1,
    locked: false, // ✅
    bansA: makeFixed(banCount),
    bansB: makeFixed(banCount),
    picksA: makeFixed(5),
    picksB: makeFixed(5),
  });
}
  return base;
}

// ✅ 可読性改善：文字色トークン（opacity ではなく color を使う）
const TEXT = {
  primary: "#111827",
  secondary: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
};

// 左一覧：検索フィルタ
const ROLE_ORDER: Role[] = ["アタック型", "バランス型", "スピード型", "ディフェンス型", "サポート型"];

const UNITE = {
  bg2: "#0f1630",
  panel: "#111a33",
  border: "rgba(255,255,255,0.10)",
  text: "#eaf0ff",
  text2: "rgba(234,240,255,0.78)",
};

const SPECTATOR_PANEL: CSSProperties = {
  border: `1px solid ${UNITE.border}`,
  borderRadius: 16,
  padding: 14,
  background: `linear-gradient(180deg, ${UNITE.bg2} 0%, ${UNITE.panel} 100%)`,
  color: UNITE.text,
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};

function resolvePersistedState(source: PersistedState) {
  const config: SeriesConfig = {
    format: source.config?.format ?? "BO5",
    banCount: source.config?.banCount ?? 3,
    fearlessScope: source.config?.fearlessScope ?? "series",
    ngIncludesBans: source.config?.ngIncludesBans ?? true,
  };

  const games = normalizeGamesForConfig(
    source.games ?? createGames(config.format, config.banCount),
    config.format,
    config.banCount
  );

  const maxGameNo = config.format === "BO5" ? 5 : 3;
  const currentGameNo = (
    typeof source.currentGameNo === "number"
      ? Math.min(Math.max(source.currentGameNo, 1), maxGameNo)
      : 1
  );

  return {
    config,
    games,
    currentGameNo,
    teamAName: typeof source.teamAName === "string" && source.teamAName.trim() ? source.teamAName : "Team A",
    teamBName: typeof source.teamBName === "string" && source.teamBName.trim() ? source.teamBName : "Team B",
    lockHistory: Array.isArray(source.lockHistory)
      ? source.lockHistory.filter((n): n is number => typeof n === "number")
      : [],
  };
}

function groupPokemonByRole(list: Pokemon[]) {
  const map = new Map<Role, Pokemon[]>();
  for (const r of ROLE_ORDER) map.set(r, []);
  for (const p of list) map.get(p.role)?.push(p);
  for (const r of ROLE_ORDER) {
    map.set(r, (map.get(r) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "ja")));
  }
  return map;
}

function spectatorChipStyle(accent: string): CSSProperties {
  return {
    border: "1px solid #d1d5db",
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 900,
    fontSize: 12,
    color: "#111827",
    background: "white",
    boxShadow: `inset 3px 0 0 ${accent}`,
    whiteSpace: "nowrap",
  };
}

function SpectatorRoleRow(props: {
  title: string;
  byRole: Map<Role, Pokemon[]>;
  note?: string;
}) {
  const { title, byRole, note } = props;

  return (
    <section style={SPECTATOR_PANEL}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{title}</h2>
        {note ? <div style={{ fontSize: 12, color: UNITE.text2 }}>{note}</div> : null}
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {ROLE_ORDER.map((role) => {
          const meta = ROLE_META[role];
          const list = byRole.get(role) ?? [];
          return (
            <div key={role} style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 10px", background: "#ffffff", borderBottom: "1px solid #eee" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 900, ...meta.headerStyle }}>{role}</span>
                  <span
                    style={{
                      ...meta.badgeStyle,
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 11,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.short}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: TEXT.muted }}>{list.length} 体</div>
              </div>

              <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {list.length === 0 ? (
                  <span style={{ fontSize: 12, color: TEXT.muted }}>該当なし</span>
                ) : (
                  list.map((p) => (
                    <span key={p.name} style={spectatorChipStyle(meta.leftAccent)}>
                      {p.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SpectatorDraftCard(props: { title: string; items: string[]; pokemonByName: Map<string, Pokemon> }) {
  const { title, items, pokemonByName } = props;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "white" }}>
      <div style={{ fontWeight: 900, marginBottom: 6, color: "#000000" }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: TEXT.muted }}>未入力</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((x, i) => {
            const p = pokemonByName.get(x);
            const accent = p ? ROLE_META[p.role].leftAccent : "#9ca3af";
            return (
              <span key={`${title}-${x}-${i}`} style={spectatorChipStyle(accent)}>
                {x}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SpectatorDraftSummary(props: {
  game?: Game;
  teamAName: string;
  teamBName: string;
  pokemonByName: Map<string, Pokemon>;
}) {
  const { game, teamAName, teamBName, pokemonByName } = props;
  if (!game) return null;

  const bansA = game.bansA.filter(Boolean);
  const bansB = game.bansB.filter(Boolean);
  const picksA = game.picksA.filter(Boolean);
  const picksB = game.picksB.filter(Boolean);

  return (
    <section style={SPECTATOR_PANEL}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>このGameのBAN / PICK</h2>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#7700ff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{teamAName}</div>
          <div style={{ display: "grid", gap: 10 }}>
            <SpectatorDraftCard title="BAN" items={bansA} pokemonByName={pokemonByName} />
            <SpectatorDraftCard title="PICK" items={picksA} pokemonByName={pokemonByName} />
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#ff8800" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{teamBName}</div>
          <div style={{ display: "grid", gap: 10 }}>
            <SpectatorDraftCard title="BAN" items={bansB} pokemonByName={pokemonByName} />
            <SpectatorDraftCard title="PICK" items={picksB} pokemonByName={pokemonByName} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
    const STORAGE_KEY_V2 = "unite-fearless:v2";
  const STORAGE_KEY_V1 = "unite-fearless:v1";
  const STORAGE_KEY_SESSION_KEYS = "unite-fearless:session-keys";

  const [sessionWriteKeys, setSessionWriteKeys] = useState<Record<string, string>>({});

  function saveSessionWriteKey(id: string, writeKey: string) {
    const nextId = id.trim();
    const nextKey = writeKey.trim();
    if (!nextId || !nextKey) return;

    setSessionWriteKeys((prev) => {
      const next = { ...prev, [nextId]: nextKey };
      try {
        localStorage.setItem(STORAGE_KEY_SESSION_KEYS, JSON.stringify(next));
      } catch {
        // 無視
      }
      return next;
    });
  }

  // SSR/CSR一致のためデフォルト固定
  const [config, setConfig] = useState<SeriesConfig>({
    format: "BO5",
    banCount: 3,
    fearlessScope: "series",
    ngIncludesBans: true,
  });

  const [games, setGames] = useState<Game[]>(() => createGames("BO5", 3));
  const [mounted, setMounted] = useState(false);

  const [isReadOnly, setIsReadOnly] = useState(false);
const [spectateId, setSpectateId] = useState<string>(""); // ✅ 観戦セッションID
const [spectatorUrl, setSpectatorUrl] = useState<string>(""); // ✅ 観戦URL（表示/コピー用）
  const [spectateError, setSpectateError] = useState("");
  const currentSessionWriteKey = spectateId ? sessionWriteKeys[spectateId] ?? "" : "";

  // 枠選択（P0の中核）
  const [selected, setSelected] = useState<SelectedSlot>(null);

  // 枠ごとのエラー（赤表示）
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 左一覧検索
  const [search, setSearch] = useState("");

    // ロール別 折り畳み状態
  const [collapsedRoles, setCollapsedRoles] = useState<Record<Role, boolean>>({
     "アタック型": true,
  "バランス型": true,
  "スピード型": true,
  "ディフェンス型": true,
  "サポート型": true,
  });

  function toggleRole(role: Role) {
    setCollapsedRoles((prev) => ({ ...prev, [role]: !prev[role] }));
  }

  function setAllRolesCollapsed(next: boolean) {
    setCollapsedRoles({
      "アタック型": next,
      "バランス型": next,
      "スピード型": next,
      "ディフェンス型": next,
      "サポート型": next,
    });
  }


  // P2: 現在進行中のGame
const [currentGameNo, setCurrentGameNo] = useState<number>(1);

// ✅ P1: チーム名
const [teamAName, setTeamAName] = useState<string>("Team A");
const [teamBName, setTeamBName] = useState<string>("Team B");

// ✅ P3: ロック操作の履歴（Undoは直近のみ）
const [lockHistory, setLockHistory] = useState<number[]>([]);


  function slotKey(gameNo: number, side: Side, slot: Slot, index: number) {
    return `${gameNo}-${side}-${slot}-${index}`;
  }

  // “このGameで現在使われている”集合（設定に応じてBAN含む/含まない）
  function collectUsedFromGame(g: Game): string[] {
    const picks = [...g.picksA, ...g.picksB].filter(Boolean);
    if (!config.ngIncludesBans) return picks;
    const bans = [...g.bansA, ...g.bansB].filter(Boolean);
    return [...bans, ...picks];
  }

  // 同一Game内の重複禁止チェック用：常に BAN+PICK を対象にする
function collectUsedForDupCheck(g: Game): string[] {
  const bans = [...g.bansA, ...g.bansB].filter(Boolean);
  const picks = [...g.picksA, ...g.picksB].filter(Boolean);
  return [...bans, ...picks];
}

  // 過去ゲーム由来のNG（series の場合のみ） or game内のみ
  function getPastNgSetForGame(gameNo: number): Set<string> {
    const set = new Set<string>();

    if (config.fearlessScope === "game") {
      // game内のみ：過去NGは使わない（=空）
      return set;
    }

    // series：gameNoより前の使用をNG
    for (const g of games) {
      if (g.gameNo >= gameNo) continue;
      collectUsedFromGame(g).forEach((name) => set.add(name));
    }
    return set;
  }

  function getCurrentGameUsedSet(gameNo: number): Set<string> {
  const g = games.find((x) => x.gameNo === gameNo);
  if (!g) return new Set<string>();
  // ✅ 同一Game内の重複禁止は常にBAN+PICKで判定
  return new Set<string>(collectUsedForDupCheck(g));
}

    // 右/各パネル表示用：「このGameの使用NG」
  function getNgSetForDisplay(gameNo: number): Set<string> {
    const cur = getCurrentGameUsedSet(gameNo);

    // ✅ GameOnly の場合は「現在Game内のみ」を表示
    if (config.fearlessScope === "game") return cur;

    // ✅ series の場合は「過去 + 現在Game内」
    const past = getPastNgSetForGame(gameNo);
    const merged = new Set<string>();
    past.forEach((x) => merged.add(x));
    cur.forEach((x) => merged.add(x));
    return merged;
  }

  // 左一覧のグレーアウト用：
  // 選択中スロットに「このポケモンが入れられるか」を判定し、入れられない場合は理由を返す
  function getBlockedReasonForSelected(nameRaw: string): string | null {
    if (!selected) return null;

    const name = normalizeName(nameRaw);
    if (!name) return null;

    // 観戦モードは編集不可
    if (isReadOnly) return "観戦モードでは編集できません";

    // ロック済みGameは編集不可
    const targetGame = games.find((g) => g.gameNo === selected.gameNo);
    if (targetGame?.locked) return "ロック済みのGameは編集できません";

    // 選択枠の現在値（置換時は旧値を除外して重複判定）
    const g = games.find((x) => x.gameNo === selected.gameNo);
    if (!g) return null;

    const curArr =
      selected.slot === "ban"
        ? selected.side === "A"
          ? g.bansA
          : g.bansB
        : selected.side === "A"
        ? g.picksA
        : g.picksB;

    const currentValue = curArr[selected.index] ?? "";

    // 過去NG（seriesのみ）
    const pastNg = getPastNgSetForGame(selected.gameNo);

    // このGame内使用集合（置換対象の旧値は除外）
    const currentUsed = getCurrentGameUsedSet(selected.gameNo);
    if (currentValue) currentUsed.delete(currentValue);

    const blockedByPast = config.fearlessScope === "series" && pastNg.has(name);
    const blockedBySameGame = currentUsed.has(name);

    if (blockedByPast) return "シリーズ内で既に使用済みのため選択できません";
    if (blockedBySameGame) return "このGame内で既に使用済みのため選択できません";

    return null;
  }

  // シリーズ累計の使用NG（タグ表示用）
  const usedNgSeries = useMemo(() => {
    const used = new Set<string>();
    for (const g of games) {
      const picks = [...g.picksA, ...g.picksB].filter(Boolean);
      const source = config.ngIncludesBans ? [...g.bansA, ...g.bansB, ...picks] : picks;
      source.filter(Boolean).forEach((name) => used.add(name));
    }
    return Array.from(used).sort();
  }, [games, config.ngIncludesBans]);

const filteredList = useMemo<Pokemon[]>(() => {
  const q = normalizeName(search);
  const base = !q ? POKEMON_LIST : POKEMON_LIST.filter((p) => matchesPokemonSearch(p, q));

  const rank = new Map<Role, number>(ROLE_ORDER.map((r, i) => [r, i]));
  return base
    .slice()
    .sort((a, b) => {
      const ra = rank.get(a.role) ?? 999;
      const rb = rank.get(b.role) ?? 999;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "ja");
    });
}, [search]);

const groupedByRole = useMemo(() => {
  const map = new Map<Role, Pokemon[]>();
  for (const r of ROLE_ORDER) map.set(r, []);
  for (const p of filteredList) {
    map.get(p.role)!.push(p);
  }
  return map;
}, [filteredList]);

  const anyLocked = useMemo(() => games.some((g) => g.locked), [games]);

  const selectedGameLocked = useMemo(() => {
  if (!selected) return false;
  return !!games.find((g) => g.gameNo === selected.gameNo)?.locked;
}, [selected, games]);

  // 選択枠にポケモンをセット（NG判定込み）
  function setPokemonToSelected(nameRaw: string) {
    const s = selected;
    if (!s) return;

      // ✅ P3: ロック済みGameは編集不可
  const targetGame = games.find((g) => g.gameNo === s.gameNo);
  if (targetGame?.locked) return;

    const name = normalizeName(nameRaw);
    if (!name) return;

    const k = slotKey(s.gameNo, s.side, s.slot, s.index);

    // 現状値と同一なら無操作（エラーも消す）
    const g = games.find((x) => x.gameNo === s.gameNo);
    if (!g) return;

    const curArr =
      s.slot === "ban"
        ? s.side === "A"
          ? g.bansA
          : g.bansB
        : s.side === "A"
        ? g.picksA
        : g.picksB;

    const currentValue = curArr[s.index] ?? "";
    if (currentValue === name) {
      setErrors((prev) => {
        if (!prev[k]) return prev;
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });
      return;
    }

    // NG判定：
    // - series: 過去で使用済み + このGame内重複
    // - game: このGame内重複のみ
    const pastNg = getPastNgSetForGame(s.gameNo);

    // このGame内使用集合（ただし「今置き換える枠の旧値」は除外して判定する）
    const currentUsed = getCurrentGameUsedSet(s.gameNo);
    if (currentValue) currentUsed.delete(currentValue);

    const blockedByPast = config.fearlessScope === "series" && pastNg.has(name);
    const blockedBySameGame = currentUsed.has(name);

    if (blockedByPast || blockedBySameGame) {
      let msg = "";
      if (blockedByPast) msg = "シリーズ内で既に使用済みのため選択できません";
      else msg = "このGame内で既に使用済みのため選択できません";
      setErrors((prev) => ({ ...prev, [k]: msg }));
      return;
    }

    // セット実行
    setGames((prev) =>
      prev.map((gg) => {
        if (gg.gameNo !== s.gameNo) return gg;

        const patch = (arr: string[]) => arr.map((v, i) => (i === s.index ? name : v));

        if (s.slot === "ban") {
          if (s.side === "A") return { ...gg, bansA: patch(gg.bansA) };
          return { ...gg, bansB: patch(gg.bansB) };
        } else {
          if (s.side === "A") return { ...gg, picksA: patch(gg.picksA) };
          return { ...gg, picksB: patch(gg.picksB) };
        }
      })
    );

    // エラー解除
    setErrors((prev) => {
      if (!prev[k]) return prev;
      const copy = { ...prev };
      delete copy[k];
      return copy;
    });
  }

  function clearSlot(s: SelectedSlot) {
    if (!s) return;
      // ✅ P3: ロック済みGameは編集不可
  const targetGame = games.find((g) => g.gameNo === s.gameNo);
  if (targetGame?.locked) return;

    const k = slotKey(s.gameNo, s.side, s.slot, s.index);

    setGames((prev) =>
      prev.map((gg) => {
        if (gg.gameNo !== s.gameNo) return gg;

        const patch = (arr: string[]) => arr.map((v, i) => (i === s.index ? "" : v));

        if (s.slot === "ban") {
          if (s.side === "A") return { ...gg, bansA: patch(gg.bansA) };
          return { ...gg, bansB: patch(gg.bansB) };
        } else {
          if (s.side === "A") return { ...gg, picksA: patch(gg.picksA) };
          return { ...gg, picksB: patch(gg.picksB) };
        }
      })
    );

    setErrors((prev) => {
      if (!prev[k]) return prev;
      const copy = { ...prev };
      delete copy[k];
      return copy;
    });
  }

  function applyConfigPatch(patch: Partial<SeriesConfig>) {
  setConfig((c) => {
    const updated = { ...c, ...patch };

    // ✅ 新しい設定で games を正規化
    setGames((prev) =>
      normalizeGamesForConfig(prev, updated.format, updated.banCount)
    );

    // ✅ currentGameNo を新しい最大値に収める
    const max = updated.format === "BO5" ? 5 : 3;
    setCurrentGameNo((n) => Math.min(Math.max(1, n), max));

    // ✅ BO5→BO3 などで lockHistory が壊れないよう剪定
    setLockHistory((prev) => prev.filter((x) => x >= 1 && x <= max));

    return updated;
  });

  // ✅ UI状態をクリア（事故防止）
  setSelected(null);
  setErrors({});
  setSpectatorUrl(""); // 設定変わるとURLの意味が変わるのでクリア推奨
}


  function updateFormat(next: Format) {
  applyConfigPatch({ format: next });
}

function updateBanCount(next: BanCount) {
  applyConfigPatch({ banCount: next });
}

function encodeUtf8Base64(obj: unknown) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function decodeUtf8Base64<T>(b64: string): T | null {
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

  function resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY_V2);
      localStorage.removeItem(STORAGE_KEY_V1);
    } catch {
      // 無視
    }
    const next = createGames(config.format, config.banCount);
    setGames(next);
    setSelected(null);
    setErrors({});
    setSearch("");
    setCurrentGameNo(1);
    setTeamAName("Team A");
setTeamBName("Team B");
setLockHistory([]);
  }

  function getMaxGameNo(format: Format) {
  return format === "BO5" ? 5 : 3;
}

function lockCurrentGame() {
  const target = currentGameNo;

  setGames((prev) =>
    prev.map((g) => (g.gameNo === target ? { ...g, locked: true } : g))
  );

  setLockHistory((prev) => {
    // 同じ番号が連続で積まれないようにする（連打対策）
    if (prev[prev.length - 1] === target) return prev;
    return [...prev, target];
  });

  // 選択状態は解除（編集のつもりで押し続ける事故を防ぐ）
  setSelected(null);
  setErrors({});
}

function undoUnlockLast() {
  setLockHistory((prev) => {
    if (prev.length === 0) return prev;
    const last = prev[prev.length - 1];

    setGames((gamesPrev) =>
      gamesPrev.map((g) => (g.gameNo === last ? { ...g, locked: false } : g))
    );

    // UndoしたGameへ戻す（運営が状況把握しやすい）
    setCurrentGameNo(last);
    setSelected(null);
    setErrors({});

    return prev.slice(0, -1);
  });
}

// マウント後にLocalStorageから復元（v2優先、無ければv1を移行）
useEffect(() => {
  queueMicrotask(() => setMounted(true));

  try {
    const savedSessionKeys = localStorage.getItem(STORAGE_KEY_SESSION_KEYS) ?? "";
    if (savedSessionKeys) {
      const parsed = JSON.parse(savedSessionKeys) as Record<string, unknown>;
      const restored = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
      );
      queueMicrotask(() => setSessionWriteKeys(restored));
    }
  } catch {
    // 無視
  }

  (async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlSpectateId = params.get("spectateId")?.trim() ?? "";

      if (urlSpectateId) {
        setSpectateId(urlSpectateId);
        setIsReadOnly(true);

        const res = await fetch(`/api/spectate?id=${encodeURIComponent(urlSpectateId)}`, { cache: "no-store" });
        if (!res.ok) {
          setSpectateError("観戦URLが無効か期限切れです。管理者に新しいURLを確認してください。");
          return;
        }

        const data = (await res.json()) as { payload?: PersistedState };
        if (!data.payload) {
          setSpectateError("観戦データを読み込めませんでした。管理者に新しいURLを確認してください。");
          return;
        }

        const resolved = resolvePersistedState(data.payload);
        setConfig(resolved.config);
        setGames(resolved.games);
        setCurrentGameNo(resolved.currentGameNo);
        setTeamAName(resolved.teamAName);
        setTeamBName(resolved.teamBName);
        setLockHistory(resolved.lockHistory);
        setSpectateError("");
        return;
      }

      const spectate = params.get("spectate");
      if (spectate) {
        const decoded = decodeUtf8Base64<PersistedState>(spectate);
        setIsReadOnly(true);

        if (!decoded) {
          setSpectateError("観戦URLを読み込めませんでした。管理者に新しいURLを確認してください。");
          return;
        }

        const resolved = resolvePersistedState(decoded);
        setConfig(resolved.config);
        setGames(resolved.games);
        setCurrentGameNo(resolved.currentGameNo);
        setTeamAName(resolved.teamAName);
        setTeamBName(resolved.teamBName);
        setLockHistory(resolved.lockHistory);
        setSpectateError("");
        return;
      }

      const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
      const raw = rawV2 ?? localStorage.getItem(STORAGE_KEY_V1);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedState;
      const resolved = resolvePersistedState(parsed);
      setConfig(resolved.config);
      setGames(resolved.games);
      setCurrentGameNo(resolved.currentGameNo);
      setTeamAName(resolved.teamAName);
      setTeamBName(resolved.teamBName);
      setLockHistory(resolved.lockHistory);
      setSpectateError("");
    } catch {
      setSpectateError((current) => current || "保存データの読み込みに失敗しました。");
    }
  })();

}, []);

// ✅ 観戦画面：サーバの最新状態を定期取得してリアルタイム反映
useEffect(() => {
  if (!mounted) return;
  if (!isReadOnly) return;
  if (!spectateId) return;

  let alive = true;

  const tick = async () => {
    try {
      const res = await fetch(`/api/spectate?id=${encodeURIComponent(spectateId)}`, { cache: "no-store" });
      if (!res.ok) {
        if (alive) {
          setSpectateError("観戦データの更新に失敗しました。ページを再読み込みしてください。");
        }
        return;
      }

      const data = (await res.json()) as { payload?: PersistedState };
      if (!alive || !data.payload) return;

      const resolved = resolvePersistedState(data.payload);
      setConfig(resolved.config);
      setGames(resolved.games);
      setCurrentGameNo(resolved.currentGameNo);
      setTeamAName(resolved.teamAName);
      setTeamBName(resolved.teamBName);
      setLockHistory(resolved.lockHistory);
      setSpectateError("");
    } catch {
      if (alive) {
        setSpectateError("観戦データの更新に失敗しました。ページを再読み込みしてください。");
      }
    }
  };

  tick();
  const id = window.setInterval(tick, 2000);

  return () => {
    alive = false;
    window.clearInterval(id);
  };
}, [mounted, isReadOnly, spectateId]);

// 永続化（v2）
useEffect(() => {
  if (!mounted) return;
  if (isReadOnly) return;
  try {
    const payload = JSON.stringify({ config, games, currentGameNo, teamAName, teamBName, lockHistory });
    localStorage.setItem(STORAGE_KEY_V2, payload);
  } catch {
    // 無視
  }
}, [mounted, isReadOnly, config, games, currentGameNo, teamAName, teamBName, lockHistory]);

// ✅ 管理画面：観戦IDがある場合、状態更新をサーバへ自動反映（デバウンス）
useEffect(() => {
  if (!mounted) return;
  if (isReadOnly) return;
  if (!spectateId) return;
  if (!currentSessionWriteKey) return;

  const payload = { config, games, currentGameNo, teamAName, teamBName, lockHistory };

  const t = window.setTimeout(async () => {
    try {
      await fetch("/api/spectate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-spectate-key": currentSessionWriteKey,
        },
        body: JSON.stringify({ id: spectateId, payload }),
      });
    } catch {
      // 通信失敗は無視（次回更新で再送される）
    }
  }, 400);

  return () => window.clearTimeout(t);
}, [mounted, isReadOnly, spectateId, currentSessionWriteKey, config, games, currentGameNo, teamAName, teamBName, lockHistory]);



    if (!mounted) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading...</main>;
  }

  // ✅ 観戦URLは管理画面ではなく観戦専用UIを表示
  if (isReadOnly) {
    return (
      <SpectatorScreen
  config={config}
  games={games}
  currentGameNo={currentGameNo} // ←これは「サーバ（管理側）の現在Game」として渡す
  getNgSetForDisplay={getNgSetForDisplay}
  teamAName={teamAName}
  teamBName={teamBName}
  error={spectateError}
/>

    );
  }

  // ✅ P3: Next制御に必要な情報（returnの直前に置く）
const currentGame = games.find((g) => g.gameNo === currentGameNo);
const isLocked = !!currentGame?.locked;
const maxGameNo = getMaxGameNo(config.format);
const canNext = isLocked && currentGameNo < maxGameNo;
const canPrev = currentGameNo > 1;
const canLock = !isLocked && !isReadOnly;
const canUndo = lockHistory.length > 0 && !isReadOnly;
// 観戦URLは「現在Gameがロック済み」なら発行可（途中経過共有OKの運用前提）
const canSpectate = !isReadOnly && isLocked;

const canReset = !isReadOnly;

// ✅ ボタン共通スタイル（disabledでも文字が薄くならない）
const BTN_BASE: CSSProperties = {
  border: "1px solid #888",
  padding: "6px 10px",
  borderRadius: 8,
  fontWeight: 800,
  color: "#111827",
  background: "white",
};

const BTN_DISABLED: CSSProperties = {
  background: "#e5e7eb",
  color: "#374151",
  cursor: "not-allowed",
  opacity: 1,
};

  return (
  <main style={{ padding: 24, fontFamily: "system-ui" }}>
    <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>ポケモンユナイト フィアレスドラフト管理（β）</h1>

      <button
  onClick={resetAll}
  disabled={!canReset}
  style={{
    ...BTN_BASE,
    ...(!canReset ? BTN_DISABLED : { cursor: "pointer" }),
  }}
  title={isReadOnly ? "観戦モードでは操作できません" : "入力を全てリセット"}
>
        Reset
      </button>
    </header>

    {/* P2: ステータスバー（headerの外に置くと崩れにくい） */}
    <section
      style={{
        marginTop: 10,
        padding: 12,
        border: "1px solid #ddd",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontWeight: 900 }}>対戦：</span>

<input
  value={teamAName}
  onChange={(e) => setTeamAName(e.target.value)}
  placeholder="Team A"
  disabled={isReadOnly || isLocked}
  style={{
  width: 140,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: "#111827", // ✅追加
  background: (isReadOnly || isLocked) ? "#f5f5f5" : "white",
  cursor: (isReadOnly || isLocked) ? "not-allowed" : "text",
}}
/>

<span style={{ color: TEXT.secondary, fontWeight: 900 }}>vs</span>

<input
  value={teamBName}
  onChange={(e) => setTeamBName(e.target.value)}
  placeholder="Team B"
  disabled={isReadOnly || isLocked}
  style={{
  width: 140,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: "#111827", // ✅追加
  background: (isReadOnly || isLocked) ? "#f5f5f5" : "white",
  cursor: (isReadOnly || isLocked) ? "not-allowed" : "text",
}}
/>

        <span style={{ color: TEXT.faint }}>｜</span>

        <span style={{ fontWeight: 900 }}>Bo：</span>
        <span>{config.format}</span>

        <span style={{ color: TEXT.faint }}>｜</span>

        <span style={{ fontWeight: 900 }}>現在：</span>
        <span>Game {currentGameNo}</span>

        <span style={{ color: TEXT.faint }}>｜</span>

        <span style={{ fontWeight: 900 }}>ルール：</span>
        <span>
          Fearless={config.fearlessScope === "series" ? "Global(シリーズ)" : "GameOnly(ゲーム内)"}
          {" / "}
          NG={config.ngIncludesBans ? "BAN+PICK" : "PICKのみ"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => {
            setSelected(null);
            setErrors({});
            setCurrentGameNo((n) => Math.max(1, n - 1));
          }}
          disabled={!canPrev}
style={{
  ...BTN_BASE,
  ...(!canPrev ? BTN_DISABLED : { cursor: "pointer" }),
}}
        >
          ← Prev
        </button>

        <button
  onClick={lockCurrentGame}
  disabled={!canLock}
style={{
  ...BTN_BASE,
  ...(!canLock ? BTN_DISABLED : { cursor: "pointer" }),
}}
  title={
  isReadOnly
    ? "観戦モードでは操作できません"
    : isLocked
    ? "このGameはロック済みです"
    : "このGameを確定（ロック）します"
}
>
  🔒 Lock
</button>

<button
  onClick={undoUnlockLast}
  disabled={!canUndo}
style={{
  ...BTN_BASE,
  ...(!canUndo ? BTN_DISABLED : { cursor: "pointer" }),
}}
  title={lockHistory.length === 0 ? "Undoできるロックがありません" : "直近のロックを解除します"}
>
  ↩ Undo
</button>

        <button
  onClick={() => {
    setSelected(null);
    setErrors({});
    setCurrentGameNo((n) => Math.min(maxGameNo, n + 1));
  }}
  disabled={!canNext}
  style={{
  ...BTN_BASE,
  ...(!canNext ? BTN_DISABLED : { cursor: "pointer" }),
}}
  title={!isLocked ? "先にこのGameをロックしてください" : "次のGameへ"}
>
  Next →
</button>

<button
    onClick={async () => {
    const payload = { config, games, currentGameNo, teamAName, teamBName, lockHistory };

    const res = await fetch("/api/spectate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload }),
    });

    if (!res.ok) {
      // フォールバック：旧方式（長いURL）
      const b64 = encodeUtf8Base64(payload);
      const url = `${window.location.origin}${window.location.pathname}?spectate=${encodeURIComponent(b64)}`;
      setSpectatorUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
      return;
    }

    const data = (await res.json()) as { id?: string; writeKey?: string };
    const id = (data.id ?? "").trim();
    const writeKey = (data.writeKey ?? "").trim();

    if (!id || !writeKey) {
      // フォールバック：旧方式（長いURL）
      const b64 = encodeUtf8Base64(payload);
      const url = `${window.location.origin}${window.location.pathname}?spectate=${encodeURIComponent(b64)}`;
      setSpectatorUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
      return;
    }

    saveSessionWriteKey(id, writeKey);
    setSpectateId(id);

    // ✅ 短いURL
    const url = `${window.location.origin}${window.location.pathname}?spectateId=${encodeURIComponent(id)}`;
    setSpectatorUrl(url);

    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  }}
  disabled={!canSpectate}
  style={{
    ...BTN_BASE,
    ...(!canSpectate ? BTN_DISABLED : { cursor: "pointer" }),
  }}
  title={
    isReadOnly
      ? "観戦モードでは発行できません"
      : !isLocked
      ? "先にこのGameをロックしてから発行してください"
      : "観戦用URL（読み取り専用）を発行してコピーします"
  }
>
  👀 観戦URL
</button>

<div style={{ fontSize: 12, color: TEXT.secondary }}>
  ※ 観戦URLは<strong>読み取り専用</strong>です。管理画面はこのブラウザから自動更新されます。
</div>

      </div>

      {spectatorUrl && (
  <div style={{ width: "100%", marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
    <input
      value={spectatorUrl}
      readOnly
      style={{
  flex: 1,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  background: "#fafafa",
  fontSize: 12,
  color: TEXT.primary,     // ✅追加
}}

    />
  </div>
)}

    </section>

    {/* ここから下に「設定」「3ペイン」等を続ける */}

      {/* 設定 */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>設定</h2>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
          <label>
            Format：
            <select
  value={config.format}
  onChange={(e) => updateFormat(e.target.value as Format)}
  disabled={anyLocked || isReadOnly}
style={{
  marginLeft: 8,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: TEXT.primary,
  background: (anyLocked || isReadOnly) ? "#f3f4f6" : "white",
  cursor: (anyLocked || isReadOnly) ? "not-allowed" : "pointer",
}}
>
              <option value="BO3">BO3</option>
              <option value="BO5">BO5</option>
            </select>
          </label>

          <label>
            BAN数：
            <select
  value={config.banCount}
  onChange={(e) => updateBanCount(Number(e.target.value) as BanCount)}
  disabled={anyLocked || isReadOnly}
style={{
  marginLeft: 8,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: TEXT.primary,
  background: (anyLocked || isReadOnly) ? "#f3f4f6" : "white",
  cursor: (anyLocked || isReadOnly) ? "not-allowed" : "pointer",
}}
>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>

          <label>
            フィアレス範囲：
            <select
  value={config.fearlessScope}
  onChange={(e) => applyConfigPatch({ fearlessScope: e.target.value as FearlessScope })}
  disabled={anyLocked || isReadOnly}
style={{
  marginLeft: 8,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: TEXT.primary,
  background: (anyLocked || isReadOnly) ? "#f3f4f6" : "white",
  cursor: (anyLocked || isReadOnly) ? "not-allowed" : "pointer",
}}
>
              <option value="series">シリーズ累計（デフォルト）</option>
              <option value="game">ゲーム内のみ</option>
            </select>
          </label>

          <label>
            使用NG：
            <select
  value={config.ngIncludesBans ? "ban_pick" : "pick_only"}
  onChange={(e) => applyConfigPatch({ ngIncludesBans: e.target.value === "ban_pick" })}
  disabled={anyLocked || isReadOnly}
style={{
  marginLeft: 8,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: TEXT.primary,
  background: (anyLocked || isReadOnly) ? "#f3f4f6" : "white",
  cursor: (anyLocked || isReadOnly) ? "not-allowed" : "pointer",
}}
>
              <option value="ban_pick">BAN + PICK（デフォルト）</option>
              <option value="pick_only">PICKのみ（オプション）</option>
            </select>
          </label>
        </div>

        <p style={{ marginTop: 8, color: TEXT.secondary }}>
          ※ P0実装：手入力は廃止し、枠クリック→左一覧から選択に変更しました（運営ミス削減）。
        </p>
      </section>

      {/* 3ペイン（左：一覧 / 中央：ドラフト / 右：使用NG） */}
      <section style={{ marginTop: 16, display: "grid", gridTemplateColumns: "320px 1fr 360px", gap: 12 }}>
        {/* 左：ポケモン一覧 */}
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>ポケモン一覧</h2>

          <input
            value={search}
            onChange={(e) => {
              const next = e.target.value;
              setSearch(next);
              if (normalizeName(next)) setAllRolesCollapsed(false);
            }}
            placeholder="検索（例：ミュウ）"
            style={{
  width: "100%",
  marginTop: 10,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #bbb",
  color: "#111827",
  background: "white",
}}
          />

          <div style={{ marginTop: 10, fontSize: 12, color: TEXT.secondary }}>
            選択中枠：{selected ? `Game${selected.gameNo} / Team${selected.side} / ${selected.slot.toUpperCase()}-${selected.index + 1}` : "未選択"}
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10, maxHeight: 520, overflow: "auto" }}>
  {/* 操作：全開/全閉 */}
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <button
      type="button"
      onClick={() => setAllRolesCollapsed(false)}
      style={{
  border: "1px solid #bbb",
  borderRadius: 8,
  padding: "4px 8px",
  background: "white",
  cursor: "pointer",
  color: TEXT.primary,     // ✅ 文字色を明示
  fontWeight: 700,         // ✅ 少し太くして視認性UP
}}

    >
      全て開く
    </button>
    <button
      type="button"
      onClick={() => setAllRolesCollapsed(true)}
      style={{
  border: "1px solid #bbb",
  borderRadius: 8,
  padding: "4px 8px",
  background: "white",
  cursor: "pointer",
  color: TEXT.primary,     // ✅ 文字色を明示
  fontWeight: 700,         // ✅ 少し太くして視認性UP
}}

    >
      全て閉じる
    </button>
    <span style={{ fontSize: 12, color: TEXT.muted }}>
  （検索中は必要に応じて開いてください）
</span>
  </div>

  {/* ロール別セクション */}
  {ROLE_ORDER.map((role) => {
    const list = groupedByRole.get(role) ?? [];
    if (list.length === 0) return null; // 該当なしロールは非表示

    const meta = ROLE_META[role];
    const collapsed = collapsedRoles[role];

    return (
      <div key={role} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {/* 見出し（クリックで折り畳み） */}
        <button
          type="button"
          onClick={() => toggleRole(role)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 10px",
            background: "white",
            cursor: "pointer",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          title="クリックで折り畳み/展開"
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontWeight: 900, ...meta.headerStyle }}>{role}</span>
            <span style={{ fontSize: 12, color: TEXT.muted }}>({list.length})</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                ...meta.badgeStyle,
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
              title={role}
            >
              {meta.short}
            </span>
            <span style={{ fontWeight: 900, color: TEXT.muted }}>{collapsed ? "＋" : "－"}</span>
          </div>
        </button>

        {/* 中身 */}
        {!collapsed && (
          <div style={{ display: "grid", gap: 6, padding: 10, background: "#fafafa" }}>
            {list.map((p) => {
              const blockedReason = getBlockedReasonForSelected(p.name);
              const blocked = !!blockedReason;

              const listDisabled = !selected || selectedGameLocked || isReadOnly;

              const disabled = listDisabled || blocked;

              return (
                <button
                  key={p.name}
                  onClick={() => setPokemonToSelected(p.name)}
                  disabled={listDisabled || blocked}
                  style={{
                    textAlign: "left",
                    border: blocked ? "1px solid #cfcfcf" : "1px solid #aaa",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: disabled ? "#e5e7eb" : "white",
                    color: "#111827",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: 1,
                    boxShadow: blocked ? "inset 3px 0 0 #9ca3af" : `inset 3px 0 0 ${meta.leftAccent}`,
                  }}
                  title={
                    !selected
                      ? "先に枠をクリックしてください"
                      : selectedGameLocked
                      ? "ロック済みのGameは編集できません"
                      : isReadOnly
                      ? "観戦モードでは編集できません"
                      : blockedReason
                      ? blockedReason
                      : "クリックで選択枠にセット"
                  }
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span>{p.name}</span>

                    <span
                      style={{
                        ...meta.badgeStyle,
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                      }}
                      title={p.role}
                    >
                      {meta.short}
                    </span>
                  </div>

                  {p.isMega && (
                    <div style={{ marginTop: 4, fontSize: 11, color: TEXT.muted }}>
                      メガ進化
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  })}
</div>
        </div>

        {/* 中央：試合入力（枠クリック式） */}
        <div>
          <section style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>試合入力</h2>

            <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
              {games
  .filter((g) => g.gameNo === currentGameNo)
  .map((g) => (
    <div key={g.gameNo} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Game {g.gameNo}</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <TeamPanel
  title={teamAName}
  game={g}
  side="A"
  banCount={config.banCount}
  selected={selected}
  onSelect={(s) => setSelected(s)}
  onClear={(s) => clearSlot(s)}
  errors={errors}
  slotKey={slotKey}
/>

<TeamPanel
  title={teamBName}
  game={g}
  side="B"
  banCount={config.banCount}
  selected={selected}
  onSelect={(s) => setSelected(s)}
  onClear={(s) => clearSlot(s)}
  errors={errors}
  slotKey={slotKey}
/>
      </div>
    </div>
  ))}
            </div>
          </section>
        </div>

        {/* 右：使用NG（既存仕様：seriesのみ全体表示） */}
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>使用NG</h2>

          {config.fearlessScope === "series" ? (
            usedNgSeries.length === 0 ? (
              <p style={{ color: TEXT.secondary }}>まだ使用済みキャラがありません</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {usedNgSeries.map((name) => (
                  <span key={name} style={{ border: "1px solid #aaa", borderRadius: 999, padding: "4px 10px" }}>
                    {name}
                  </span>
                ))}
              </div>
            )
          ) : (
            <p style={{ color: TEXT.secondary }}>「ゲーム内のみ」選択中：NGは各Game内の重複としてのみブロックします。</p>
          )}

          <hr style={{ margin: "14px 0" }} />

          <h3 style={{ fontSize: 14, fontWeight: 800 }}>
  各Gameの“今選べない”参考（{config.fearlessScope === "series" ? "過去+このGame" : "このGame内のみ"}）
</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {games
  .filter((g) => g.gameNo === currentGameNo)
  .map((g) => {
    const ng = Array.from(getNgSetForDisplay(g.gameNo)).sort();
    return (
      <div key={g.gameNo} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Game {g.gameNo}</div>
        {ng.length === 0 ? (
          <div style={{ color: TEXT.muted }}>未発生</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ng.map((name) => (
              <span key={name} style={{ border: "1px solid #aaa", borderRadius: 999, padding: "4px 10px" }}>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  })}
          </div>
        </div>
      </section>
    </main>
  );
}

function TeamPanel(props: {
  title: string;
  game: Game;
  side: Side;
  banCount: BanCount;
  selected: SelectedSlot;
  onSelect: (s: SelectedSlot) => void;
  onClear: (s: SelectedSlot) => void;
  errors: Record<string, string>;
  slotKey: (gameNo: number, side: Side, slot: Slot, index: number) => string;
}) {
  const { title, game, side, banCount, selected, onSelect, onClear, errors, slotKey } = props;

  const bans = side === "A" ? game.bansA : game.bansB;
  const picks = side === "A" ? game.picksA : game.picksB;

  const isSelected = (slot: Slot, index: number) =>
    !!selected && selected.gameNo === game.gameNo && selected.side === side && selected.slot === slot && selected.index === index;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h4 style={{ fontSize: 15, fontWeight: 800 }}>{title}</h4>
        <span style={{ fontSize: 12, color: TEXT.secondary }}>BAN:{banCount}枠 / PICK:5枠</span>
      </div>

      {/* BAN */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>BAN</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${banCount}, 1fr)`, gap: 8 }}>
          {bans.slice(0, banCount).map((v, idx) => {
            const k = slotKey(game.gameNo, side, "ban", idx);
            return (
              <SlotButton
                key={k}
                label={v}
                active={isSelected("ban", idx)}
                error={errors[k]}
                onClick={() => onSelect({ gameNo: game.gameNo, side, slot: "ban", index: idx })}
                onClear={() => onClear({ gameNo: game.gameNo, side, slot: "ban", index: idx })}
              />
            );
          })}
        </div>
      </div>

      {/* PICK */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>PICK</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(5, 1fr)`, gap: 8 }}>
          {picks.map((v, idx) => {
            const k = slotKey(game.gameNo, side, "pick", idx);
            return (
              <SlotButton
                key={k}
                label={v}
                active={isSelected("pick", idx)}
                error={errors[k]}
                onClick={() => onSelect({ gameNo: game.gameNo, side, slot: "pick", index: idx })}
                onClear={() => onClear({ gameNo: game.gameNo, side, slot: "pick", index: idx })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlotButton(props: {
  label: string;
  active: boolean;
  error?: string;
  onClick: () => void;
  onClear: () => void;
}) {
  const { label, active, error, onClick, onClear } = props;

  return (
    <div>
      <button
        onClick={onClick}
        style={{
  width: "100%",
  border: active ? "2px solid #111827" : "1px solid #9ca3af",
  borderRadius: 10,
  padding: "10px 8px",
  background: active ? "#f9fafb" : "white",
  color: "#111827",   // ✅ 文字を濃く
  cursor: "pointer",
  textAlign: "center",
  fontWeight: 900,
}}
        title="クリックしてこの枠を選択"
      >
        {label ? label : "＋"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, minHeight: 18 }}>
        <span style={{ fontSize: 12, color: "crimson" }}>{error ?? ""}</span>
        <button
          onClick={onClear}
          disabled={!label}
          style={{
  border: "1px solid #bbb",
  borderRadius: 8,
  padding: "2px 8px",
  background: label ? "white" : "#f3f4f6",
  cursor: label ? "pointer" : "not-allowed",
  fontSize: 12,
  color: label ? TEXT.primary : TEXT.secondary, // ✅ 追加：disabledでも読める
  opacity: 1,                                  // ✅ 追加：薄くしない
}}
          title="この枠をクリア"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function SpectatorScreen(props: {
  config: SeriesConfig;
  games: Game[];
  currentGameNo: number;
  getNgSetForDisplay: (gameNo: number) => Set<string>;
  teamAName: string;
  teamBName: string;
  error?: string;
}) {
  const { config, games, currentGameNo, getNgSetForDisplay, teamAName, teamBName, error } = props;
  const [manualViewGameNo, setManualViewGameNo] = useState<number | null>(null);

  const maxGameNo = config.format === "BO5" ? 5 : 3;
  const viewGameNo = Math.min(Math.max(1, manualViewGameNo ?? currentGameNo), maxGameNo);
  const currentGame = useMemo(() => games.find((g) => g.gameNo === viewGameNo), [games, viewGameNo]);
  const ngSet = useMemo(() => getNgSetForDisplay(viewGameNo), [getNgSetForDisplay, viewGameNo]);
  const pickable = useMemo(() => POKEMON_LIST.filter((p) => !ngSet.has(p.name)), [ngSet]);
  const unpickable = useMemo(() => POKEMON_LIST.filter((p) => ngSet.has(p.name)), [ngSet]);
  const pickableByRole = useMemo(() => groupPokemonByRole(pickable), [pickable]);
  const unpickableByRole = useMemo(() => groupPokemonByRole(unpickable), [unpickable]);
  const pokemonByName = useMemo(() => new Map<string, Pokemon>(POKEMON_LIST.map((p) => [p.name, p])), []);

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", background: "#f3f4f6", minHeight: "100vh" }}>
        <section style={SPECTATOR_PANEL}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>観戦モード（読み取り専用）</h1>
          <p style={{ marginTop: 12, color: UNITE.text }}>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", background: "#f3f4f6", minHeight: "100vh" }}>
      <header style={{ ...SPECTATOR_PANEL, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>観戦モード（読み取り専用）</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: TEXT.secondary }}>
            Bo={config.format} / Fearless={config.fearlessScope === "series" ? "Global(シリーズ)" : "GameOnly(ゲーム内)"} / NG表示={config.ngIncludesBans ? "BAN+PICK" : "PICKのみ"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: UNITE.text }}>{teamAName} vs {teamBName}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setManualViewGameNo(Math.max(1, viewGameNo - 1))}
            disabled={viewGameNo <= 1}
            style={{
              border: "1px solid #888",
              padding: "6px 10px",
              borderRadius: 10,
              fontWeight: 900,
              background: viewGameNo <= 1 ? "#e5e7eb" : "white",
              color: viewGameNo <= 1 ? TEXT.secondary : TEXT.primary,
              cursor: viewGameNo <= 1 ? "not-allowed" : "pointer",
              opacity: 1,
            }}
          >
            ← Prev
          </button>

          <div style={{ fontWeight: 900 }}>
            Game {viewGameNo}
            {viewGameNo !== currentGameNo && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "#dc2626" }}>（過去表示中）</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setManualViewGameNo(Math.min(maxGameNo, viewGameNo + 1))}
            disabled={viewGameNo >= maxGameNo}
            style={{
              border: "1px solid #888",
              padding: "6px 10px",
              borderRadius: 10,
              fontWeight: 900,
              background: viewGameNo >= maxGameNo ? "#e5e7eb" : "white",
              color: viewGameNo >= maxGameNo ? TEXT.secondary : TEXT.primary,
              cursor: viewGameNo >= maxGameNo ? "not-allowed" : "pointer",
              opacity: 1,
            }}
          >
            Next →
          </button>

          {viewGameNo !== currentGameNo && (
            <button
              type="button"
              onClick={() => setManualViewGameNo(null)}
              style={{
                marginLeft: 8,
                border: "1px solid #2563eb",
                padding: "6px 10px",
                borderRadius: 10,
                fontWeight: 900,
                background: "white",
                color: "#2563eb",
                cursor: "pointer",
              }}
              title="管理画面の進行中Gameに戻ります"
            >
              Liveへ戻る
            </button>
          )}
        </div>
      </header>

      <div style={{ marginTop: 14 }}>
        <SpectatorRoleRow
          title="使用可能ポケモン"
          byRole={pickableByRole}
          note="（このGameで、ルール上“今”使用可能な一覧）"
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <SpectatorDraftSummary
          game={currentGame}
          teamAName={teamAName}
          teamBName={teamBName}
          pokemonByName={pokemonByName}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <SpectatorRoleRow
          title="使用不可ポケモン"
          byRole={unpickableByRole}
          note={config.fearlessScope === "series" ? "（過去 + このGame のNG）" : "（このGame内の重複NG）"}
        />
      </div>
    </main>
  );
}
