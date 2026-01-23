// app/data/pokemons.ts
import type { CSSProperties } from "react";

export type Role =
  | "アタック型"
  | "ディフェンス型"
  | "スピード型"
  | "バランス型"
  | "サポート型";

export type Pokemon = {
  name: string;
  role: Role;
  isMega?: boolean; // ✅ メガ進化フラグ（EXではなくこちらで管理）
};

export const ROLE_META: Record<
  Role,
  {
    short: string;
    badgeStyle: CSSProperties;
    headerStyle: CSSProperties;
    leftAccent: string;
  }
> = {
  // 🔴 アタック型
  "アタック型": {
    short: "ATK",
    badgeStyle: { background: "#fee2e2", border: "1px solid #ef4444", color: "#7f1d1d" },
    headerStyle: { color: "#991b1b" },
    leftAccent: "#ef4444",
  },

  // 🟣 バランス型
  "バランス型": {
    short: "BAL",
    badgeStyle: { background: "#ede9fe", border: "1px solid #8b5cf6", color: "#4c1d95" },
    headerStyle: { color: "#5b21b6" },
    leftAccent: "#8b5cf6",
  },

  // 🔵 スピード型（青）
  "スピード型": {
    short: "SPD",
    badgeStyle: { background: "#e0f2fe", border: "1px solid #0284c7", color: "#0c4a6e" },
    headerStyle: { color: "#0369a1" },
    leftAccent: "#0284c7",
  },

  // 🟢 ディフェンス型（緑）
  "ディフェンス型": {
    short: "DEF",
    badgeStyle: { background: "#dcfce7", border: "1px solid #22c55e", color: "#14532d" },
    headerStyle: { color: "#166534" },
    leftAccent: "#22c55e",
  },

  // 🟡 サポート型（黄色）
  "サポート型": {
    short: "SUP",
    badgeStyle: { background: "#fef9c3", border: "1px solid #eab308", color: "#713f12" },
    headerStyle: { color: "#854d0e" },
    leftAccent: "#eab308",
  },
};

// ロール検索のための簡易同義語（任意：増やしてOK）
const ROLE_SYNONYMS: Record<Role, string[]> = {
  "アタック型": ["アタック", "アタッカー", "atk", "attack"],
  "ディフェンス型": ["ディフェンス", "タンク", "def", "defense", "tank"],
  "スピード型": ["スピード", "アサシン", "spd", "speed", "assassin"],
  "バランス型": ["バランス", "ファイター", "bal", "balance", "fighter"],
  "サポート型": ["サポート", "サポーター", "sup", "support", "healer"],
};

// ✅ page.tsx が import しているので「export」必須
export function matchesPokemonSearch(p: Pokemon, rawQuery: string) {
  const q = rawQuery.replace(/\u3000/g, " ").trim().toLowerCase();
  if (!q) return true;

  const tokens = [
    p.name,
    p.role,
    ...(ROLE_SYNONYMS[p.role] ?? []),
    p.isMega ? "メガ メガ進化 mega" : "",
  ]
    .join(" ")
    .toLowerCase();

  return tokens.includes(q);
}

