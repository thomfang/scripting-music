import { Button, HStack, Image, Spacer } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { player } from "../../class/player"
import { PlayerInfo } from "./player_info"

type MiniPlayerProps = {
  onOpenPlayer?: () => void
  coverCornerRadius?: number
  contentInset?: number
}

export function MiniPlayer({
  onOpenPlayer,
  coverCornerRadius = 6,
  contentInset,
}: MiniPlayerProps = {}) {
  const { isPlaying, queue, currentIndex, playMode } = usePlayerState()
  const loops = playMode === "repeat-all" || playMode === "shuffle"
  const hasNext = loops || currentIndex < queue.length - 1
  return (
    <HStack
      spacing={15}
      padding={contentInset == null
        ? { horizontal: 15, vertical: 8 }
        : { horizontal: contentInset, vertical: contentInset }}
      font={"headline"}
      contentShape="rect"
      onTapGesture={onOpenPlayer}
    >
      <PlayerInfo coverCornerRadius={coverCornerRadius} />
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