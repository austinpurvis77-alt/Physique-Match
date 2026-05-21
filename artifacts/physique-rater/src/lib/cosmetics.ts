export interface Cosmetic {
  id: string;
  name: string;
  cost: number;
  description: string;
  prefix?: string;
  suffix?: string;
  nameClass: string;
}

export const COSMETICS: Cosmetic[] = [
  {
    id: "challenger",
    name: "CHALLENGER",
    cost: 100,
    description: "Stand out with a bold blue name",
    suffix: " [C]",
    nameClass: "text-blue-400 font-bold",
  },
  {
    id: "flash",
    name: "FLASH",
    cost: 150,
    description: "Cyan lightning name with ⚡ prefix",
    prefix: "⚡ ",
    nameClass: "text-cyan-400 font-bold",
  },
  {
    id: "beast",
    name: "BEAST MODE",
    cost: 200,
    description: "Fiery red name for true beasts",
    suffix: " 🔥",
    nameClass: "text-red-400 font-bold",
  },
  {
    id: "golden",
    name: "GOLDEN MOG",
    cost: 300,
    description: "Gold name that shines above the rest",
    nameClass: "text-yellow-400 font-bold",
  },
  {
    id: "inferno",
    name: "INFERNO",
    cost: 400,
    description: "Blazing orange name with fire prefix",
    prefix: "🔥 ",
    nameClass: "text-orange-500 font-bold",
  },
  {
    id: "king",
    name: "KING",
    cost: 600,
    description: "The ultimate flex. Crown prefix, gold display.",
    prefix: "👑 ",
    nameClass: "text-yellow-300 font-[family-name:--app-font-display] tracking-wider",
  },
];

export function getCosmeticById(id: string | null | undefined): Cosmetic | undefined {
  if (!id) return undefined;
  return COSMETICS.find(c => c.id === id);
}

export function renderName(
  displayName: string,
  cosmeticId: string | null | undefined
): { name: string; nameClass: string } {
  const cosmetic = getCosmeticById(cosmeticId);
  if (!cosmetic) return { name: displayName, nameClass: "" };
  const name = `${cosmetic.prefix ?? ""}${displayName}${cosmetic.suffix ?? ""}`;
  return { name, nameClass: cosmetic.nameClass };
}
