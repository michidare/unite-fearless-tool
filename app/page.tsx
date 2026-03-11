"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
function normalizeGameShape(g: Game, banCount: BanCount): Game {
  const fixTo = (arr: string[] | undefined, n: number) => {
    const base = Array.isArray(arr) ? arr.slice(0, n) : [];
    while (base.length < n) base.push("");
    return base.map((x) => (x ? normalizeName(x) : ""));
  };

  return {
    ...g,
    locked: typeof (g as any).locked === "boolean" ? (g as any).locked : false, // ✅追加
    bansA: fixTo((g as any).bansA, banCount),
    bansB: fixTo((g as any).bansB, banCount),
    picksA: fixTo((g as any).picksA, 5),
    picksB: fixTo((g as any).picksB, 5),
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

export default function Home() {
    const STORAGE_KEY_V2 = "unite-fearless:v2";
  const STORAGE_KEY_V1 = "unite-fearless:v1";
  const STORAGE_KEY_WRITE_TOKEN = "unite-fearless:write-token";

  const [writeToken, setWriteToken] = useState("");

  function saveWriteToken(next: string) {
    const v = next.trim();
    setWriteToken(v);
    try {
      if (v) {
        localStorage.setItem(STORAGE_KEY_WRITE_TOKEN, v);
      } else {
        localStorage.removeItem(STORAGE_KEY_WRITE_TOKEN);
      }
    } catch {
      // 無視
    }
  }

  async function ensureWriteToken() {
    const current = writeToken.trim();
    if (current) return current;

    const entered = window.prompt("観戦URL更新用のトークンを入力してください")?.trim() ?? "";
    if (!entered) return "";

    saveWriteToken(entered);
    return entered;
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

  useEffect(() => {
  const q = normalizeName(search);
  if (q) setAllRolesCollapsed(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [search]);

  // P2: 現在進行中のGame
const [currentGameNo, setCurrentGameNo] = useState<number>(1);

// ✅ P1: チーム名
const [teamAName, setTeamAName] = useState<string>("Team A");
const [teamBName, setTeamBName] = useState<string>("Team B");

// ✅ P3: ロック操作の履歴（Undoは直近のみ）
const [lockHistory, setLockHistory] = useState<number[]>([]);

function pruneErrorsByConfig(
  prev: Record<string, string>,
  format: Format,
  banCount: BanCount
) {
  const maxGameNo = format === "BO5" ? 5 : 3;

  const copy: Record<string, string> = {};
  for (const [k, v] of Object.entries(prev)) {
    // key: `${gameNo}-${side}-${slot}-${index}`
    const parts = k.split("-");
    if (parts.length !== 4) continue;

    const gameNo = Number(parts[0]);
    const slot = parts[2] as Slot;
    const index = Number(parts[3]);

    if (!(gameNo >= 1 && gameNo <= maxGameNo)) continue;
    if (slot === "ban" && index >= banCount) continue;

    copy[k] = v;
  }
  return copy;
}


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
      collectUsedFromGame(g).forEach((name) => used.add(name));
    }
    return Array.from(used).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function encodeUtf8Base64(obj: any) {
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
  setMounted(true);

  try {
    const savedWriteToken = localStorage.getItem(STORAGE_KEY_WRITE_TOKEN) ?? "";
    if (savedWriteToken.trim()) {
      setWriteToken(savedWriteToken.trim());
    }
  } catch {
    // 無視
  }

  (async () => {
    try {
      const params = new URLSearchParams(window.location.search);

      // ✅ 1) spectateId（短縮ID）優先で復元
      const spectateId = params.get("spectateId");
      if (spectateId) setSpectateId(spectateId); // ✅ 観戦側のポーリング対象

      if (spectateId) {
        const res = await fetch(`/api/spectate?id=${encodeURIComponent(spectateId)}`);
        if (res.ok) {
          const data = (await res.json()) as {
            payload?: {
              config?: SeriesConfig;
              games?: Game[];
              currentGameNo?: number;
              teamAName?: string;
              teamBName?: string;
              lockHistory?: number[];
            };
          };

          const decoded = data.payload;
          if (decoded) {
            const nextConfig: SeriesConfig = {
              format: decoded.config?.format ?? "BO5",
              banCount: decoded.config?.banCount ?? 3,
              fearlessScope: decoded.config?.fearlessScope ?? "series",
              ngIncludesBans: decoded.config?.ngIncludesBans ?? true,
            };

            setConfig(nextConfig);

            const baseGames = decoded.games ?? createGames(nextConfig.format, nextConfig.banCount);
            setGames(normalizeGamesForConfig(baseGames as Game[], nextConfig.format, nextConfig.banCount));

            const loaded = decoded.currentGameNo ?? 1;
            const maxGameNo = nextConfig.format === "BO5" ? 5 : 3;
            const fixed =
              typeof loaded !== "number" ? 1 : loaded < 1 ? 1 : loaded > maxGameNo ? maxGameNo : loaded;
            setCurrentGameNo(fixed);

            setTeamAName(typeof decoded.teamAName === "string" && decoded.teamAName.trim() ? decoded.teamAName : "Team A");
            setTeamBName(typeof decoded.teamBName === "string" && decoded.teamBName.trim() ? decoded.teamBName : "Team B");

            setLockHistory(
              Array.isArray(decoded.lockHistory)
                ? decoded.lockHistory.filter((n) => typeof n === "number")
                : []
            );

            setIsReadOnly(true);
            return; // ✅ spectateId 復元成功なら以降は実行しない
          }
        }

        // spectateId が不正/期限切れ等の場合はフォールバック（LocalStorageへ）
      }

      // ✅ 2) 旧方式 spectate（base64）で復元
      const spectate = params.get("spectate");
      if (spectate) {
        const decoded = decodeUtf8Base64<{
          config?: SeriesConfig;
          games?: Game[];
          currentGameNo?: number;
          teamAName?: string;
          teamBName?: string;
          lockHistory?: number[];
        }>(spectate);

        if (decoded) {
          const nextConfig: SeriesConfig = {
            format: decoded.config?.format ?? "BO5",
            banCount: decoded.config?.banCount ?? 3,
            fearlessScope: decoded.config?.fearlessScope ?? "series",
            ngIncludesBans: decoded.config?.ngIncludesBans ?? true,
          };

          setConfig(nextConfig);

          const baseGames = decoded.games ?? createGames(nextConfig.format, nextConfig.banCount);
          setGames(normalizeGamesForConfig(baseGames as Game[], nextConfig.format, nextConfig.banCount));

          const loaded = decoded.currentGameNo ?? 1;
          const maxGameNo = nextConfig.format === "BO5" ? 5 : 3;
          const fixed =
            typeof loaded !== "number" ? 1 : loaded < 1 ? 1 : loaded > maxGameNo ? maxGameNo : loaded;
          setCurrentGameNo(fixed);

          setTeamAName(typeof decoded.teamAName === "string" && decoded.teamAName.trim() ? decoded.teamAName : "Team A");
          setTeamBName(typeof decoded.teamBName === "string" && decoded.teamBName.trim() ? decoded.teamBName : "Team B");

          setLockHistory(
            Array.isArray(decoded.lockHistory)
              ? decoded.lockHistory.filter((n) => typeof n === "number")
              : []
          );

          setIsReadOnly(true);
          return; // ✅ URL復元したらLocalStorage復元はスキップ
        }
      }

      // ✅ 3) LocalStorage から復元（v2優先、無ければv1）
      const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
      const raw = rawV2 ?? localStorage.getItem(STORAGE_KEY_V1);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        config?: SeriesConfig;
        games?: Game[];
        currentGameNo?: number;
        teamAName?: string;
        teamBName?: string;
        lockHistory?: number[];
      };

      const nextConfig: SeriesConfig = {
        format: parsed.config?.format ?? "BO5",
        banCount: parsed.config?.banCount ?? 3,
        fearlessScope: parsed.config?.fearlessScope ?? "series",
        ngIncludesBans: parsed.config?.ngIncludesBans ?? true,
      };

      setConfig(nextConfig);

      const baseGames = parsed.games ?? createGames(nextConfig.format, nextConfig.banCount);
      setGames(normalizeGamesForConfig(baseGames as Game[], nextConfig.format, nextConfig.banCount));

      const loaded = parsed.currentGameNo ?? 1;
      const maxGameNo = nextConfig.format === "BO5" ? 5 : 3;
      const fixed =
        typeof loaded !== "number" ? 1 :
        loaded < 1 ? 1 :
        loaded > maxGameNo ? maxGameNo :
        loaded;

      setCurrentGameNo(fixed);

      setTeamAName(typeof parsed.teamAName === "string" && parsed.teamAName.trim() ? parsed.teamAName : "Team A");
      setTeamBName(typeof parsed.teamBName === "string" && parsed.teamBName.trim() ? parsed.teamBName : "Team B");

      setLockHistory(
        Array.isArray(parsed.lockHistory)
          ? parsed.lockHistory.filter((n) => typeof n === "number")
          : []
      );
    } catch {
      // 破損は無視
    }
  })();

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!res.ok) return;

      const data = (await res.json()) as {
        payload?: {
          config?: SeriesConfig;
          games?: Game[];
          currentGameNo?: number;
          teamAName?: string;
          teamBName?: string;
          lockHistory?: number[];
        };
      };

      if (!alive) return;
      if (!data.payload) return;

      const decoded = data.payload;

      const nextConfig: SeriesConfig = {
        format: decoded.config?.format ?? "BO5",
        banCount: decoded.config?.banCount ?? 3,
        fearlessScope: decoded.config?.fearlessScope ?? "series",
        ngIncludesBans: decoded.config?.ngIncludesBans ?? true,
      };

      setConfig(nextConfig);

      const baseGames = decoded.games ?? createGames(nextConfig.format, nextConfig.banCount);
      setGames(normalizeGamesForConfig(baseGames as Game[], nextConfig.format, nextConfig.banCount));

      const loaded = decoded.currentGameNo ?? 1;
      const max = nextConfig.format === "BO5" ? 5 : 3;
      setCurrentGameNo(typeof loaded === "number" ? Math.min(Math.max(1, loaded), max) : 1);

      setTeamAName(typeof decoded.teamAName === "string" && decoded.teamAName.trim() ? decoded.teamAName : "Team A");
      setTeamBName(typeof decoded.teamBName === "string" && decoded.teamBName.trim() ? decoded.teamBName : "Team B");

      setLockHistory(Array.isArray(decoded.lockHistory) ? decoded.lockHistory.filter((n) => typeof n === "number") : []);
    } catch {
      // 無視
    }
  };

  tick(); // 初回即時
  const id = window.setInterval(tick, 2000); // ✅ 2秒（API負荷を約1/2）


  return () => {
    alive = false;
    window.clearInterval(id);
  };
}, [mounted, isReadOnly, spectateId]);


  // 永続化（v2）
  useEffect(() => {
  if (!mounted) return;
  if (isReadOnly) return; // ✅ 観戦URLでは永続化しない
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
  if (isReadOnly) return;        // 観戦画面では送らない
  if (!spectateId) return;       // 観戦URL未発行なら送らない
  if (!writeToken.trim()) return; // トークン未入力なら送らない

  const payload = { config, games, currentGameNo, teamAName, teamBName, lockHistory };

  const t = window.setTimeout(async () => {
    try {
      await fetch("/api/spectate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-spectate-token": writeToken.trim(),
        },
        body: JSON.stringify({ id: spectateId, payload }),
      });
    } catch {
      // 通信失敗は無視（次回更新で再送される）
    }
  }, 400);

  return () => window.clearTimeout(t);
}, [mounted, isReadOnly, spectateId, writeToken, config, games, currentGameNo, teamAName, teamBName, lockHistory]);



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
    const token = await ensureWriteToken();
    if (!token) {
      alert("トークンが未入力のため、観戦URLを発行できません。");
      return;
    }

    const payload = { config, games, currentGameNo, teamAName, teamBName, lockHistory };

    // ✅ APIに保存して短縮IDを受け取る
    const res = await fetch("/api/spectate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-spectate-token": token,
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

    const data = (await res.json()) as { id?: string };
    const id = (data.id ?? "").trim();

    if (!id) {
      // フォールバック：旧方式（長いURL）
      const b64 = encodeUtf8Base64(payload);
      const url = `${window.location.origin}${window.location.pathname}?spectate=${encodeURIComponent(b64)}`;
      setSpectatorUrl(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
      return;
    }

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
  ※ 観戦URLは<strong>読み取り専用</strong>です。配信・共有用途にご利用ください。
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
            onChange={(e) => setSearch(e.target.value)}
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
  currentGameNo: number; // ✅ サーバ（管理側）の現在Game
  getNgSetForDisplay: (gameNo: number) => Set<string>;
}) {

  const { config, games, currentGameNo, getNgSetForDisplay } = props;

// ✅ 観戦者が見ているGame（Prev/Nextで変わるのはこれ）
const [viewGameNo, setViewGameNo] = useState<number>(currentGameNo);

// ✅ 最後に受け取ったサーバGame（追従判定用）
const lastServerGameNoRef = useRef<number>(currentGameNo);

// ✅ サーバの currentGameNo が変わったとき：観戦側がまだ手動で動かしていなければ追従する
useEffect(() => {
  const lastServer = lastServerGameNoRef.current;
  const viewerIsFollowing = viewGameNo === lastServer;

  lastServerGameNoRef.current = currentGameNo;

  if (viewerIsFollowing) setViewGameNo(currentGameNo);
}, [currentGameNo, viewGameNo]);
 // eslint-disable-line react-hooks/exhaustive-deps

// ✅ BO3/BO5 切替などで範囲外になった場合はクランプ
useEffect(() => {
  const max = config.format === "BO5" ? 5 : 3;
  setViewGameNo((n) => Math.min(Math.max(1, n), max));
}, [config.format]);


  const maxGameNo = config.format === "BO5" ? 5 : 3;

    const currentGame = useMemo(
  () => games.find((g) => g.gameNo === viewGameNo),
  [games, viewGameNo]
);

  // 現在Gameの「使用不可（NG）」集合（表示ルールは既存ロジックを流用）
  const ngSet = useMemo(() => getNgSetForDisplay(viewGameNo), [getNgSetForDisplay, viewGameNo]);


  // 全ポケモンを「Pick可能 / 使用不可」に分割
  const pickable = useMemo(() => {
    return POKEMON_LIST.filter((p) => !ngSet.has(p.name));
  }, [ngSet]);

  const unpickable = useMemo(() => {
    return POKEMON_LIST.filter((p) => ngSet.has(p.name));
  }, [ngSet]);

  // ロール別にまとめる（横並び表示用）
  const groupByRole = (list: Pokemon[]) => {
    const map = new Map<Role, Pokemon[]>();
    for (const r of ROLE_ORDER) map.set(r, []);
    for (const p of list) map.get(p.role)!.push(p);
    for (const r of ROLE_ORDER) {
      map.set(
        r,
        (map.get(r) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "ja"))
      );
    }
    return map;
  };

  const pickableByRole = useMemo(() => groupByRole(pickable), [pickable]);
  const unpickableByRole = useMemo(() => groupByRole(unpickable), [unpickable]);

  // ✅ 名前→Pokemon（role判定用）
