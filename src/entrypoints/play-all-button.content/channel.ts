import {
  MEMBERS_KINDS,
  MEMBERS_SORTS,
  resolveMembersPlaylistPath,
  resolvePlaylistPath,
} from "./youtube-api";
import type { MembersKind, MembersSortKind } from "./youtube-api";
import type { CategoryKind, SortKind } from "./youtube-dom";
import { YoutubeDOM } from "./youtube-dom";

type PlaylistMap = {
  [K in CategoryKind]: {
    [S in SortKind]: Promise<string>;
  };
};

type MembersMap = {
  [K in MembersKind]: {
    [S in MembersSortKind]: Promise<string>;
  };
};

export class Channel {
  private playlistMap!: PlaylistMap;
  private membersMap!: MembersMap;

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
    channel.membersMap = Object.fromEntries(
      MEMBERS_KINDS.map(
        (k) =>
          [
            k,
            Object.fromEntries(
              MEMBERS_SORTS.map(
                (s) => [s, resolveMembersPlaylistPath(id, k, s).catch(() => "")] as const,
              ),
            ),
          ] as const,
      ),
    ) as MembersMap;
    return channel;
  }

  public getPlaylistPath(categoryKind: CategoryKind, sortKind: SortKind): Promise<string> {
    return this.playlistMap[categoryKind][sortKind];
  }

  public getMembersPlaylistPath(
    membersKind: MembersKind,
    sortKind: MembersSortKind,
  ): Promise<string> {
    return this.membersMap[membersKind][sortKind];
  }
}
