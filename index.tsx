import { Navigation, Script } from "scripting"
import { HomePage } from "./page/index"
import { player } from "./class/player"
import { initializeAppRuntime } from "./class/app_runtime"

async function main() {
  try {
    Script.onResume(() => {
      // do nothing
    })

    Script.enableMinimize()

    await initializeAppRuntime()
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