const POKEMON_BY_NAME = useMemo(() => {
  return new Map<string, Pokemon>(POKEMON_LIST.map((p) => [p.name, p]));
}, []);


    // ✅ UNITE風（観戦UI専用）カラートークン
  const UNITE = {
    bg: "#0b1020",         // 全体背景（深いネイビー）
    bg2: "#0f1630",        // パネル背景
    panel: "#111a33",      // カード面
    border: "rgba(255,255,255,0.10)",
    text: "#eaf0ff",
    text2: "rgba(234,240,255,0.78)",
    text3: "rgba(234,240,255,0.55)",

    // ユナイトっぽい “紫×オレンジ×シアン”
    purple: "#7c3aed",
    purple2: "#a78bfa",
    orange: "#f59e0b",
    cyan: "#22d3ee",

    // 状態表現
    ok: "rgba(34,211,238,0.18)",
    ng: "rgba(245,158,11,0.18)",
  };

  const shadowSoft = "0 10px 30px rgba(0,0,0,0.35)";
  const glowPurple = "0 0 0 1px rgba(124,58,237,0.35), 0 0 24px rgba(124,58,237,0.25)";
  const glowCyan   = "0 0 0 1px rgba(34,211,238,0.28), 0 0 22px rgba(34,211,238,0.18)";

    const PANEL: CSSProperties = {
    border: `1px solid ${UNITE.border}`,
    borderRadius: 16,
    padding: 14,
    background: `linear-gradient(180deg, ${UNITE.bg2} 0%, ${UNITE.panel} 100%)`,
    color: UNITE.text,
    boxShadow: shadowSoft,
  };


  // ✅ チップ（全セクション共通）：白背景・黒文字・タイプ別縁取り（左アクセント）
