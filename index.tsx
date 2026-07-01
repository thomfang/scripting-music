import { Navigation, Script } from "scripting"
import { HomePage } from "./page/index"
import { player } from "./class/player"
import { downloadManager } from "./class/download_manager"
import { downloadCenter } from "./class/download_center"

async function main() {
  try {
    Script.onResume(() => {
      // do nothing
    })

    Script.enableMinimize()

    await player.init()
    await downloadManager.init()
    await downloadCenter.init()
    await Navigation.present({
      element: <HomePage />,
      modalPresentationStyle: "overFullScreen"
    })
    if (player.getState() === "playing") {
      await player.pause()
    }
    Script.exit()
  } catch (e) {
    console.present().then(Script.exit)
    console.error(e)
  }
}

main()