// ✅ 一覧（wikiwikiのロール別一覧 + ご指定のストライク追加）
export const POKEMON_LIST: Pokemon[] = [
  // --- アタック型 ---
  { name: "アローラキュウコン", role: "アタック型" },
  { name: "アローラライチュウ", role: "アタック型" },
  { name: "インテレオン", role: "アタック型" },
  { name: "ウッウ", role: "アタック型" },
  { name: "エースバーン", role: "アタック型" },
  { name: "エーフィ", role: "アタック型" },
  { name: "グレイシア", role: "アタック型" },
  { name: "グレンアルマ", role: "アタック型" },
  { name: "ゲッコウガ", role: "アタック型" },
  { name: "サーナイト", role: "アタック型" },
  { name: "シャンデラ", role: "アタック型" },
  { name: "ジュナイパー", role: "アタック型" },
  { name: "ジュラルドン", role: "アタック型" },
  { name: "ドラパルト", role: "アタック型" },
  { name: "ニンフィア", role: "アタック型" },
  { name: "ピカチュウ", role: "アタック型" },
  { name: "フシギバナ", role: "アタック型" },
  { name: "マフォクシー", role: "アタック型" },
  { name: "ミュウ", role: "アタック型" },
  { name: "ミュウツー(Y)", role: "アタック型", isMega: true }, // ✅指定：メガ進化扱い
  { name: "ミライドン", role: "アタック型" },
  { name: "ラティオス", role: "アタック型" },

  // --- ディフェンス型 ---
  { name: "イワパレス", role: "ディフェンス型" },
  { name: "オーロット", role: "ディフェンス型" },
  { name: "カビゴン", role: "ディフェンス型" },
  { name: "カメックス", role: "ディフェンス型" },
  { name: "シャワーズ", role: "ディフェンス型" },
  { name: "ヌメルゴン", role: "ディフェンス型" },
  { name: "ブラッキー", role: "ディフェンス型" },
  { name: "ホウオウ", role: "ディフェンス型" },
  { name: "マンムー", role: "ディフェンス型" },
  { name: "ヤドラン", role: "ディフェンス型" },
  { name: "ヨクバリス", role: "ディフェンス型" },
  { name: "ラプラス", role: "ディフェンス型" },

  // --- スピード型 ---
  { name: "アブソル", role: "スピード型" },
  { name: "ガラルギャロップ", role: "スピード型" },
  { name: "ゲンガー", role: "スピード型" },
  { name: "ゼラオラ", role: "スピード型" },
  { name: "ゾロアーク", role: "スピード型" },
  { name: "ダークライ", role: "スピード型" },
  { name: "ドードリオ", role: "スピード型" },
  { name: "ニャース", role: "スピード型" },
  { name: "ファイアロー", role: "スピード型" },
  { name: "マスカーニャ", role: "スピード型" },
  { name: "リーフィア", role: "スピード型" },

  // ✅ご指定：ストライクはスピード型（ハッサムと別扱い）
  { name: "ストライク", role: "スピード型" },

  // --- バランス型 ---
  { name: "アマージョ", role: "バランス型" },
  { name: "ウーラオス", role: "バランス型" },
  { name: "エンペルト", role: "バランス型" },
  { name: "カイリキー", role: "バランス型" },
  { name: "カイリュー", role: "バランス型" },
  { name: "ガブリアス", role: "バランス型" },
  { name: "ギャラドス", role: "バランス型" },
  { name: "メガギャラドス", role: "バランス型", isMega: true }, // ✅
  { name: "ギルガルド", role: "バランス型" },
  { name: "ザシアン", role: "バランス型" },
  { name: "スイクン", role: "バランス型" },
  { name: "ソウブレイズ", role: "バランス型" },
  { name: "タイレーツ", role: "バランス型" },
  { name: "ダダリン", role: "バランス型" },
  { name: "デカヌチャン", role: "バランス型" },
  { name: "パーモット", role: "バランス型" },
  { name: "バシャーモ", role: "バランス型" },
  { name: "ハッサム", role: "バランス型" }, // ✅ストライクと別
  { name: "バンギラス", role: "バランス型" },
  { name: "マッシブーン", role: "バランス型" },
  { name: "マリルリ", role: "バランス型" },
  { name: "ミミッキュ", role: "バランス型" },
  { name: "ミュウツー(X)", role: "バランス型", isMega: true }, // ✅
  { name: "メタグロス", role: "バランス型" },
  { name: "リザードン", role: "バランス型" },
  { name: "メガリザードンX", role: "バランス型", isMega: true }, // ✅
  { name: "メガリザードンY", role: "バランス型", isMega: true }, // ✅
  { name: "ルカリオ", role: "バランス型" },
  { name: "メガルカリオ", role: "バランス型", isMega: true }, // ✅

  // --- サポート型 ---
  { name: "キュワワー", role: "サポート型" },
  { name: "コダック", role: "サポート型" },
  { name: "ハピナス", role: "サポート型" },
  { name: "バリヤード", role: "サポート型" },
  { name: "ピクシー", role: "サポート型" },
  { name: "フーパ", role: "サポート型" },
  { name: "プクリン", role: "サポート型" },
  { name: "マホイップ", role: "サポート型" },
  { name: "ヤミラミ", role: "サポート型" },
  { name: "ラティアス", role: "サポート型" },
  { name: "ワタシラガ", role: "サポート型" },
];
