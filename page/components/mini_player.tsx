import { Button, HStack, Image, Spacer } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { player } from "../../class/player"
import { PlayerInfo } from "./player_info"

export function MiniPlayer() {
  const { isPlaying, queue, currentIndex, playMode } = usePlayerState()
  const loops = playMode === "repeat-all" || playMode === "shuffle"
  const hasNext = loops || currentIndex < queue.length - 1
  return (
    <HStack spacing={15} padding={{ horizontal: 15 }} font={"headline"}>
      <PlayerInfo />
      <Spacer minLength={0} />
      <Button action={() => {
        if (isPlaying) {
          player.pause()
        } else {
          player.play()
        }
      }}>
        <Image systemName={isPlaying ? "pause.fill" : "play.fill"} />
      </Button>
      <Button action={() => player.next()} disabled={!hasNext}>
              <Image systemName={"forward.fill"} />
            </Button>
    </HStack>
  )
}