const chipStyle = (accent: string): CSSProperties => ({
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 900,
  fontSize: 12,
  color: "#111827",      // ✅ 黒文字
  background: "white",   // ✅ 白背景
  boxShadow: `inset 3px 0 0 ${accent}`, // ✅ 左アクセント
  whiteSpace: "nowrap",
});


  const RoleRow = (props2: { title: string; byRole: Map<Role, Pokemon[]>; note?: string }) => {
    const { title, byRole, note } = props2;
    return (
      <section style={PANEL}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{title}</h2>
          {note ? <div style={{ fontSize: 12, color: UNITE.text2 }}>{note}</div> : null}

        </div>

        {/* 横並び（ロール別カラム） */}
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
  <span key={p.name} style={chipStyle(meta.leftAccent)}>
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
  };

    const DraftSummary = () => {
    const g = currentGame;
    if (!g) return null;

    const bansA = g.bansA.filter(Boolean);
    const bansB = g.bansB.filter(Boolean);
    const picksA = g.picksA.filter(Boolean);
    const picksB = g.picksB.filter(Boolean);

    const Card = (props3: { title: string; items: string[] }) => {
      const { title, items } = props3;
      return (
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "white" }}>
          <div style={{ fontWeight: 900, marginBottom: 6, color: "#000000" }}>{title}</div>

          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: TEXT.muted }}>未入力</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {items.map((x, i) => {
  const p = POKEMON_BY_NAME.get(x);
  const accent = p ? ROLE_META[p.role].leftAccent : "#9ca3af"; // 見つからない時はグレー
  return (
    <span key={`${title}-${x}-${i}`} style={chipStyle(accent)}>
      {x}
    </span>
  );
})}

            </div>
          )}
        </div>
      );
    };

    return (
      <section style={PANEL}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>このGameのBAN / PICK</h2>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#7700ff" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Team A</div>
            <div style={{ display: "grid", gap: 10 }}>
              <Card title="BAN" items={bansA} />
              <Card title="PICK" items={picksA} />
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#ff8800" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Team B</div>
            <div style={{ display: "grid", gap: 10 }}>
              <Card title="BAN" items={bansB} />
              <Card title="PICK" items={picksB} />
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", background: "#f3f4f6", minHeight: "100vh" }}>
      {/* 観戦ヘッダ */}
      <header style={{ ...PANEL, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>観戦モード（読み取り専用）</h1>
          <div style={{ marginTop: 6, fontSize: 12, color: TEXT.secondary }}>
            Bo={config.format} / Fearless={config.fearlessScope === "series" ? "Global(シリーズ)" : "GameOnly(ゲーム内)"} / NG表示={config.ngIncludesBans ? "BAN+PICK" : "PICKのみ"}
          </div>
        </div>

        {/* Game切替 */}
<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
  <button
    type="button"
    onClick={() => setViewGameNo((n) => Math.max(1, n - 1))}
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
    {/* 👇 ライブでないときだけ表示 */}
    {viewGameNo !== currentGameNo && (
      <span style={{ marginLeft: 6, fontSize: 11, color: "#dc2626" }}>
        （過去表示中）
      </span>
    )}
  </div>

  <button
    type="button"
    onClick={() => setViewGameNo((n) => Math.min(maxGameNo, n + 1))}
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

  {/* ✅ ここが追加ボタン */}
  {viewGameNo !== currentGameNo && (
    <button
      type="button"
      onClick={() => setViewGameNo(currentGameNo)}
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
      🔴 Liveへ戻る
    </button>
  )}
</div>

      </header>

            {/* 上段：使用可能 */}
      <div style={{ marginTop: 14 }}>
        <RoleRow
          title="使用可能ポケモン"
          byRole={pickableByRole}
          note="（このGameで、ルール上“今”使用可能な一覧）"
        />
      </div>

      {/* 中段：このGameのBAN/PICK */}
      <div style={{ marginTop: 14 }}>
        <DraftSummary />
      </div>

      {/* 下段：使用不可 */}
      <div style={{ marginTop: 14 }}>
        <RoleRow
          title="使用不可ポケモン"
          byRole={unpickableByRole}
          note={config.fearlessScope === "series" ? "（過去 + このGame のNG）" : "（このGame内の重複NG）"}
        />
      </div>
    </main>
  );
}
