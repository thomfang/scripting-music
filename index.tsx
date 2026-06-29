import { Navigation, Script } from "scripting"
import { HomePage } from "./page/index"
import { player } from "./class/player"
import { downloadManager } from "./class/download_manager"

async function main() {
  try {
    Script.onResume(() => {
      // do nothing
    })

    await player.init()
    await downloadManager.init()
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