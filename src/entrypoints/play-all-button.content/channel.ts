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
                (s) => [s, resolvePlaylistPath(id, c, s).catch(() => "")] as const,
              ),
            ),
          ] as const,
      ),
    ) as PlaylistMap;
    return channel;
  }

  public getPlaylistPath(categoryKind: CategoryKind, sortKind: SortKind): Promise<string> {
    return this.playlistMap[categoryKind][sortKind];
  }
}
