/** biome-ignore-all lint/complexity/useLiteralKeys: <> */

import { resolvePlaylistPath } from "./youtube-api";
import type { CategoryKind, SortKind } from "./youtube-dom";
import { YoutubeDOM } from "./youtube-dom";

type PlaylistMap = {
  [K in CategoryKind]: {
    [S in SortKind]: Promise<string>;
  };
};

export class Channel {
  private playlistMap!: PlaylistMap;

  private constructor(public readonly id: string) {}

  public static load(id: string): Channel {
    const channel = new Channel(id);
    channel.playlistMap = Object.fromEntries(
      YoutubeDOM.categories.map(
        (c) =>
          [
            c,
            Object.fromEntries(
              YoutubeDOM.sorts.map(
                (s) => [s, resolvePlaylistPath(id, c, s)] as const,
              ),
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
    const oldestPlaylistPath = await this.playlistMap[categoryKind]["Oldest"];
    const isValidCategory = oldestPlaylistPath !== "";
    if (isValidCategory) {
      return this.playlistMap[categoryKind][sortKind];
    } else {
      return "";
    }
  }
}
