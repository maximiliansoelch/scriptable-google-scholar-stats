# Google Scholar Stats

A widget that tracks a Google Scholar profile: total citations, h-index, i10-index, and
citations per year. Runs on iPhone, iPad and Mac via [Scriptable](https://scriptable.app).

Works in all three widget sizes and follows your light or dark appearance. Medium and large add
a citations-per-year chart, and large also lists your most-cited papers. Tapping the widget opens
the profile.

<img src="docs/widget-mixed.png" alt="The widget in all three sizes, dark and light" width="820">

## Setup

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) from the App Store.
2. Add the script, either way:

   **One tap** — install it with [ScriptDude](https://scriptdu.de), which also tells you when a
   new version lands here:

   [![Download with ScriptDude](https://scriptdu.de/download.svg)](https://scriptdu.de?name=Google%20Scholar%20Stats&source=https%3A%2F%2Fraw.githubusercontent.com%2Fmaximiliansoelch%2Fscriptable-google-scholar-stats%2Fmain%2Fgoogle-scholar-stats.js&docs=https%3A%2F%2Fgithub.com%2Fmaximiliansoelch%2Fscriptable-google-scholar-stats)

   **By hand** — open
   [`google-scholar-stats.js`](https://raw.githubusercontent.com/maximiliansoelch/scriptable-google-scholar-stats/main/google-scholar-stats.js),
   select all and copy, then create a new script in Scriptable and paste it in.
3. Long-press your home screen, add a **Scriptable** widget, then long-press the widget and
   choose **Edit Widget**. Set *Script* to your script and *Parameter* to your Scholar profile
   URL or user ID.

Your user ID is the `user=` part of your profile URL — in
`https://scholar.google.com/citations?user=wFmJp2sAAAAJ`, it is `wFmJp2sAAAAJ`. The parameter
accepts either form.

To preview inside the Scriptable app before adding a widget, set `DEFAULT_PROFILE` at the top of
the script instead.

### Several profiles in one spot

The parameter belongs to the widget rather than to the script, so one script can drive as many
widgets as you like. Add a second Scriptable widget of the **same size**, point its *Parameter* at
another profile, then drag one widget on top of the other — iOS turns them into a stack you can
swipe through. Long-press the stack and turn off *Smart Rotate* if you would rather it stayed on
whichever profile you left it on.

### iPad and Mac

Scriptable keeps its scripts in iCloud Drive, so a script added on one device turns up on the
others by itself — on iPad, add the widget the same way.

On a Mac it can appear without installing anything: macOS Sonoma and later show your iPhone's
widgets when the phone is nearby and signed in to the same Apple Account, so the widget is in the
Mac's widget gallery alongside the native ones.

## Notes

- **Refresh timing is up to iOS.** The script asks to be refreshed every 6 hours, but the system
  decides when that actually happens. The `↻` time on the widget shows the last successful load.
- **Scholar has no public API**, so this reads the public profile page. Google can change that
  page at any time and break parsing, and refreshing too aggressively may get you rate-limited.
- **Nothing leaves your device** except the request to Google. No server, no analytics.

## License

[MIT](LICENSE). Not affiliated with, or endorsed by, Google.
