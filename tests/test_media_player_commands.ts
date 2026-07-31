import { dispatchMediaPlayerCommand, MediaPlayerCommandActions } from "../class/media_player_commands"
import { defineSuite, expect, TestSuite } from "./test_runner"

function recorder(playing: boolean) {
  const calls: string[] = []
  const actions: MediaPlayerCommandActions = {
    isPlaying: () => playing,
    play: () => calls.push("play"),
    pause: () => calls.push("pause"),
    next: () => calls.push("next"),
    previous: () => calls.push("previous"),
    seekBy: seconds => calls.push(`seek:${seconds}`),
  }
  return { actions, calls }
}

export const suite: TestSuite = defineSuite({
  name: "Player · Now Playing commands",
  cases: [
    {
      name: "play / pause / next / previous 分发到对应动作",
      fn: () => {
        const { actions, calls } = recorder(false)
        dispatchMediaPlayerCommand("play", actions)
        dispatchMediaPlayerCommand("pause", actions)
        dispatchMediaPlayerCommand("nextTrack", actions)
        dispatchMediaPlayerCommand("previousTrack", actions)
        expect(calls).toEqual(["play", "pause", "next", "previous"])
      }
    },
    {
      name: "togglePausePlay 按当前播放状态切换",
      fn: () => {
        const paused = recorder(false)
        dispatchMediaPlayerCommand("togglePausePlay", paused.actions)
        expect(paused.calls).toEqual(["play"])

        const playing = recorder(true)
        dispatchMediaPlayerCommand("togglePausePlay", playing.actions)
        expect(playing.calls).toEqual(["pause"])
      }
    },
    {
      name: "前后 seek 使用固定 15 秒增量",
      fn: () => {
        const { actions, calls } = recorder(false)
        dispatchMediaPlayerCommand("seekForward", actions)
        dispatchMediaPlayerCommand("seekBackward", actions)
        expect(calls).toEqual(["seek:15", "seek:-15"])
      }
    }
  ]
})
