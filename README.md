# Taskyard wall board

A read-only schedule page for a wall TV. It shows the lists marked "Show on TV" in the
Taskyard iPhone app (Settings → Wall TV), refreshed every minute from iCloud.

Open `https://caqlishire-collab.github.io/taskyard-tv/` in the TV's browser and enter the board code.
`?demo=1` shows sample data.

`config.js` holds a CloudKit API token. It is read-only and only works from this site: it can
look up a board whose code you know, and cannot list or change boards.

Fonts: Geist by Vercel, SIL Open Font License (`Geist-OFL.txt`).
