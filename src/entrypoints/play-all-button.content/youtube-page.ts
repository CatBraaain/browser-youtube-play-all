export default class YoutubePage {
  public static NAVIGATION_START_EVENT = "yt-navigate-start";
  public static NAVIGATION_END_EVENT = "yt-navigate-finish";

  public static addStyleForPlayAllButton() {
    const style = document.createElement("style");
    style.textContent = `
      .play-all-btn {
        background-color: #8000FF;
        color: #F1F1F1;

        height: 32px;
        min-width: 12px;

        display: inline-flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        margin-left: 12px;

        border-radius: 8px;
        padding: 0 12px;

        font-family: 'Roboto', 'Arial', sans-serif;
        font-size: 1.4rem;
        font-weight: 500;
        text-decoration: none;

        cursor: pointer;
      }

      .play-all-btn:hover,
      .play-all-btn:focus {
        background-color:#9B33FF;
      }
    `;
    document.head.appendChild(style);
  }

  public static get NavigationStartEvent(): string {
    return YoutubePage.NAVIGATION_START_EVENT;
  }

  public static get NavigationEndEvent(): string {
    return YoutubePage.NAVIGATION_END_EVENT;
  }
}
