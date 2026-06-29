import { Widget } from "scripting"
import { NowPlayingData } from "./widget/types"
import { SmallWidget } from "./widget/small"
import { MediumWidget } from "./widget/medium"
import { LargeWidget } from "./widget/large"

function WidgetView() {
  const data = Storage.get<NowPlayingData>("now_playing")
  const family = Widget.family
  if (family === "systemSmall") return <SmallWidget data={data} />
  if (family === "systemLarge") return <LargeWidget data={data} />
  return <MediumWidget data={data} />
}

Widget.present(<WidgetView />)