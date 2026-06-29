import { Button, HStack, Image, List, Navigation, NavigationStack, Section, Spacer, Text, Toolbar, ToolbarItem, VStack } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { player, PlayMode } from "../../class/player"

const PLAY_MODE_ICONS: Record<PlayMode, string> = {
  "sequential": "arrow.right",
  "repeat-all": "repeat",
  "repeat-one": "repeat.1",
  "shuffle": "shuffle",
}

const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  "sequential": "顺序播放",
  "repeat-all": "列表循环",
  "repeat-one": "单曲循环",
  "shuffle": "随机播放",
}

const PLAY_MODE_ORDER: PlayMode[] = ["sequential", "repeat-all", "repeat-one", "shuffle"]

export function QueueSheet() {
  const { queue, currentIndex, playMode } = usePlayerState()
  const dismiss = Navigation.useDismiss()

  function cyclePlayMode() {
    const idx = PLAY_MODE_ORDER.indexOf(playMode)
    player.setPlayMode(PLAY_MODE_ORDER[(idx + 1) % PLAY_MODE_ORDER.length])
  }

  const upcomingQueue = queue.slice(currentIndex < 0 ? 0 : currentIndex)

  return (
    <NavigationStack>
      <List
        navigationTitle="待播列表"
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarLeading">
              <Button action={() => dismiss()}>
                <Image systemName="xmark" />
              </Button>
            </ToolbarItem>
          </Toolbar>
        }
      >
        <Section>
          <Button action={cyclePlayMode}>
            <HStack>
              <Image systemName={PLAY_MODE_ICONS[playMode]} tint="accentColor" />
              <Text foregroundStyle="accentColor">{PLAY_MODE_LABELS[playMode]}</Text><Spacer />
            </HStack>
          </Button>
        </Section>
        <Section>
          {upcomingQueue.map((music, i) => {
            const idx = currentIndex < 0 ? i : currentIndex + i
            const isCurrent = idx === currentIndex
            return (
              <Button key={music.id} action={async () => {
                player.setQueue(queue, idx)
                await player.play(music)
              }}>
                <HStack spacing={12}>
                  <VStack alignment="leading" spacing={2}>
                    <Text font="headline" lineLimit={1} foregroundStyle={isCurrent ? "systemPink" : "label"}>
                      {music.title}
                    </Text>
                    <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
                      {music.artist}
                    </Text>
                  </VStack>
                  <Spacer />
                  {isCurrent && <Image systemName="waveform" tint="systemPink" />}
                </HStack>
              </Button>
            )
          })}
        </Section>
      </List>
    </NavigationStack>
  )
}