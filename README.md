# Discord history tracker browser mode hotfix

## What is it?

[Discord History Tracker](https://github.com/chylex/Discord-History-Tracker) is a tool for storing local chat history from the Discord service.
Older versions worked by injecting javascript code in the developer tools window (in both browser and standalone desktop client based on Electon) that read through channel or channels, compacted all scraped data into JSON structure and offered a download.

As of time of writing (17.11.2023), there is newer iteration of this process based on C# server with separate GUI that can emit the injecter script that now communicates with this server. This doesn't require storing whole history in server memory and could be more flexible, but does require higher degree of trust from a security perspective. It also uses a different storage format, the SQLite database.

The browser-only version is still being developed, but [currently doesn't work](https://github.com/chylex/Discord-History-Tracker/issues/230). In that issue, it's mentioned that the injecter script from the C# version still works correctly.

I've been using the browser-only version in the past and wanted to stick with the original data format, so I've looked for fastest possible fix by taking the injecter stript from C# version and running it without server. This solution handles at least the simple case of single channel backup correctly.

## How to use it

1. Get to developer tools of Discord. For desktop clients, the usual shortcut CTRL+SHIFT+I is disabled by default, you should follow semi-official guide from [reddit](https://www.reddit.com/r/discordapp/comments/sc61n3/comment/hu4fw5x/) to enable it. On Windows, that's adding `"DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING": true` in `%appdata%/discord/settings.json` config file.

1. Paste the contents of `bootstrap.js` into console. If the Discord version is compatible, you'd see a new overlay controls.

1. Select a channel, press `Start tracking`. Once done, go back to console, type `SAVE.toJson()`, press Enter and copy the emitted string (right click on the output should work). This string is the contents of the JSON file in the legacy format. Storing data from multiple channels is untested and likely won't work due to known bug.

1. To scrape a different channel, type `SAVE_RESET()` first to clean the cache, then go to previous point.

1. There a minor error in the created files. I've opted to not investigate further and instead added a [jq](https://github.com/jqlang/jq) script wrapped in a bash shell script that fixes the known problem. It patches the file in place. Use it as `fixup-dump.sh my-channel-history.dht`.

1. To visualize the JSON files, known working copy of the viewer HTML helper from DHT is included.

## Misc info

Based on [v30 of desktop version](https://github.com/chylex/Discord-History-Tracker/tree/d35280a6a6fed6accf951925d1927fc854204399) and [v31e of browser-only version](https://github.com/chylex/Discord-History-Tracker/tree/a20ce8ee71ff4f20e7a469080c5e004f7d306c59).

The injecter script in C# codebase (aka the original bootstap.js) is a template that required some manual substitutions.

Originally, I thought I'd just use the C# injecter script unchanged, use simple HTTP server that just logs the requests and post-process these data to a correct shape. It's doable, as the only place where server's feedback is required is the part that tells the script whether it should continue scraping messages and that can be easily hardcoded in the script as "yes".

However, that approach would be too much work, so I've taken the JSON file output logic from the latest browser-only version and patched the places where the HTTP calls were originally done.

Thanks goes the authors of the DHT, as the code was well decomposed to make this fast and easy enough.
