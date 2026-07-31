export type MediaPlayerCommandActions = {
  isPlaying: () => boolean
  play: () => void
  pause: () => void
  next: () => void
  previous: () => void
  seekBy: (seconds: number) => void
}

/** 将 Now Playing Center 命令分发到播放器动作；保持为纯逻辑以覆盖所有已声明命令。 */
export function dispatchMediaPlayerCommand(
  command: MediaPlayerRemoteCommand,
  actions: MediaPlayerCommandActions,
): void {
  switch (command) {
    case "togglePausePlay":
      if (actions.isPlaying()) actions.pause()
      else actions.play()
      break
    case "play": actions.play(); break
    case "pause": actions.pause(); break
    case "nextTrack": actions.next(); break
    case "previousTrack": actions.previous(); break
    case "seekForward": actions.seekBy(15); break
    case "seekBackward": actions.seekBy(-15); break
  }
}
