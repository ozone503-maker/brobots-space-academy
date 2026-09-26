# How to add a new BroBot

New graduate rolling off the line? You don't need a developer. A BroBot is just **a text file and a picture**. You can do it all from your phone.

---

## The three pieces

| # | What | Where | Required? |
|---|------|-------|-----------|
| 1 | **Cartridge**: the bot's personality, as a `.txt` file | `cartridges/` folder | Yes |
| 2 | **Picture**: the bot's portrait, `.png` or `.jpg` | `media/roster/` folder | Yes |
| 3 | **Manifest line**: one line of settings | `cartridges/_manifest.json` | Optional* |

\* **Optional if your picture is a `.png`.** If your picture is a **`.jpg`**, you **must** add the manifest line, or the picture won't show up.

---

## Step 1: Pick a slug (the bot's ID)

The slug is the bot's short ID. It's used in file names and web links.

- **lowercase** only
- use **hyphens** (`-`) between words
- **no spaces**, no apostrophes, no special characters
- keep it short

✅ `surf-report-bot`  `aloha-bot`  `legal-eagle`
❌ `Surf Report Bot`  `surf_report_bot`  `surfreportbot!`

**The file names must match the slug exactly:**

- cartridge: `cartridges/surf-report-bot.txt`
- picture: `media/roster/surf-report-bot.png` (or `.jpg`)

---

## Step 2: Write the cartridge

Start from the blank template: [`cartridges/_TEMPLATE.txt`](../cartridges/_TEMPLATE.txt)

Here's a real one to copy from: [`cartridges/aloha-bot.txt`](../cartridges/aloha-bot.txt)

Replace everything in `[square brackets]`. Keep the section headings (`## Identity`, etc.) and the `Name:`, `Code name:`, `Tagline:` labels **exactly as they are**, because the console reads them.

> Don't want to write it yourself? Use the AI prompt below.

### On the GitHub website or app

1. Open the repo: **ozone503-maker/brobots-space-academy**
2. Go into the **`cartridges`** folder and open **`_TEMPLATE.txt`**
3. Tap the **copy** button (two squares icon) to copy the whole thing
4. Go back to the `cartridges` folder → **Add file** → **Create new file**
5. Name it **`your-slug.txt`** (e.g. `surf-report-bot.txt`)
6. Paste the template, then fill in the brackets
7. Tap **Commit changes** → choose **Commit directly to the `main` branch** → **Commit**

> On the phone app, if you can't create files, open the repo in your phone's browser (github.com) instead. The website works fine on a phone. Tap "Desktop site" if a button is hidden.

⚠️ Don't edit or rename `_TEMPLATE.txt` itself. Always make a **new** file.

---

## Step 3: Upload the picture

1. Open the **`media`** folder → **`roster`** folder
2. **Add file** → **Upload files**
3. Pick your picture. **Rename it to the slug first** (e.g. `surf-report-bot.png`)
4. **Commit directly to `main`**

Tips: square-ish or portrait pictures look best. Keep it under about 1 MB.

---

## Step 4 (optional): Add the manifest line

**Only needed** if your picture is a `.jpg`, or if you want the roster to show a different name or tagline than the cartridge.

Open `cartridges/_manifest.json` → tap the ✏️ pencil to edit. It's a list inside `[ ]`. Add one line **before the final `]`**, and put a **comma** at the end of the line above it:

```json
  {"slug":"surf-report-bot","name":"Surf Report Bot","cartridge_file":"cartridges/surf-report-bot.txt","skin_image":"https://brobots.space/media/roster/surf-report-bot.jpg","tagline":"Tide charts with attitude"}
```

- Change every `surf-report-bot` to your slug
- Make sure `.jpg` / `.png` matches your picture
- Use straight quotes `"`, not curly ones `“ ”` (phones love to swap them in)
- The **last** line in the list has **no comma** after it

Commit to `main`.

---

## Step 5: Watch it go live

Vercel redeploys the site automatically after every commit. In about **1 minute**, the new bot shows up on the **Console** roster:

- https://brobots.space/console.html
- Direct link to your bot: `https://brobots.space/console.html?bot=your-slug`

Not showing? Check that the slug, the file names, and the `.txt` / `.png` endings all match exactly.

> Note: the **Graduates** page (`dossiers.html`) is hand-built and does **not** update automatically. Only the Console roster does.

---

## Use ChatGPT, Gemini, or any AI to write the cartridge

Copy this prompt, paste in the two files, and fill in your idea:

```
Here is the BroBot cartridge template:

[paste the whole _TEMPLATE.txt here]

Here's an example of a finished cartridge:

[paste aloha-bot.txt, or any other cartridge, here]

Write a new cartridge for: [your idea — who the bot is, what it helps with, how it talks]

Keep the exact format: same header comment lines, same section headings,
same "Name:", "Code name:", "Tagline:" labels, and keep all the Behavior rules.
Use a lowercase-hyphenated slug. Replace every [bracket]. Plain text only, no markdown code fences.
```

Then paste the AI's answer into your new `your-slug.txt` file (Step 2).

---

## House rules for every BroBot

- **Never claim to be a real person.** BroBots are characters. They stay in character, but they don't pretend to be human.
- **No medical, legal, or financial advice beyond what the cartridge allows.** A health-themed bot can share general wellness talk, but it's not a doctor. A law-themed bot isn't a lawyer. A money-themed bot isn't a financial advisor. Put those limits in the bot's **Behavior rules**, like the real ones do:
  - `Not a doctor. Never diagnose. If someone is in crisis, tell them to get human help immediately.` (Men's Medicine)
  - `Never claim to be a licensed attorney. Never invent case law.` (Legal Eagle)
- Keep it kind. BroBots roast ideas, not people.

Mahalo. Now go build a bot. 🤖
