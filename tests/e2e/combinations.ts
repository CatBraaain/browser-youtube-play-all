export type Route = "hard" | "soft1" | "soft2";
export type Category = "Videos" | "Shorts" | "Streams";
export type Sort = "Latest" | "Popular" | "Oldest";
export type Audience = "Public" | "Members only";

export type CellRow = { route: Route; category: Category; sort: Sort };
export type MenuEntry = { audience: Audience; category: Category; sort: Sort };

const routes: Route[] = ["hard", "soft1", "soft2"];
const categories: Category[] = ["Videos", "Shorts", "Streams"];
const first3Sorts: Sort[] = ["Latest", "Popular"];
const allSorts: Sort[] = ["Latest", "Popular", "Oldest"];
const membersCategories: Category[] = ["Videos", "Streams"];
const membersSorts: Sort[] = ["Latest", "Oldest"];

function cells(sorts: Sort[], cats: Category[] = categories): [Category, Sort][] {
  return cats.flatMap((category) => sorts.map((sort) => [category, sort] as [Category, Sort]));
}

function rows(combinations: [Category, Sort][]): CellRow[] {
  return routes.flatMap((route) =>
    combinations.map(([category, sort]) => ({ route, category, sort })),
  );
}

// D01 (@Apple, Public only): every category x sort x route.
export const d01First3Rows = rows(cells(first3Sorts));
export const d01OldestRows = rows(cells(["Oldest"]));

// D02 (@NASASpaceFlight): Public rows mirror D01's grid; Members-only rows
// cover the shown cells (Videos/Streams x Latest/Oldest) and the hidden cells
// (Videos/Streams Popular and every Shorts sort).
export const d02PublicFirst3Rows = rows(cells(first3Sorts));
export const d02PublicOldestRows = rows(cells(["Oldest"]));

export const d02MembersLatestRows = rows(cells(["Latest"], membersCategories));
export const d02MembersOldestRows = rows(cells(["Oldest"], membersCategories));

export const d02HiddenRows = rows([
  ...cells(["Popular"], ["Videos", "Streams"]),
  ...cells(allSorts, ["Shorts"]),
]);

// Menu entries per channel: the public-only channel lists the 9 public
// entries; the membership channel adds the 4 shown Members-only entries.
export const publicMenuEntries: MenuEntry[] = cells(allSorts).map(([category, sort]) => ({
  audience: "Public" as const,
  category,
  sort,
}));

export const nasaMenuEntries: MenuEntry[] = [
  ...publicMenuEntries,
  ...cells(membersSorts, membersCategories).map(([category, sort]) => ({
    audience: "Members only" as const,
    category,
    sort,
  })),
];

export const appleChannel = "@Apple";
export const nasaChannel = "@NASASpaceFlight";
