/** biome-ignore-all lint/complexity/useLiteralKeys: <> */

import type { CategoryKind, SortKind } from "./category-tab";
import { resolvePlaylistPath } from "./youtube-api";

const categories: CategoryKind[] = ["Videos", "Shorts", "Streams"];
const sorts: SortKind[] = ["Latest", "Popular", "Oldest"];

type PlaylistMap = {
  [K in CategoryKind]: {
    [S in SortKind]: Promise<string>;
  };
};

export class ChannelMeta {
  private playlistMap!: PlaylistMap;

  private constructor(public readonly id: string) {}

  public static async create(id: string): Promise<ChannelMeta> {
    const channel = new ChannelMeta(id);
    channel.playlistMap = Object.fromEntries(
      categories.map(
        (c) =>
          [
            c,
            Object.fromEntries(
              sorts.map((s) => [s, resolvePlaylistPath(id, c, s)] as const),
            ),
          ] as const,
      ),
    ) as PlaylistMap;
    return channel;
  }

  public async getPlaylistPath(
    categoryKind: CategoryKind,
    sortKind: SortKind,
  ): Promise<string> {
    const isInvalidable =
      categoryKind in ["Shorts", "Streams"] &&
      sortKind in ["Latest", "Popular"];
    if (isInvalidable) {
      const oldest = await this.playlistMap[categoryKind]["Oldest"];
      if (oldest === "") {
        return "";
      }
    }

    return this.playlistMap[categoryKind][sortKind];
  }
}
